import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  alertsTable,
  metricsTable,
  nodeArpEntriesTable,
  nodeEnvironmentSensorsTable,
  nodeHardwareComponentsTable,
  nodeInterfaceAddressesTable,
  nodeInterfacesTable,
  nodeMacEntriesTable,
  nodeRoutesTable,
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

const DEFAULT_REAL_POLL_INTERVAL_MS = 30_000;
const DEFAULT_REAL_BATCH_SIZE = 6;
const DEFAULT_DETAILED_POLL_INTERVAL_MS = 5 * 60_000;
const detailedPollState = new Map<string, number>();
const POLLING_PROFILES = {
  critical: true,
  standard: true,
  low_impact: true,
  inventory_scheduled: true,
} as const;

type PollingProfile = keyof typeof POLLING_PROFILES;

function readEnvInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, parsed);
}

function getPollerIntervalMs() {
  return useSimulatedPolling()
    ? 30_000
    : readEnvInt("NETWORK_POLL_INTERVAL_MS", DEFAULT_REAL_POLL_INTERVAL_MS, 5_000);
}

function getPollerBatchSize() {
  return useSimulatedPolling()
    ? 100
    : readEnvInt("NETWORK_POLL_BATCH_SIZE", DEFAULT_REAL_BATCH_SIZE, 1);
}

function getDetailedPollIntervalMs() {
  return useSimulatedPolling()
    ? 30_000
    : readEnvInt(
        "NETWORK_DETAILED_POLL_INTERVAL_MS",
        DEFAULT_DETAILED_POLL_INTERVAL_MS,
        30_000,
      );
}

function normalizePollingProfile(profile: string | null | undefined): PollingProfile {
  if (!profile) return "standard";
  return profile in POLLING_PROFILES ? (profile as PollingProfile) : "standard";
}

function getProfileSchedule(profile: string | null | undefined) {
  const tickMs = getPollerIntervalMs();
  const detailedBaseMs = getDetailedPollIntervalMs();
  switch (normalizePollingProfile(profile)) {
    case "critical":
      return {
        fastIntervalMs: tickMs,
        detailedIntervalMs: Math.min(detailedBaseMs, 2 * 60_000),
      };
    case "low_impact":
      return {
        fastIntervalMs: Math.max(tickMs * 10, 5 * 60_000),
        detailedIntervalMs: Math.max(detailedBaseMs * 3, 15 * 60_000),
      };
    case "inventory_scheduled":
      return {
        fastIntervalMs: Math.max(tickMs * 20, 10 * 60_000),
        detailedIntervalMs: Math.max(detailedBaseMs * 12, 60 * 60_000),
      };
    case "standard":
    default:
      return {
        fastIntervalMs: Math.max(tickMs * 2, 60_000),
        detailedIntervalMs: detailedBaseMs,
      };
  }
}

function shouldPollNodeNow(input: {
  lastPolled: Date | null;
  pollingProfile: string | null | undefined;
  force: boolean;
}) {
  if (input.force) return true;
  if (!input.lastPolled) return true;
  const schedule = getProfileSchedule(input.pollingProfile);
  return Date.now() - input.lastPolled.getTime() >= schedule.fastIntervalMs;
}

