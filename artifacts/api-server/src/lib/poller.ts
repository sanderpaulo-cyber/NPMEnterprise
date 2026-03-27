import { randomUUID } from "crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  alertsTable,
  metricsTable,
  nodeArpEntriesTable,
  nodeEnvironmentSensorsTable,
  nodeInterfacesTable,
  nodeMacEntriesTable,
  nodeVlansTable,
  nodesTable,
  snmpCredentialsTable,
  type SnmpCredentialRecord,
} from "@workspace/db/schema";
import { logger } from "./logger";
import { icmpPingOnce } from "./icmp-ping";
import { persistNodePortProfiles } from "./l2-correlation";
import { fetchSnmpPollSnapshot } from "./snmp-client";
import { syncTopologyFromCdp, syncTopologyFromLldp } from "./topology-engine";

function useSimulatedPolling(): boolean {
  return process.env.NETWORK_POLLING_MODE === "simulated";
}

interface PollerState {
  running: boolean;
  activeWorkers: number;
  totalPolled: number;
  successCount: number;
  lastCycleMs: number;
  queueDepth: number;
  pollsThisSecond: number;
  pollsPerSecond: number;
}

const state: PollerState = {
  running: false,
  activeWorkers: 0,
  totalPolled: 0,
  successCount: 0,
  lastCycleMs: 0,
  queueDepth: 0,
  pollsThisSecond: 0,
  pollsPerSecond: 0,
};

let pollerInterval: ReturnType<typeof setInterval> | null = null;
let rateInterval: ReturnType<typeof setInterval> | null = null;

type WsBroadcastFn = (msg: object) => void;
let wsBroadcast: WsBroadcastFn = () => {};

export function setWsBroadcast(fn: WsBroadcastFn) {
  wsBroadcast = fn;
}

export function getPollerStatus() {
  return { ...state };
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function inferAlertType(input: {
  reachable: boolean;
  cpuUsage?: number | null;
  memUsage?: number | null;
  packetLoss: number;
  latency?: number | null;
}) {
  if (!input.reachable) return "node_down";
  if ((input.cpuUsage ?? 0) >= 90) return "cpu_high";
  if ((input.memUsage ?? 0) >= 90) return "mem_high";
  if (input.packetLoss >= 100) return "packet_loss";
  if ((input.latency ?? 0) >= 150) return "latency_high";
  return null;
}

async function resolveNodeCredential(node: {
  credentialId: string | null;
  snmpVersion: "v1" | "v2c" | "v3" | null;
  snmpCommunity: string | null;
}): Promise<SnmpCredentialRecord | null> {
  if (node.credentialId) {
    const [credential] = await db
      .select()
      .from(snmpCredentialsTable)
      .where(
        and(
          eq(snmpCredentialsTable.id, node.credentialId),
          eq(snmpCredentialsTable.enabled, true),
        ),
      )
      .limit(1);
    if (credential) return credential;
  }

  if (node.snmpVersion === "v1" || node.snmpVersion === "v2c") {
    return {
      id: `inline-${node.snmpVersion}-${node.snmpCommunity ?? "public"}`,
      name: "inline-node-credential",
      version: node.snmpVersion,
      community: node.snmpCommunity ?? "public",
      username: null,
      authProtocol: "none",
      authPassword: null,
      privProtocol: "none",
      privPassword: null,
      port: 161,
      timeoutMs: 2000,
      retries: 1,
      enabled: true,
      createdAt: new Date(),
    };
  }

  return null;
}

async function createAlertIfNeeded(input: {
  nodeId: string;
  nodeName: string;
  reachable: boolean;
  cpuUsage?: number | null;
  memUsage?: number | null;
  packetLoss: number;
  latency?: number | null;
}) {
  const type = inferAlertType(input);
  if (!type) return;

  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [recent] = await db
    .select()
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.nodeId, input.nodeId),
        eq(alertsTable.type, type),
        gte(alertsTable.createdAt, cutoff),
      ),
    )
    .orderBy(desc(alertsTable.createdAt))
    .limit(1);
  if (recent) return;

  let message = `Issue detected on ${input.nodeName}`;
  let severity: "critical" | "warning" | "info" = "warning";
  if (!input.reachable) {
    message = `${input.nodeName} is unreachable`;
    severity = "critical";
  } else if (type === "cpu_high") {
    message = `CPU usage at ${input.cpuUsage?.toFixed(1)}% on ${input.nodeName}`;
  } else if (type === "mem_high") {
    message = `Memory usage at ${input.memUsage?.toFixed(1)}% on ${input.nodeName}`;
  } else if (type === "latency_high") {
    message = `Latency at ${input.latency?.toFixed(1)} ms on ${input.nodeName}`;
  } else if (type === "packet_loss") {
    message = `Packet loss detected on ${input.nodeName}`;
  }

  const alertId = randomUUID();
  await db.insert(alertsTable).values({
    id: alertId,
    nodeId: input.nodeId,
    nodeName: input.nodeName,
    severity,
    type,
    message,
    acknowledged: false,
  });

  wsBroadcast({
    type: "alert",
    alertId,
    nodeId: input.nodeId,
    nodeName: input.nodeName,
    severity,
    message,
    timestamp: new Date().toISOString(),
  });
}

