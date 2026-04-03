import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  alertsTable,
  flowsTable,
  metricsTable,
  nodeArpEntriesTable,
  nodeEnvironmentSensorsTable,
  nodeHardwareComponentsTable,
  nodeInterfaceAddressesTable,
  nodeInterfacesTable,
  nodeMacEntriesTable,
  nodePortObservationsTable,
  nodePortProfilesTable,
  nodeRoutesTable,
  nodeVlansTable,
  nodesTable,
  snmpCredentialsTable,
  topologyEdgesTable,
  type SnmpCredentialRecord,
} from "@workspace/db/schema";
import { eq, and, desc, avg, sql, inArray, or } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  correlateNodeAccessPorts,
  listNodePortObservations,
  listNodePortProfiles,
} from "../lib/l2-correlation";
import { runPollCycle } from "../lib/poller";
import { fetchSnmpDiagnostics } from "../lib/snmp-client";

const router: IRouter = Router();
const pollingProfiles = [
  "critical",
  "standard",
  "low_impact",
  "inventory_scheduled",
] as const;

function isValidPollingProfile(value: unknown): value is (typeof pollingProfiles)[number] {
  return typeof value === "string" && pollingProfiles.includes(value as (typeof pollingProfiles)[number]);
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
      .where(eq(snmpCredentialsTable.id, node.credentialId))
      .limit(1);
    if (credential?.enabled) {
      return credential;
    }
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

router.get("/", async (req, res): Promise<void> => {
  try {
    const { status, type, limit = "100", offset = "0" } = req.query as Record<string, string>;
    const conditions = [];
    if (status) conditions.push(eq(nodesTable.status, status as "up" | "down" | "warning" | "unknown"));
    if (type) conditions.push(eq(nodesTable.type, type as "router" | "switch" | "firewall" | "server" | "unknown"));

    const limitN = parseInt(limit, 10);
    const offsetN = parseInt(offset, 10);

    const nodes = await db.select().from(nodesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(nodesTable.lastPolled))
      .limit(limitN)
      .offset(offsetN);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(nodesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.name,
        ipAddress: n.ipAddress,
        type: n.type,
        status: n.status,
        vendor: n.vendor,
        model: n.model,
        serialNumber: n.serialNumber,
        serviceTag: n.serviceTag,
        assetTag: n.assetTag,
        firmwareVersion: n.firmwareVersion,
        softwareVersion: n.softwareVersion,
        hardwareRevision: n.hardwareRevision,
        manufactureDate: n.manufactureDate,
        location: n.location,
        sysDescription: n.sysDescription,
        uptime: n.uptime,
        cpuUsage: n.cpuUsage,
        memUsage: n.memUsage,
        cpuTemperatureC: n.cpuTemperatureC,
        inletTemperatureC: n.inletTemperatureC,
        fanCount: n.fanCount,
        fanHealthyCount: n.fanHealthyCount,
        interfaceCount: n.interfaceCount,
        pollingProfile: n.pollingProfile,
        lastPolled: n.lastPolled?.toISOString(),
        createdAt: n.createdAt.toISOString(),
      })),
      total: count,
      limit: limitN,
      offset: offsetN,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list nodes");
    res.status(500).json({ error: "Failed to list nodes" });
    return;
  }
});

