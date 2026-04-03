import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { getPollerStatus } from "../lib/poller";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("select 1");
    const poller = getPollerStatus();
    const data = {
      status: "ok",
      database: "ok",
      poller: poller.running ? "ok" : "stopped",
      cycleInFlight: poller.cycleInFlight,
    } as const;

    if (!poller.running) {
      res.status(503).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    res.status(503).json({
      status: "error",
      database: "unavailable",
      error: error instanceof Error ? error.message : "Database readiness check failed",
    });
  }
});

export default router;
