import { db } from "@workspace/db";
import { nodesTable, metricsTable, alertsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "./logger";

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

type WsBroadcastFn = (msg: object) => void;
let wsBroadcast: WsBroadcastFn = () => {};

export function setWsBroadcast(fn: WsBroadcastFn) {
  wsBroadcast = fn;
}

export function getPollerStatus() {
  return { ...state };
}

function randomFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function pollNode(nodeId: string, nodeIp: string, nodeName: string): Promise<boolean> {
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

export async function runPollCycle(nodeIds?: string[]) {
  const start = Date.now();

  let nodes;
  if (nodeIds && nodeIds.length > 0) {
    nodes = await db.select({ id: nodesTable.id, ipAddress: nodesTable.ipAddress, name: nodesTable.name })
      .from(nodesTable)
      .where(sql`${nodesTable.id} = ANY(${nodeIds})`);
  } else {
    nodes = await db.select({ id: nodesTable.id, ipAddress: nodesTable.ipAddress, name: nodesTable.name })
      .from(nodesTable);
  }

  state.queueDepth = nodes.length;

  const BATCH_SIZE = 100;
  for (let i = 0; i < nodes.length; i += BATCH_SIZE) {
    const batch = nodes.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(n => pollNode(n.id, n.ipAddress, n.name)));
    state.queueDepth = Math.max(0, nodes.length - i - BATCH_SIZE);
  }

  state.lastCycleMs = Date.now() - start;
  return nodes.length;
}

export function startPoller() {
  if (state.running) return;
  state.running = true;

  rateInterval = setInterval(() => {
    state.pollsPerSecond = state.pollsThisSecond;
    state.pollsThisSecond = 0;
  }, 1000);

  pollerInterval = setInterval(async () => {
    try {
      await runPollCycle();
    } catch (err) {
      logger.error({ err }, "Poll cycle error");
    }
  }, 30000);

  runPollCycle().catch(err => logger.error({ err }, "Initial poll cycle failed"));

  logger.info("Poller started");
}

export function stopPoller() {
  if (pollerInterval) clearInterval(pollerInterval);
  if (rateInterval) clearInterval(rateInterval);
  state.running = false;
  logger.info("Poller stopped");
}