router.get("/stats/summary", async (req, res): Promise<void> => {
  try {
    const nodes = await db.select().from(nodesTable);
    const up = nodes.filter(n => n.status === "up").length;
    const down = nodes.filter(n => n.status === "down").length;
    const warning = nodes.filter(n => n.status === "warning").length;
    const unknown = nodes.filter(n => n.status === "unknown").length;
    const avgCpu = nodes.length > 0 ? nodes.reduce((s, n) => s + (n.cpuUsage ?? 0), 0) / nodes.length : 0;
    const avgMemory = nodes.length > 0 ? nodes.reduce((s, n) => s + (n.memUsage ?? 0), 0) / nodes.length : 0;

    const criticalAlerts = await db.select({ count: sql<number>`count(*)::int` })
      .from(alertsTable).where(and(eq(alertsTable.severity, "critical"), eq(alertsTable.acknowledged, false)));
    const warningAlerts = await db.select({ count: sql<number>`count(*)::int` })
      .from(alertsTable).where(and(eq(alertsTable.severity, "warning"), eq(alertsTable.acknowledged, false)));

    res.json({
      total: nodes.length, up, down, warning, unknown,
      avgCpu: parseFloat(avgCpu.toFixed(2)),
      avgMemory: parseFloat(avgMemory.toFixed(2)),
      criticalAlerts: criticalAlerts[0]?.count ?? 0,
      warningAlerts: warningAlerts[0]?.count ?? 0,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get summary");
    res.status(500).json({ error: "Failed to get summary" });
    return;
  }
});

router.get("/:nodeId", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const [node] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId));
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }
    res.json({
      ...node,
      lastPolled: node.lastPolled?.toISOString(),
      createdAt: node.createdAt.toISOString(),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node");
    res.status(500).json({ error: "Failed to get node" });
    return;
  }
});

router.get("/:nodeId/snmp-diagnostics", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const [node] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId));
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    const credential = await resolveNodeCredential(node);
    if (!credential) {
      res.status(200).json({
        nodeId,
        target: node.ipAddress,
        hasCredential: false,
        message: "Nenhuma credencial SNMP valida esta associada a este no.",
      });
      return;
    }

    const diagnostics = await fetchSnmpDiagnostics(node.ipAddress, credential);
    if (!diagnostics) {
      res.status(200).json({
        nodeId,
        target: node.ipAddress,
        hasCredential: true,
        credential: {
          id: credential.id,
          name: credential.name,
          version: credential.version,
          port: credential.port,
          timeoutMs: credential.timeoutMs,
          retries: credential.retries,
        },
        message: "Falha ao executar o diagnostico SNMP para este no.",
      });
      return;
    }

    res.json({
      nodeId,
      target: node.ipAddress,
      hasCredential: true,
      credential: {
        id: credential.id,
        name: credential.name,
        version: credential.version,
        port: credential.port,
        timeoutMs: credential.timeoutMs,
        retries: credential.retries,
      },
      diagnostics,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to run node SNMP diagnostics");
    res.status(500).json({ error: "Failed to run node SNMP diagnostics" });
    return;
  }
});

