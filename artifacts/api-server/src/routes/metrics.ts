import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { metricsTable, nodesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/top-n", async (req, res) => {
  try {
    const { metric = "cpu", n = "10", from, to } = req.query as Record<string, string>;
    const conditions = [eq(metricsTable.metric, metric)];
    if (from) conditions.push(gte(metricsTable.timestamp, new Date(from)));
    if (to) conditions.push(lte(metricsTable.timestamp, new Date(to)));

    const results = await db
      .select({
        nodeId: metricsTable.nodeId,
        value: sql<number>`AVG(${metricsTable.value})::float`,
        nodeName: nodesTable.name,
        ipAddress: nodesTable.ipAddress,
      })
      .from(metricsTable)
      .leftJoin(nodesTable, eq(metricsTable.nodeId, nodesTable.id))
      .where(and(...conditions))
      .groupBy(metricsTable.nodeId, nodesTable.name, nodesTable.ipAddress)
      .orderBy(desc(sql<number>`AVG(${metricsTable.value})`))
      .limit(parseInt(n, 10));

    res.json({
      metric,
      items: results.map(r => ({
        nodeId: r.nodeId,
        nodeName: r.nodeName ?? r.nodeId,
        ipAddress: r.ipAddress ?? "unknown",
        value: parseFloat((r.value ?? 0).toFixed(2)),
        metric,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get top-N metrics");
    res.status(500).json({ error: "Failed to get top-N metrics" });
  }
});

router.get("/:nodeId", async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { metric = "cpu", bucket = "5m", from, to } = req.query as Record<string, string>;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const conditions = [
      eq(metricsTable.nodeId, nodeId),
      eq(metricsTable.metric, metric),
      gte(metricsTable.timestamp, fromDate),
      lte(metricsTable.timestamp, toDate),
    ];

    const bucketMs = bucket === "1m" ? 60000 : bucket === "5m" ? 300000 : bucket === "1h" ? 3600000 : 86400000;
    const bucketSql = sql<string>`to_timestamp(floor(extract(epoch from ${metricsTable.timestamp}) / ${bucketMs / 1000}) * ${bucketMs / 1000})`;

    const data = await db
      .select({
        timestamp: bucketSql,
        value: sql<number>`AVG(${metricsTable.value})::float`,
        min: sql<number>`MIN(${metricsTable.min})::float`,
        max: sql<number>`MAX(${metricsTable.max})::float`,
        avg: sql<number>`AVG(${metricsTable.avg})::float`,
      })
      .from(metricsTable)
      .where(and(...conditions))
      .groupBy(bucketSql)
      .orderBy(bucketSql)
      .limit(500);

    res.json({
      nodeId, metric, bucket,
      data: data.map(d => ({
        timestamp: d.timestamp,
        value: parseFloat((d.value ?? 0).toFixed(3)),
        min: parseFloat((d.min ?? 0).toFixed(3)),
        max: parseFloat((d.max ?? 0).toFixed(3)),
        avg: parseFloat((d.avg ?? 0).toFixed(3)),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get node metrics");
    res.status(500).json({ error: "Failed to get node metrics" });
  }
});

export default router;