function shouldRunDetailedPoll(
  nodeId: string,
  pollingProfile: string | null | undefined,
  forceDetailed: boolean,
) {
  if (forceDetailed || useSimulatedPolling()) return true;
  const lastDetailedAt = detailedPollState.get(nodeId) ?? 0;
  const intervalMs = getProfileSchedule(pollingProfile).detailedIntervalMs;
  return Date.now() - lastDetailedAt >= intervalMs;
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
let pollerLoopHandle: ReturnType<typeof setTimeout> | null = null;
let cycleInFlight = false;

type WsBroadcastFn = (msg: object) => void;
let wsBroadcast: WsBroadcastFn = () => {};

export function setWsBroadcast(fn: WsBroadcastFn) {
  wsBroadcast = fn;
}

export function getPollerStatus() {
  return { ...state, cycleInFlight };
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
      timeoutMs: 5000,
      retries: 2,
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

async function syncHardwareComponents(
  nodeId: string,
  snapshot: Awaited<ReturnType<typeof fetchSnmpPollSnapshot>> | null,
  now: Date,
) {
  await db
    .delete(nodeHardwareComponentsTable)
    .where(eq(nodeHardwareComponentsTable.nodeId, nodeId));

  const components = snapshot?.hardwareComponents ?? [];
  if (components.length === 0) return;

  await db.insert(nodeHardwareComponentsTable).values(
    components.map((component) => ({
      id: `${nodeId}:hw:${component.entityIndex}`,
      nodeId,
      entityIndex: component.entityIndex,
      parentIndex: component.parentIndex ?? null,
      containedInIndex: component.containedInIndex ?? null,
      entityClass: component.entityClass ?? null,
      name: component.name,
      description: component.description ?? null,
      vendor: component.vendor ?? null,
      model: component.model ?? null,
      serialNumber: component.serialNumber ?? null,
      assetTag: component.assetTag ?? null,
      hardwareRevision: component.hardwareRevision ?? null,
      firmwareVersion: component.firmwareVersion ?? null,
      softwareVersion: component.softwareVersion ?? null,
      isFieldReplaceable:
        component.isFieldReplaceable == null
          ? null
          : component.isFieldReplaceable
            ? "true"
            : "false",
      source: component.source ?? null,
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

async function syncL3Inventory(
  nodeId: string,
  snapshot: Awaited<ReturnType<typeof fetchSnmpPollSnapshot>> | null,
  now: Date,
) {
  if (!snapshot) return;

  await db.delete(nodeInterfaceAddressesTable).where(eq(nodeInterfaceAddressesTable.nodeId, nodeId));
  await db.delete(nodeRoutesTable).where(eq(nodeRoutesTable.nodeId, nodeId));

  if (snapshot.interfaceAddresses && snapshot.interfaceAddresses.length > 0) {
    await db.insert(nodeInterfaceAddressesTable).values(
      snapshot.interfaceAddresses.map((entry, index) => ({
        id: `${nodeId}:ip:${entry.ipAddress}:${entry.ifIndex ?? "na"}:${index}`,
        nodeId,
        ifIndex: entry.ifIndex ?? null,
        interfaceName: entry.interfaceName ?? null,
        ipAddress: entry.ipAddress,
        subnetMask: entry.subnetMask ?? null,
        prefixLength: entry.prefixLength ?? null,
        addressType: entry.addressType ?? null,
        updatedAt: now,
      })),
    );
  }

  if (snapshot.routes && snapshot.routes.length > 0) {
    await db.insert(nodeRoutesTable).values(
      snapshot.routes.map((route, index) => ({
        id: `${nodeId}:route:${route.destination}:${route.prefixLength ?? "na"}:${route.nextHop ?? "na"}:${index}`,
        nodeId,
        destination: route.destination,
        subnetMask: route.subnetMask ?? null,
        prefixLength: route.prefixLength ?? null,
        nextHop: route.nextHop ?? null,
        ifIndex: route.ifIndex ?? null,
        interfaceName: route.interfaceName ?? null,
        metric: route.metric ?? null,
        routeType: route.routeType ?? null,
        protocol: route.protocol ?? null,
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
  pollingProfile: PollingProfile | null;
  snmpVersion: "v1" | "v2c" | "v3" | null;
  snmpCommunity: string | null;
}, forceDetailed = false): Promise<boolean> {
  try {
    state.activeWorkers++;

    const ping = await icmpPingOnce(node.ipAddress, 5000);
    const credential = await resolveNodeCredential(node);
    const detailedPollDue = shouldRunDetailedPoll(node.id, node.pollingProfile, forceDetailed);
    const shouldRunSnmp = credential != null && (detailedPollDue || !ping.ok);
    const snmp = shouldRunSnmp
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

    let portAlerts: Array<{
      type: string;
      severity: "critical" | "warning" | "info";
      message: string;
    }> = [];
    if (snmp) {
      detailedPollState.set(node.id, now.getTime());
      await upsertInterfaces(node.id, snmp.interfaces, now);
      await syncEnvironmentSensors(node.id, snmp, now);
      await syncHardwareComponents(node.id, snmp, now);
      await syncL2Inventory(node.id, snmp, now);
      await syncL3Inventory(node.id, snmp, now);
      await syncTopologyFromLldp({
        nodeId: node.id,
        interfaces: snmp.interfaces,
        neighbors: snmp.lldpNeighbors,
      });
      await syncTopologyFromCdp({
        nodeId: node.id,
        interfaces: snmp.interfaces,
        neighbors: snmp.cdpNeighbors,
      });
      const portAnalytics = await persistNodePortProfiles(node.id, now);
      portAlerts = portAnalytics.alerts;
    }

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
      issues: portAlerts,
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
  pollingProfile: PollingProfile | null;
  snmpVersion: "v1" | "v2c" | "v3" | null;
  snmpCommunity: string | null;
}, forceDetailed = false): Promise<boolean> {
  if (useSimulatedPolling()) {
    return pollNodeSimulated(node.id, node.ipAddress, node.name);
  }
  return pollNodeReal(node, forceDetailed);
}

export async function runPollCycle(nodeIds?: string[]) {
  const start = Date.now();
  const forceDetailed = Boolean(nodeIds && nodeIds.length > 0);

  const nodes = await db
    .select({
      id: nodesTable.id,
      ipAddress: nodesTable.ipAddress,
      name: nodesTable.name,
      credentialId: nodesTable.credentialId,
      pollingProfile: nodesTable.pollingProfile,
      snmpVersion: nodesTable.snmpVersion,
      snmpCommunity: nodesTable.snmpCommunity,
      lastPolled: nodesTable.lastPolled,
    })
    .from(nodesTable)
    .where(nodeIds && nodeIds.length > 0 ? inArray(nodesTable.id, nodeIds) : undefined);

  const dueNodes = forceDetailed
    ? nodes
    : nodes.filter((node) =>
        shouldPollNodeNow({
          lastPolled: node.lastPolled,
          pollingProfile: node.pollingProfile,
          force: forceDetailed,
        }),
      );

  state.queueDepth = dueNodes.length;

  const BATCH_SIZE = getPollerBatchSize();
  for (let i = 0; i < dueNodes.length; i += BATCH_SIZE) {
    const batch = dueNodes.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map((n) => pollNode(n, forceDetailed)));
    state.queueDepth = Math.max(0, dueNodes.length - i - BATCH_SIZE);
  }

  state.lastCycleMs = Date.now() - start;
  return dueNodes.length;
}

export function startPoller() {
  if (state.running) return;
  state.running = true;
  const pollIntervalMs = getPollerIntervalMs();
  const batchSize = getPollerBatchSize();
  const detailedPollIntervalMs = getDetailedPollIntervalMs();

  rateInterval = setInterval(() => {
    state.pollsPerSecond = state.pollsThisSecond;
    state.pollsThisSecond = 0;
  }, 1000);

  const scheduleNextCycle = () => {
    if (!state.running) return;
    pollerLoopHandle = setTimeout(async () => {
      if (cycleInFlight) {
        logger.warn("Skipping poll cycle because a previous cycle is still running");
        scheduleNextCycle();
        return;
      }

      cycleInFlight = true;
      try {
        await runPollCycle();
      } catch (err) {
        logger.error({ err }, "Poll cycle error");
      } finally {
        cycleInFlight = false;
        scheduleNextCycle();
      }
    }, pollIntervalMs);
  };

  cycleInFlight = true;
  runPollCycle()
    .catch(err => logger.error({ err }, "Initial poll cycle failed"))
    .finally(() => {
      cycleInFlight = false;
      scheduleNextCycle();
    });

  logger.info(
    {
      mode: useSimulatedPolling() ? "simulated" : "snmp+icmp",
      pollIntervalMs,
      batchSize,
      detailedPollIntervalMs,
      profileSchedules: {
        critical: getProfileSchedule("critical"),
        standard: getProfileSchedule("standard"),
        lowImpact: getProfileSchedule("low_impact"),
        inventoryScheduled: getProfileSchedule("inventory_scheduled"),
      },
    },
    "Poller started",
  );
}

export function stopPoller() {
  if (pollerInterval) clearInterval(pollerInterval);
  if (rateInterval) clearInterval(rateInterval);
  if (pollerLoopHandle) clearTimeout(pollerLoopHandle);
  pollerInterval = null;
  pollerLoopHandle = null;
  rateInterval = null;
  state.running = false;
  cycleInFlight = false;
  logger.info("Poller stopped");
}