async function createInterfaceAlerts(input: {
  nodeId: string;
  nodeName: string;
  interfaces?: NonNullable<Awaited<ReturnType<typeof fetchSnmpPollSnapshot>>>["interfaces"];
}) {
  const interfaces = input.interfaces ?? [];
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);

  for (const iface of interfaces) {
    const issues: Array<{
      type: string;
      severity: "critical" | "warning" | "info";
      message: string;
    }> = [];

    if (iface.adminStatus === "up" && iface.operStatus !== "up") {
      issues.push({
        type: "interface_down",
        severity: "warning",
        message: `${input.nodeName}: interface ${iface.name} está admin up / oper ${iface.operStatus}`,
      });
    }

    if (iface.speedBps && iface.speedBps > 0) {
      const inUtil = ((iface.inBps ?? 0) / iface.speedBps) * 100;
      const outUtil = ((iface.outBps ?? 0) / iface.speedBps) * 100;
      const maxUtil = Math.max(inUtil, outUtil);
      if (maxUtil >= 85) {
        issues.push({
          type: "interface_high_util",
          severity: maxUtil >= 95 ? "critical" : "warning",
          message: `${input.nodeName}: interface ${iface.name} com utilização de ${maxUtil.toFixed(1)}%`,
        });
      }
    }

    for (const issue of issues) {
      const [recent] = await db
        .select()
        .from(alertsTable)
        .where(
          and(
            eq(alertsTable.nodeId, input.nodeId),
            eq(alertsTable.type, issue.type),
            eq(alertsTable.message, issue.message),
            gte(alertsTable.createdAt, cutoff),
          ),
        )
        .orderBy(desc(alertsTable.createdAt))
        .limit(1);
      if (recent) continue;

      const alertId = randomUUID();
      await db.insert(alertsTable).values({
        id: alertId,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        severity: issue.severity,
        type: issue.type,
        message: issue.message,
        acknowledged: false,
      });

      wsBroadcast({
        type: "alert",
        alertId,
        nodeId: input.nodeId,
        nodeName: input.nodeName,
        severity: issue.severity,
        message: issue.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

async function createAlertRecord(input: {
  nodeId: string;
  nodeName: string;
  type: string;
  severity: "critical" | "warning" | "info";
  message: string;
}) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [recent] = await db
    .select()
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.nodeId, input.nodeId),
        eq(alertsTable.type, input.type),
        eq(alertsTable.message, input.message),
        gte(alertsTable.createdAt, cutoff),
      ),
    )
    .orderBy(desc(alertsTable.createdAt))
    .limit(1);
  if (recent) return;

  const alertId = randomUUID();
  await db.insert(alertsTable).values({
    id: alertId,
    nodeId: input.nodeId,
    nodeName: input.nodeName,
    severity: input.severity,
    type: input.type,
    message: input.message,
    acknowledged: false,
  });

  wsBroadcast({
    type: "alert",
    alertId,
    nodeId: input.nodeId,
    nodeName: input.nodeName,
    severity: input.severity,
    message: input.message,
    timestamp: new Date().toISOString(),
  });
}

async function createL2ProfileAlerts(input: {
  nodeId: string;
  nodeName: string;
  issues: Array<{
    type: string;
    severity: "critical" | "warning" | "info";
    message: string;
  }>;
}) {
  for (const issue of input.issues) {
    await createAlertRecord({
      nodeId: input.nodeId,
      nodeName: input.nodeName,
      type: issue.type,
      severity: issue.severity,
      message: issue.message,
    });
  }
}

