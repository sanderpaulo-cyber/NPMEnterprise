import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  nodesTable,
  metricsTable,
  alertsTable,
  nodeArpEntriesTable,
  nodeEnvironmentSensorsTable,
  nodeInterfacesTable,
  nodeMacEntriesTable,
  nodeVlansTable,
} from "@workspace/db/schema";
import { eq, and, desc, avg, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  correlateNodeAccessPorts,
  listNodePortObservations,
  listNodePortProfiles,
} from "../lib/l2-correlation";

const router: IRouter = Router();

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
    const { name, ipAddress, type, snmpVersion, snmpCommunity, location, vendor } = req.body;
    if (!name || !ipAddress || !type) {
      res.status(400).json({ error: "name, ipAddress, and type are required" });
      return;
    }
    const id = randomUUID();
    const [node] = await db.insert(nodesTable).values({
      id, name, ipAddress,
      type: type as "router" | "switch" | "firewall" | "server" | "unknown",
      status: "unknown",
      snmpVersion: snmpVersion ?? "v2c",
      snmpCommunity: snmpCommunity ?? "public",
      location, vendor,
    }).returning();
    res.status(201).json({ ...node, lastPolled: node.lastPolled?.toISOString(), createdAt: node.createdAt.toISOString() });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to create node");
    res.status(500).json({ error: "Failed to create node" });
    return;
  }
});

router.delete("/:nodeId", async (req, res): Promise<void> => {
  try {
    const { nodeId } = req.params;
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
