import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const { severity, nodeId, acknowledged, limit = "50" } = req.query as Record<string, string>;
    const conditions = [];
    if (severity) conditions.push(eq(alertsTable.severity, severity as "critical" | "warning" | "info"));
    if (nodeId) conditions.push(eq(alertsTable.nodeId, nodeId));
    if (acknowledged !== undefined) conditions.push(eq(alertsTable.acknowledged, acknowledged === "true"));

    const alerts = await db.select().from(alertsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertsTable.createdAt))
      .limit(parseInt(limit, 10));

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(alertsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      alerts: alerts.map(a => ({
        id: a.id, nodeId: a.nodeId, nodeName: a.nodeName,
        severity: a.severity, type: a.type, message: a.message,
        acknowledged: a.acknowledged,
        createdAt: a.createdAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
      })),
      total: count,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list alerts");
    res.status(500).json({ error: "Failed to list alerts" });
  }
});

router.post("/:alertId/acknowledge", async (req, res) => {
  try {
    const { alertId } = req.params;
    const [updated] = await db.update(alertsTable)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(eq(alertsTable.id, alertId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Alert not found" });
    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      acknowledgedAt: updated.acknowledgedAt?.toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to acknowledge alert");
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

export default router;
