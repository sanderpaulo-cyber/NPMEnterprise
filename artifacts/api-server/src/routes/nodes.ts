import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { nodesTable, metricsTable, alertsTable } from "@workspace/db/schema";
import { eq, and, desc, avg, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const router: IRouter = Router();

router.get("/", async (req, res) => {
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
        location: n.location,
        sysDescription: n.sysDescription,
        uptime: n.uptime,
        cpuUsage: n.cpuUsage,
        memUsage: n.memUsage,
        interfaceCount: n.interfaceCount,
        lastPolled: n.lastPolled?.toISOString(),
        createdAt: n.createdAt.toISOString(),
      })),
      total: count,
      limit: limitN,
      offset: offsetN,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list nodes");
    res.status(500).json({ error: "Failed to list nodes" });
  }
});

router.get("/stats/summary", async (req, res) => {
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
  } catch (err) {
    req.log.error({ err }, "Failed to get summary");
    res.status(500).json({ error: "Failed to get summary" });
  }
});

router.get("/:nodeId", async (req, res) => {
  try {
    const { nodeId } = req.params;
    const [node] = await db.select().from(nodesTable).where(eq(nodesTable.id, nodeId));
    if (!node) return res.status(404).json({ error: "Node not found" });
    res.json({
      ...node,
      lastPolled: node.lastPolled?.toISOString(),
      createdAt: node.createdAt.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get node");
    res.status(500).json({ error: "Failed to get node" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, ipAddress, type, snmpVersion, snmpCommunity, location, vendor } = req.body;
    if (!name || !ipAddress || !type) {
      return res.status(400).json({ error: "name, ipAddress, and type are required" });
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
  } catch (err) {
    req.log.error({ err }, "Failed to create node");
    res.status(500).json({ error: "Failed to create node" });
  }
});

router.delete("/:nodeId", async (req, res) => {
  try {
    const { nodeId } = req.params;
    await db.delete(nodesTable).where(eq(nodesTable.id, nodeId));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete node");
    res.status(500).json({ error: "Failed to delete node" });
  }
});

export default router;
