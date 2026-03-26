import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { flowsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/top-talkers", async (req, res) => {
  try {
    const { from, to, n = "10" } = req.query as Record<string, string>;
    const conditions = [];
    if (from) conditions.push(gte(flowsTable.timestamp, new Date(from)));
    if (to) conditions.push(lte(flowsTable.timestamp, new Date(to)));

    const srcResults = await db
      .select({
        ip: flowsTable.srcIp,
        totalBytes: sql<number>`SUM(${flowsTable.bytes})::bigint`,
        totalPackets: sql<number>`SUM(${flowsTable.packets})::bigint`,
      })
      .from(flowsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(flowsTable.srcIp)
      .orderBy(desc(sql<number>`SUM(${flowsTable.bytes})`))
      .limit(parseInt(n, 10));

    const dstResults = await db
      .select({
        ip: flowsTable.dstIp,
        totalBytes: sql<number>`SUM(${flowsTable.bytes})::bigint`,
        totalPackets: sql<number>`SUM(${flowsTable.packets})::bigint`,
      })
      .from(flowsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(flowsTable.dstIp)
      .orderBy(desc(sql<number>`SUM(${flowsTable.bytes})`))
      .limit(parseInt(n, 10));

    res.json({
      talkers: [
        ...srcResults.map(r => ({ ip: r.ip, hostname: r.ip, totalBytes: Number(r.totalBytes), totalPackets: Number(r.totalPackets), direction: "source" as const })),
        ...dstResults.map(r => ({ ip: r.ip, hostname: r.ip, totalBytes: Number(r.totalBytes), totalPackets: Number(r.totalPackets), direction: "destination" as const })),
      ],
      from: from ?? new Date(Date.now() - 3600000).toISOString(),
      to: to ?? new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get top talkers");
    res.status(500).json({ error: "Failed to get top talkers" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { nodeId, from, to, limit = "50" } = req.query as Record<string, string>;
    const conditions = [];
    if (nodeId) conditions.push(eq(flowsTable.nodeId, nodeId));
    if (from) conditions.push(gte(flowsTable.timestamp, new Date(from)));
    if (to) conditions.push(lte(flowsTable.timestamp, new Date(to)));

    const flows = await db.select().from(flowsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(flowsTable.timestamp))
      .limit(parseInt(limit, 10));

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(flowsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      flows: flows.map(f => ({
        id: f.id, nodeId: f.nodeId, srcIp: f.srcIp, dstIp: f.dstIp,
        srcPort: f.srcPort, dstPort: f.dstPort, protocol: f.protocol,
        bytes: Number(f.bytes), packets: Number(f.packets),
        timestamp: f.timestamp.toISOString(),
      })),
      total: count,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list flows");
    res.status(500).json({ error: "Failed to list flows" });
  }
});

export default router;