router.get("/:nodeId/interfaces", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const interfaces = await db
      .select()
      .from(nodeInterfacesTable)
      .where(eq(nodeInterfacesTable.nodeId, nodeId))
      .orderBy(nodeInterfacesTable.ifIndex);
    res.json({
      nodeId,
      interfaces: interfaces.map((iface) => ({
        id: iface.id,
        ifIndex: iface.ifIndex,
        name: iface.name,
        description: iface.description,
        alias: iface.alias,
        adminStatus: iface.adminStatus,
        operStatus: iface.operStatus,
        speedBps: iface.speedBps,
        lastInBps: iface.lastInBps,
        lastOutBps: iface.lastOutBps,
        updatedAt: iface.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node interfaces");
    res.status(500).json({ error: "Failed to get node interfaces" });
    return;
  }
});

router.get("/:nodeId/interface-addresses", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const entries = await db
      .select()
      .from(nodeInterfaceAddressesTable)
      .where(eq(nodeInterfaceAddressesTable.nodeId, nodeId))
      .orderBy(
        nodeInterfaceAddressesTable.ifIndex,
        nodeInterfaceAddressesTable.prefixLength,
        nodeInterfaceAddressesTable.ipAddress,
      );

    res.json({
      nodeId,
      entries: entries.map((entry) => ({
        id: entry.id,
        ifIndex: entry.ifIndex,
        interfaceName: entry.interfaceName,
        ipAddress: entry.ipAddress,
        subnetMask: entry.subnetMask,
        prefixLength: entry.prefixLength,
        addressType: entry.addressType,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node interface addresses");
    res.status(500).json({ error: "Failed to get node interface addresses" });
    return;
  }
});

router.get("/:nodeId/routes", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const entries = await db
      .select()
      .from(nodeRoutesTable)
      .where(eq(nodeRoutesTable.nodeId, nodeId))
      .orderBy(nodeRoutesTable.destination, nodeRoutesTable.prefixLength, nodeRoutesTable.nextHop);

    res.json({
      nodeId,
      summary: {
        totalRoutes: entries.length,
        defaultRoutes: entries.filter((entry) => entry.destination === "0.0.0.0").length,
        connectedRoutes: entries.filter((entry) => entry.routeType === "direct").length,
        staticRoutes: entries.filter((entry) => entry.protocol === "netmgmt").length,
      },
      entries: entries.map((entry) => ({
        id: entry.id,
        destination: entry.destination,
        subnetMask: entry.subnetMask,
        prefixLength: entry.prefixLength,
        nextHop: entry.nextHop,
        ifIndex: entry.ifIndex,
        interfaceName: entry.interfaceName,
        metric: entry.metric,
        routeType: entry.routeType,
        protocol: entry.protocol,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node routes");
    res.status(500).json({ error: "Failed to get node routes" });
    return;
  }
});

router.get("/:nodeId/environment", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const sensors = await db
      .select()
      .from(nodeEnvironmentSensorsTable)
      .where(eq(nodeEnvironmentSensorsTable.nodeId, nodeId))
      .orderBy(nodeEnvironmentSensorsTable.sensorType, nodeEnvironmentSensorsTable.name);

    const items = sensors.map((sensor) => ({
      id: sensor.id,
      sensorType: sensor.sensorType,
      name: sensor.name,
      label: sensor.label,
      value: sensor.value,
      unit: sensor.unit,
      status: sensor.status,
      source: sensor.source,
      updatedAt: sensor.updatedAt.toISOString(),
    }));
    const temperatureSensors = items.filter((sensor) => sensor.sensorType === "temperature");
    const fanSensors = items.filter((sensor) => sensor.sensorType === "fan");

    res.json({
      nodeId,
      summary: {
        temperatureSensorCount: temperatureSensors.length,
        fanSensorCount: fanSensors.length,
        healthyFanCount: fanSensors.filter((sensor) => sensor.status === "ok").length,
      },
      sensors: items,
      temperatureSensors,
      fanSensors,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node environmental sensors");
    res.status(500).json({ error: "Failed to get node environmental sensors" });
    return;
  }
});

router.get("/:nodeId/hardware", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const components = await db
      .select()
      .from(nodeHardwareComponentsTable)
      .where(eq(nodeHardwareComponentsTable.nodeId, nodeId))
      .orderBy(nodeHardwareComponentsTable.parentIndex, nodeHardwareComponentsTable.entityIndex);

    res.json({
      nodeId,
      summary: {
        totalComponents: components.length,
        chassisCount: components.filter((item) => item.entityClass === "chassis").length,
        moduleCount: components.filter((item) => item.entityClass === "module").length,
        powerSupplyCount: components.filter((item) => item.entityClass === "power-supply").length,
        fanTrayCount: components.filter((item) => item.entityClass === "fan").length,
      },
      components: components.map((component) => ({
        id: component.id,
        entityIndex: component.entityIndex,
        parentIndex: component.parentIndex,
        containedInIndex: component.containedInIndex,
        entityClass: component.entityClass,
        name: component.name,
        description: component.description,
        vendor: component.vendor,
        model: component.model,
        serialNumber: component.serialNumber,
        assetTag: component.assetTag,
        hardwareRevision: component.hardwareRevision,
        firmwareVersion: component.firmwareVersion,
        softwareVersion: component.softwareVersion,
        isFieldReplaceable: component.isFieldReplaceable,
        source: component.source,
        updatedAt: component.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node hardware inventory");
    res.status(500).json({ error: "Failed to get node hardware inventory" });
    return;
  }
});

router.get("/:nodeId/arp", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const entries = await db
      .select()
      .from(nodeArpEntriesTable)
      .where(eq(nodeArpEntriesTable.nodeId, nodeId))
      .orderBy(nodeArpEntriesTable.ifIndex, nodeArpEntriesTable.ipAddress);
    res.json({
      nodeId,
      entries: entries.map((entry) => ({
        id: entry.id,
        ifIndex: entry.ifIndex,
        ipAddress: entry.ipAddress,
        macAddress: entry.macAddress,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node ARP entries");
    res.status(500).json({ error: "Failed to get node ARP entries" });
    return;
  }
});

router.get("/:nodeId/mac-table", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const entries = await db
      .select()
      .from(nodeMacEntriesTable)
      .where(eq(nodeMacEntriesTable.nodeId, nodeId))
      .orderBy(nodeMacEntriesTable.vlanId, nodeMacEntriesTable.interfaceName, nodeMacEntriesTable.macAddress);
    res.json({
      nodeId,
      entries: entries.map((entry) => ({
        id: entry.id,
        vlanId: entry.vlanId,
        macAddress: entry.macAddress,
        bridgePort: entry.bridgePort,
        ifIndex: entry.ifIndex,
        interfaceName: entry.interfaceName,
        status: entry.status,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node MAC table");
    res.status(500).json({ error: "Failed to get node MAC table" });
    return;
  }
});

router.get("/:nodeId/vlans", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const entries = await db
      .select()
      .from(nodeVlansTable)
      .where(eq(nodeVlansTable.nodeId, nodeId))
      .orderBy(nodeVlansTable.vlanId);
    res.json({
      nodeId,
      entries: entries.map((entry) => ({
        id: entry.id,
        vlanId: entry.vlanId,
        name: entry.name,
        updatedAt: entry.updatedAt.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to get node VLANs");
    res.status(500).json({ error: "Failed to get node VLANs" });
    return;
  }
});

router.get("/:nodeId/access-ports", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const view = await correlateNodeAccessPorts(nodeId);
    res.json(view);
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to correlate node access ports");
    res.status(500).json({ error: "Failed to correlate node access ports" });
    return;
  }
});

router.get("/:nodeId/access-baseline", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const profiles = await listNodePortProfiles(nodeId);
    res.json({ nodeId, profiles });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list node access baseline");
    res.status(500).json({ error: "Failed to list node access baseline" });
    return;
  }
});

router.get("/:nodeId/access-history", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const history = await listNodePortObservations(nodeId);
    res.json({ nodeId, history });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list node access history");
    res.status(500).json({ error: "Failed to list node access history" });
    return;
  }
});

router.post("/", async (req, res): Promise<void> => {
  try {
    const { name, ipAddress, type, snmpVersion, snmpCommunity, location, vendor, pollingProfile } = req.body;
    if (!name || !ipAddress || !type) {
      res.status(400).json({ error: "name, ipAddress, and type are required" });
      return;
    }
    if (pollingProfile != null && !isValidPollingProfile(pollingProfile)) {
      res.status(400).json({ error: "Invalid pollingProfile" });
      return;
    }
    const id = randomUUID();
    const [node] = await db.insert(nodesTable).values({
      id, name, ipAddress,
      type: type as "router" | "switch" | "firewall" | "server" | "unknown",
      status: "unknown",
      pollingProfile: pollingProfile ?? "standard",
      snmpVersion: snmpVersion ?? "v2c",
      snmpCommunity: snmpCommunity ?? "public",
      location, vendor,
    }).returning();

    try {
      await runPollCycle([id]);
    } catch (pollErr) {
      req.log.warn({ err: pollErr, nodeId: id }, "Initial poll after node creation failed");
    }

    const [updatedNode] = await db.select().from(nodesTable).where(eq(nodesTable.id, id)).limit(1);
    const responseNode = updatedNode ?? node;
    res.status(201).json({
      ...responseNode,
      lastPolled: responseNode.lastPolled?.toISOString(),
      createdAt: responseNode.createdAt.toISOString(),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to create node");
    res.status(500).json({ error: "Failed to create node" });
    return;
  }
});

router.patch("/:nodeId/snmp", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const [existingNode] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId)).limit(1);
    if (!existingNode) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    const {
      credentialId,
      snmpVersion,
      snmpCommunity,
    } = req.body ?? {};

    const normalizedCredentialId =
      credentialId == null || String(credentialId).trim() === ""
        ? null
        : String(credentialId).trim();

    if (normalizedCredentialId) {
      const [credential] = await db
        .select()
        .from(snmpCredentialsTable)
        .where(eq(snmpCredentialsTable.id, normalizedCredentialId))
        .limit(1);

      if (!credential || !credential.enabled) {
        res.status(400).json({ error: "SNMP credential is invalid or disabled" });
        return;
      }

      await db
        .update(nodesTable)
        .set({
          credentialId: credential.id,
          snmpVersion: credential.version,
          snmpCommunity:
            credential.version === "v1" || credential.version === "v2c"
              ? (credential.community ?? "public")
              : null,
        })
        .where(eq(nodesTable.id, nodeId));
    } else {
      const normalizedVersion = snmpVersion ? String(snmpVersion).trim() : existingNode.snmpVersion;
      const normalizedCommunity = snmpCommunity ? String(snmpCommunity).trim() : "";

      if (normalizedVersion !== "v1" && normalizedVersion !== "v2c") {
        res.status(400).json({
          error: "Inline SNMP update requires snmpVersion v1 or v2c, or a saved credentialId",
        });
        return;
      }

      if (!normalizedCommunity) {
        res.status(400).json({ error: "snmpCommunity is required for inline SNMP" });
        return;
      }

      await db
        .update(nodesTable)
        .set({
          credentialId: null,
          snmpVersion: normalizedVersion,
          snmpCommunity: normalizedCommunity,
        })
        .where(eq(nodesTable.id, nodeId));
    }

    try {
      await runPollCycle([nodeId]);
    } catch (pollErr) {
      req.log.warn({ err: pollErr, nodeId }, "Poll after SNMP update failed");
    }

    const [updatedNode] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId)).limit(1);
    if (!updatedNode) {
      res.status(404).json({ error: "Node not found after update" });
      return;
    }

    res.json({
      ...updatedNode,
      lastPolled: updatedNode.lastPolled?.toISOString(),
      createdAt: updatedNode.createdAt.toISOString(),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to update node SNMP configuration");
    res.status(500).json({ error: "Failed to update node SNMP configuration" });
    return;
  }
});

router.patch("/:nodeId/polling-profile", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const [existingNode] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId)).limit(1);
    if (!existingNode) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    const { pollingProfile } = req.body ?? {};
    if (!isValidPollingProfile(pollingProfile)) {
      res.status(400).json({ error: "Invalid pollingProfile" });
      return;
    }

    await db
      .update(nodesTable)
      .set({ pollingProfile })
      .where(eq(nodesTable.id, nodeId));

    try {
      await runPollCycle([nodeId]);
    } catch (pollErr) {
      req.log.warn({ err: pollErr, nodeId }, "Poll after polling profile update failed");
    }

    const [updatedNode] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId)).limit(1);
    if (!updatedNode) {
      res.status(404).json({ error: "Node not found after update" });
      return;
    }

    res.json({
      ...updatedNode,
      lastPolled: updatedNode.lastPolled?.toISOString(),
      createdAt: updatedNode.createdAt.toISOString(),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to update node polling profile");
    res.status(500).json({ error: "Failed to update node polling profile" });
    return;
  }
});

router.post("/:nodeId/snmp/test", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    const [node] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId)).limit(1);
    if (!node) {
      res.status(404).json({ error: "Node not found" });
      return;
    }

    const { credentialId, snmpVersion, snmpCommunity } = req.body ?? {};
    const normalizedCredentialId =
      credentialId == null || String(credentialId).trim() === ""
        ? null
        : String(credentialId).trim();

    let credential: SnmpCredentialRecord | null = null;

    if (normalizedCredentialId) {
      const [savedCredential] = await db
        .select()
        .from(snmpCredentialsTable)
        .where(eq(snmpCredentialsTable.id, normalizedCredentialId))
        .limit(1);

      if (!savedCredential || !savedCredential.enabled) {
        res.status(400).json({ error: "SNMP credential is invalid or disabled" });
        return;
      }

      credential = savedCredential;
    } else {
      const normalizedVersion = snmpVersion ? String(snmpVersion).trim() : node.snmpVersion;
      const normalizedCommunity = snmpCommunity ? String(snmpCommunity).trim() : "";

      if (normalizedVersion !== "v1" && normalizedVersion !== "v2c") {
        res.status(400).json({
          error: "Inline SNMP test requires snmpVersion v1 or v2c, or a saved credentialId",
        });
        return;
      }

      if (!normalizedCommunity) {
        res.status(400).json({ error: "snmpCommunity is required for inline SNMP" });
        return;
      }

      credential = {
        id: `inline-${normalizedVersion}-${normalizedCommunity}`,
        name: "inline-node-credential",
        version: normalizedVersion,
        community: normalizedCommunity,
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

    const diagnostics = await fetchSnmpDiagnostics(node.ipAddress, credential);
    if (!diagnostics) {
      res.status(200).json({
        nodeId,
        target: node.ipAddress,
        hasCredential: true,
        credential: {
          id: credential.id,
          name: credential.name,
          version: credential.version,
          port: credential.port,
          timeoutMs: credential.timeoutMs,
          retries: credential.retries,
        },
        message: "Falha ao executar o diagnostico SNMP com a credencial informada.",
      });
      return;
    }

    res.json({
      nodeId,
      target: node.ipAddress,
      hasCredential: true,
      credential: {
        id: credential.id,
        name: credential.name,
        version: credential.version,
        port: credential.port,
        timeoutMs: credential.timeoutMs,
        retries: credential.retries,
      },
      diagnostics,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to test node SNMP configuration");
    res.status(500).json({ error: "Failed to test node SNMP configuration" });
    return;
  }
});

router.delete("/:nodeId", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
    await db.delete(nodeEnvironmentSensorsTable).where(eq(nodeEnvironmentSensorsTable.nodeId, nodeId));
    await db.delete(nodeHardwareComponentsTable).where(eq(nodeHardwareComponentsTable.nodeId, nodeId));
    await db.delete(nodeInterfacesTable).where(eq(nodeInterfacesTable.nodeId, nodeId));
    await db.delete(nodeInterfaceAddressesTable).where(eq(nodeInterfaceAddressesTable.nodeId, nodeId));
    await db.delete(nodeArpEntriesTable).where(eq(nodeArpEntriesTable.nodeId, nodeId));
    await db.delete(nodeMacEntriesTable).where(eq(nodeMacEntriesTable.nodeId, nodeId));
    await db.delete(nodeRoutesTable).where(eq(nodeRoutesTable.nodeId, nodeId));
    await db.delete(nodeVlansTable).where(eq(nodeVlansTable.nodeId, nodeId));
    await db.delete(nodePortObservationsTable).where(eq(nodePortObservationsTable.nodeId, nodeId));
    await db.delete(nodePortProfilesTable).where(eq(nodePortProfilesTable.nodeId, nodeId));
    await db.delete(metricsTable).where(eq(metricsTable.nodeId, nodeId));
    await db.delete(flowsTable).where(eq(flowsTable.nodeId, nodeId));
    await db.delete(alertsTable).where(eq(alertsTable.nodeId, nodeId));
    await db
      .delete(topologyEdgesTable)
      .where(or(eq(topologyEdgesTable.sourceId, nodeId), eq(topologyEdgesTable.targetId, nodeId)));
    await db.delete(nodesTable).where(eq(nodesTable.id, nodeId));
    res.status(204).send();
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to delete node");
    res.status(500).json({ error: "Failed to delete node" });
    return;
  }
});

export default router;