async function storeMetrics(input: {
  nodeId: string;
  now: Date;
  cpuUsage?: number | null;
  memUsage?: number | null;
  cpuTemperatureC?: number | null;
  inletTemperatureC?: number | null;
  fanHealthPct?: number | null;
  interfaceIn?: number | null;
  interfaceOut?: number | null;
  latency?: number | null;
  packetLoss: number;
}) {
  const metrics = [];
  if (input.cpuUsage != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "cpu",
      value: input.cpuUsage,
      min: input.cpuUsage,
      max: input.cpuUsage,
      avg: input.cpuUsage,
      timestamp: input.now,
    });
  }
  if (input.memUsage != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "memory",
      value: input.memUsage,
      min: input.memUsage,
      max: input.memUsage,
      avg: input.memUsage,
      timestamp: input.now,
    });
  }
  if (input.cpuTemperatureC != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "cpu_temperature",
      value: input.cpuTemperatureC,
      min: input.cpuTemperatureC,
      max: input.cpuTemperatureC,
      avg: input.cpuTemperatureC,
      timestamp: input.now,
    });
  }
  if (input.inletTemperatureC != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "inlet_temperature",
      value: input.inletTemperatureC,
      min: input.inletTemperatureC,
      max: input.inletTemperatureC,
      avg: input.inletTemperatureC,
      timestamp: input.now,
    });
  }
  if (input.fanHealthPct != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "fan_health",
      value: input.fanHealthPct,
      min: input.fanHealthPct,
      max: input.fanHealthPct,
      avg: input.fanHealthPct,
      timestamp: input.now,
    });
  }
  if (input.interfaceIn != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "interface_in",
      value: input.interfaceIn,
      min: input.interfaceIn,
      max: input.interfaceIn,
      avg: input.interfaceIn,
      timestamp: input.now,
    });
  }
  if (input.interfaceOut != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "interface_out",
      value: input.interfaceOut,
      min: input.interfaceOut,
      max: input.interfaceOut,
      avg: input.interfaceOut,
      timestamp: input.now,
    });
  }
  if (input.latency != null) {
    metrics.push({
      nodeId: input.nodeId,
      metric: "latency",
      value: input.latency,
      min: input.latency,
      max: input.latency,
      avg: input.latency,
      timestamp: input.now,
    });
  }
  metrics.push({
    nodeId: input.nodeId,
    metric: "packet_loss",
    value: input.packetLoss,
    min: input.packetLoss,
    max: input.packetLoss,
    avg: input.packetLoss,
    timestamp: input.now,
  });
  await db.insert(metricsTable).values(metrics);
}

async function syncEnvironmentSensors(
  nodeId: string,
  snapshot: Awaited<ReturnType<typeof fetchSnmpPollSnapshot>> | null,
  now: Date,
) {
  await db
    .delete(nodeEnvironmentSensorsTable)
    .where(eq(nodeEnvironmentSensorsTable.nodeId, nodeId));

  const sensors = [
    ...(snapshot?.temperatureSensors ?? []),
    ...(snapshot?.fanSensors ?? []),
  ];
  if (sensors.length === 0) return;

  await db.insert(nodeEnvironmentSensorsTable).values(
    sensors.map((sensor) => ({
      id: `${nodeId}:${sensor.sensorType}:${sensor.index}`,
      nodeId,
      sensorType: sensor.sensorType,
      name: sensor.name,
      label: sensor.label ?? null,
      value: sensor.value ?? null,
      unit: sensor.unit ?? null,
      status: sensor.status,
      source: sensor.source ?? null,
      updatedAt: now,
    })),
  );
}

async function upsertInterfaces(
  nodeId: string,
  interfaces: NonNullable<Awaited<ReturnType<typeof fetchSnmpPollSnapshot>>>["interfaces"],
  now: Date,
) {
  if (!interfaces || interfaces.length === 0) return;

  for (const iface of interfaces) {
    await db
      .insert(nodeInterfacesTable)
      .values({
        id: `${nodeId}:${iface.ifIndex}`,
        nodeId,
        ifIndex: iface.ifIndex,
        name: iface.name,
        description: iface.description ?? null,
        alias: iface.alias ?? null,
        adminStatus: iface.adminStatus,
        operStatus: iface.operStatus,
        speedBps: iface.speedBps ?? null,
        lastInBps: iface.inBps ?? null,
        lastOutBps: iface.outBps ?? null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: nodeInterfacesTable.id,
        set: {
          name: iface.name,
          description: iface.description ?? null,
          alias: iface.alias ?? null,
          adminStatus: iface.adminStatus,
          operStatus: iface.operStatus,
          speedBps: iface.speedBps ?? null,
          lastInBps: iface.inBps ?? null,
          lastOutBps: iface.outBps ?? null,
          updatedAt: now,
        },
      });
  }
}

