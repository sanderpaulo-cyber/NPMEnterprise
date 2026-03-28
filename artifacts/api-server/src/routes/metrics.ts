import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { metricsTable, nodesTable } from "@workspace/db/schema";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

const router: IRouter = Router();

function resolveBucketMs(bucket?: string) {
  if (bucket === "1m") return 60_000;
  if (bucket === "5m") return 300_000;
  if (bucket === "1h") return 3_600_000;
  return 86_400_000;
}

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
    const bucketMs = resolveBucketMs(bucket);

    const rows = await db
      .select({
        timestamp: metricsTable.timestamp,
        value: metricsTable.value,
        min: metricsTable.min,
        max: metricsTable.max,
        avg: metricsTable.avg,
      })
      .from(metricsTable)
      .where(and(...conditions))
      .orderBy(asc(metricsTable.timestamp))
      .limit(5000);

    const bucketMap = new Map<
      number,
      { timestamp: string; values: number[]; mins: number[]; maxes: number[]; avgs: number[] }
    >();

    for (const row of rows) {
      const timestamp = row.timestamp instanceof Date ? row.timestamp : new Date(row.timestamp);
      const bucketStart = Math.floor(timestamp.getTime() / bucketMs) * bucketMs;
      const current = bucketMap.get(bucketStart) ?? {
        timestamp: new Date(bucketStart).toISOString(),
        values: [],
        mins: [],
        maxes: [],
        avgs: [],
      };
      if (row.value != null) current.values.push(row.value);
      if (row.min != null) current.mins.push(row.min);
      if (row.max != null) current.maxes.push(row.max);
      if (row.avg != null) current.avgs.push(row.avg);
      bucketMap.set(bucketStart, current);
    }

    const avgOf = (values: number[]) =>
      values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const minOf = (values: number[]) =>
      values.length > 0 ? values.reduce((min, value) => (value < min ? value : min), values[0]) : 0;
    const maxOf = (values: number[]) =>
      values.length > 0 ? values.reduce((max, value) => (value > max ? value : max), values[0]) : 0;

    const data = Array.from(bucketMap.entries())
      .sort((left, right) => left[0] - right[0])
      .slice(-500)
      .map(([, item]) => ({
        timestamp: item.timestamp,
        value: parseFloat(avgOf(item.values).toFixed(3)),
        min: parseFloat(minOf(item.mins).toFixed(3)),
        max: parseFloat(maxOf(item.maxes).toFixed(3)),
        avg: parseFloat(avgOf(item.avgs).toFixed(3)),
      }));

    res.json({
      nodeId, metric, bucket,
      data,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get node metrics");
    res.status(500).json({ error: "Failed to get node metrics" });
  }
});

export default router;
