import { Router, type IRouter } from "express";
import { getPollerStatus, runPollCycle } from "../lib/poller";
import { db } from "@workspace/db";
import { nodesTable } from "@workspace/db/schema";

const router: IRouter = Router();

router.get("/status", (_req, res) => {
  const status = getPollerStatus();
  const successRate = status.totalPolled > 0 ? (status.successCount / status.totalPolled) * 100 : 100;
  res.json({
    running: status.running,
    cycleInFlight: status.cycleInFlight,
    activeWorkers: status.activeWorkers,
    pollsPerSecond: status.pollsPerSecond,
    totalPolled: status.totalPolled,
    successRate: parseFloat(successRate.toFixed(2)),
    lastCycleMs: status.lastCycleMs,
    queueDepth: status.queueDepth,
  });
});

router.post("/trigger", async (req, res) => {
  try {
    const { nodeIds, allNodes } = req.body ?? {};
    const count = await runPollCycle(allNodes ? undefined : nodeIds);
    res.json({ triggered: count, message: `Triggered poll for ${count} node(s)` });
  } catch (err) {
    req.log.error({ err }, "Failed to trigger poll");
    res.status(500).json({ error: "Failed to trigger poll" });
  }
});

export default router;