async function syncL2Inventory(
  nodeId: string,
  snapshot: Awaited<ReturnType<typeof fetchSnmpPollSnapshot>> | null,
  now: Date,
) {
  if (!snapshot) return;

  await db.delete(nodeArpEntriesTable).where(eq(nodeArpEntriesTable.nodeId, nodeId));
  await db.delete(nodeMacEntriesTable).where(eq(nodeMacEntriesTable.nodeId, nodeId));
  await db.delete(nodeVlansTable).where(eq(nodeVlansTable.nodeId, nodeId));

  if (snapshot.arpEntries && snapshot.arpEntries.length > 0) {
    await db.insert(nodeArpEntriesTable).values(
      snapshot.arpEntries.map((entry, index) => ({
        id: `${nodeId}:arp:${entry.ipAddress}:${entry.macAddress}:${index}`,
        nodeId,
        ifIndex: entry.ifIndex ?? null,
        ipAddress: entry.ipAddress,
        macAddress: entry.macAddress,
        updatedAt: now,
      })),
    );
  }

  if (snapshot.macEntries && snapshot.macEntries.length > 0) {
    await db.insert(nodeMacEntriesTable).values(
      snapshot.macEntries.map((entry, index) => ({
        id: `${nodeId}:mac:${entry.vlanId ?? "na"}:${entry.macAddress}:${index}`,
        nodeId,
        vlanId: entry.vlanId ?? null,
        macAddress: entry.macAddress,
        bridgePort: entry.bridgePort ?? null,
        ifIndex: entry.ifIndex ?? null,
        interfaceName: entry.interfaceName ?? null,
        status: entry.status ?? null,
        updatedAt: now,
      })),
    );
  }

  if (snapshot.vlans && snapshot.vlans.length > 0) {
    await db.insert(nodeVlansTable).values(
      snapshot.vlans.map((vlan) => ({
        id: `${nodeId}:vlan:${vlan.vlanId}`,
        nodeId,
        vlanId: vlan.vlanId,
        name: vlan.name ?? null,
        updatedAt: now,
      })),
    );
  }
}

async function pollNodeReal(node: {
  id: string;
  ipAddress: string;
  name: string;
  credentialId: string | null;
  snmpVersion: "v1" | "v2c" | "v3" | null;
  snmpCommunity: string | null;
}): Promise<boolean> {
  try {
    state.activeWorkers++;

    const ping = await icmpPingOnce(node.ipAddress, 5000);
    const credential = await resolveNodeCredential(node);
    const snmp = credential
      ? await fetchSnmpPollSnapshot(node.ipAddress, credential, node.id)
      : null;
    const now = new Date();
    const reachable = ping.ok || snmp != null;
    const latency = ping.ok ? ping.rttMs : null;
    const packetLoss = ping.ok ? 0 : 100;
    const cpuUsage = snmp?.cpuUsage ?? null;
    const memUsage = snmp?.memUsage ?? null;
    const cpuTemperatureC = snmp?.cpuTemperatureC ?? null;
    const inletTemperatureC = snmp?.inletTemperatureC ?? null;
    const fanCount = snmp?.fanCount ?? 0;
    const fanHealthyCount = snmp?.fanHealthyCount ?? 0;
    const fanHealthPct =
      fanCount > 0 ? Number(((fanHealthyCount / fanCount) * 100).toFixed(2)) : null;
    const interfaceIn = snmp?.interfaceInBps ?? null;
    const interfaceOut = snmp?.interfaceOutBps ?? null;

    const status: "up" | "warning" | "down" = !reachable
      ? "down"
      : (cpuUsage ?? 0) >= 90 ||
          (memUsage ?? 0) >= 90 ||
          (cpuTemperatureC ?? 0) >= 75 ||
          (fanCount > 0 && fanHealthyCount < fanCount) ||
          (latency ?? 0) >= 150 ||
          (!ping.ok && snmp != null)
        ? "warning"
        : "up";

    await db
      .update(nodesTable)
      .set({
        status,
        name: snmp?.sysName?.trim() || node.name,
        vendor: snmp?.vendor ?? undefined,
        model: snmp?.model ?? undefined,
        serialNumber: snmp?.serialNumber ?? undefined,
        serviceTag: snmp?.serviceTag ?? undefined,
        assetTag: snmp?.assetTag ?? undefined,
        firmwareVersion: snmp?.firmwareVersion ?? undefined,
        softwareVersion: snmp?.softwareVersion ?? undefined,
        hardwareRevision: snmp?.hardwareRevision ?? undefined,
        manufactureDate: snmp?.manufactureDate ?? undefined,
        sysDescription: snmp?.sysDescr ?? undefined,
        uptime: snmp?.uptime ?? 0,
        cpuUsage,
        memUsage,
        cpuTemperatureC,
        inletTemperatureC,
        fanCount,
        fanHealthyCount,
        interfaceCount: snmp?.interfaceCount ?? undefined,
        lastPolled: now,
      })
      .where(eq(nodesTable.id, node.id));

    await upsertInterfaces(node.id, snmp?.interfaces, now);
    await syncEnvironmentSensors(node.id, snmp, now);
    await syncL2Inventory(node.id, snmp, now);
    await syncTopologyFromLldp({
      nodeId: node.id,
      interfaces: snmp?.interfaces,
      neighbors: snmp?.lldpNeighbors,
    });
    await syncTopologyFromCdp({
      nodeId: node.id,
      interfaces: snmp?.interfaces,
      neighbors: snmp?.cdpNeighbors,
    });
    const portAnalytics = await persistNodePortProfiles(node.id, now);

    await storeMetrics({
      nodeId: node.id,
      now,
      cpuUsage,
      memUsage,
      cpuTemperatureC,
      inletTemperatureC,
      fanHealthPct,
      interfaceIn,
      interfaceOut,
      latency,
      packetLoss,
    });

    await createAlertIfNeeded({
      nodeId: node.id,
      nodeName: snmp?.sysName?.trim() || node.name,
      reachable,
      cpuUsage,
      memUsage,
      packetLoss,
      latency,
    });
    await createInterfaceAlerts({
      nodeId: node.id,
      nodeName: snmp?.sysName?.trim() || node.name,
      interfaces: snmp?.interfaces,
    });
    await createL2ProfileAlerts({
      nodeId: node.id,
      nodeName: snmp?.sysName?.trim() || node.name,
      issues: portAnalytics.alerts,
    });

    wsBroadcast({
      type: "node_status",
      nodeId: node.id,
      nodeName: snmp?.sysName?.trim() || node.name,
      status,
      cpuUsage,
      memUsage,
      cpuTemperatureC,
      fanHealthPct,
      latency,
      timestamp: now.toISOString(),
    });

    wsBroadcast({
      type: "metric",
      nodeId: node.id,
      metrics: {
        cpu: cpuUsage,
        memory: memUsage,
        cpu_temperature: cpuTemperatureC,
        inlet_temperature: inletTemperatureC,
        fan_health: fanHealthPct,
        interface_in: interfaceIn,
        interface_out: interfaceOut,
        latency,
        packet_loss: packetLoss,
      },
      timestamp: now.toISOString(),
    });

    state.totalPolled++;
    if (reachable) {
      state.successCount++;
    }
    state.pollsThisSecond++;
    return reachable;
  } catch (err) {
    logger.error({ err, nodeId: node.id }, "Poll failed");
    return false;
  } finally {
    state.activeWorkers--;
  }
}

async function pollNodeSimulated(
  nodeId: string,
  _nodeIp: string,
  nodeName: string,
): Promise<boolean> {
  try {
    state.activeWorkers++;

    const cpuUsage = randomFloat(5, 95);
    const memUsage = randomFloat(20, 90);
    const interfaceIn = randomFloat(0, 1000);
    const interfaceOut = randomFloat(0, 800);
    const latency = randomFloat(0.5, 50);
    const packetLoss = Math.random() < 0.02 ? randomFloat(0.1, 5) : 0;

    const status = cpuUsage > 90 || memUsage > 95 || packetLoss > 2 ? "warning" :
                   Math.random() < 0.005 ? "down" : "up";

    const now = new Date();

    await db.update(nodesTable)
      .set({
        status: status as "up" | "down" | "warning" | "unknown",
        cpuUsage,
        memUsage,
        uptime: randomInt(10000, 9999999),
        lastPolled: now,
      })
      .where(eq(nodesTable.id, nodeId));

    const metricsToInsert = [
      { nodeId, metric: "cpu", value: cpuUsage, min: cpuUsage * 0.9, max: cpuUsage * 1.1, avg: cpuUsage, timestamp: now },
      { nodeId, metric: "memory", value: memUsage, min: memUsage * 0.95, max: memUsage * 1.05, avg: memUsage, timestamp: now },
      { nodeId, metric: "interface_in", value: interfaceIn, min: interfaceIn * 0.8, max: interfaceIn * 1.2, avg: interfaceIn, timestamp: now },
      { nodeId, metric: "interface_out", value: interfaceOut, min: interfaceOut * 0.8, max: interfaceOut * 1.2, avg: interfaceOut, timestamp: now },
      { nodeId, metric: "latency", value: latency, min: latency * 0.7, max: latency * 1.3, avg: latency, timestamp: now },
      { nodeId, metric: "packet_loss", value: packetLoss, min: 0, max: packetLoss, avg: packetLoss, timestamp: now },
    ];

    await db.insert(metricsTable).values(metricsToInsert);

    wsBroadcast({
      type: "node_status",
      nodeId,
      nodeName,
      status,
      cpuUsage,
      memUsage,
      latency,
      timestamp: now.toISOString(),
    });

    wsBroadcast({
      type: "metric",
      nodeId,
      metrics: { cpu: cpuUsage, memory: memUsage, interface_in: interfaceIn, latency },
      timestamp: now.toISOString(),
    });

    if (status === "warning" && Math.random() < 0.1) {
      const alertId = randomUUID();
      const alertType = cpuUsage > 90 ? "cpu_high" : memUsage > 95 ? "mem_high" : "packet_loss";
      const message = cpuUsage > 90 ? `CPU usage at ${cpuUsage.toFixed(1)}% on ${nodeName}` :
                      memUsage > 95 ? `Memory usage at ${memUsage.toFixed(1)}% on ${nodeName}` :
                      `Packet loss ${packetLoss.toFixed(2)}% detected on ${nodeName}`;

      await db.insert(alertsTable).values({
        id: alertId,
        nodeId,
        nodeName,
        severity: cpuUsage > 90 ? "critical" : "warning",
        type: alertType,
        message,
        acknowledged: false,
      });

      wsBroadcast({
        type: "alert",
        alertId,
        nodeId,
        nodeName,
        severity: cpuUsage > 90 ? "critical" : "warning",
        message,
        timestamp: now.toISOString(),
      });
    }

    state.totalPolled++;
    state.successCount++;
    state.pollsThisSecond++;
    return true;
  } catch (err) {
    logger.error({ err, nodeId }, "Poll failed");
    return false;
  } finally {
    state.activeWorkers--;
  }
}

async function pollNode(node: {
  id: string;
  ipAddress: string;
  name: string;
  credentialId: string | null;
  snmpVersion: "v1" | "v2c" | "v3" | null;
  snmpCommunity: string | null;
}): Promise<boolean> {
  if (useSimulatedPolling()) {
    return pollNodeSimulated(node.id, node.ipAddress, node.name);
  }
  return pollNodeReal(node);
}

export async function runPollCycle(nodeIds?: string[]) {
  const start = Date.now();

  const nodes = await db
    .select({
      id: nodesTable.id,
      ipAddress: nodesTable.ipAddress,
      name: nodesTable.name,
      credentialId: nodesTable.credentialId,
      snmpVersion: nodesTable.snmpVersion,
      snmpCommunity: nodesTable.snmpCommunity,
    })
    .from(nodesTable)
    .where(nodeIds && nodeIds.length > 0 ? sql`${nodesTable.id} = ANY(${nodeIds})` : undefined);

  state.queueDepth = nodes.length;

  const BATCH_SIZE = useSimulatedPolling() ? 100 : 12;
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((n) => pollNode(n)));
    state.queueDepth = Math.max(0, nodes.length - i - BATCH_SIZE);
  }

  state.lastCycleMs = Date.now() - start;
  return nodes.length;
}

export function startPoller() {
  if (state.running) return;
  state.running = true;

  rateInterval = setInterval(() => {
    state.pollsPerSecond = state.pollsThisSecond;
    state.pollsThisSecond = 0;
  }, 1000);

  pollerInterval = setInterval(async () => {
    try {
      await runPollCycle();
    } catch (err) {
      logger.error({ err }, "Poll cycle error");
    }
  }, 30000);

  runPollCycle().catch(err => logger.error({ err }, "Initial poll cycle failed"));

  logger.info(
    { mode: useSimulatedPolling() ? "simulated" : "snmp+icmp" },
    "Poller started",
  );
}

export function stopPoller() {
  if (pollerInterval) clearInterval(pollerInterval);
  if (rateInterval) clearInterval(rateInterval);
  state.running = false;
  logger.info("Poller stopped");
}
