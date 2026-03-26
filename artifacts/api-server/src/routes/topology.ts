import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { nodesTable, topologyEdgesTable } from "@workspace/db/schema";

const router: IRouter = Router();

function randomLatency(base: number, variance: number): number {
  return parseFloat((base + (Math.random() - 0.5) * variance).toFixed(3));
}

router.get("/", async (req, res) => {
  try {
    const nodes = await db.select().from(nodesTable).limit(200);
    const edges = await db.select().from(topologyEdgesTable).limit(500);

    res.json({
      nodes: nodes.map(n => ({
        id: n.id, name: n.name, ipAddress: n.ipAddress, type: n.type, status: n.status,
        vendor: n.vendor, model: n.model, location: n.location,
        cpuUsage: n.cpuUsage, memUsage: n.memUsage,
        lastPolled: n.lastPolled?.toISOString(),
        createdAt: n.createdAt.toISOString(),
      })),
      edges: edges.map(e => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
        protocol: e.protocol,
        localInterface: e.localInterface,
        remoteInterface: e.remoteInterface,
        linkSpeed: e.linkSpeed,
        utilization: e.utilization,
      })),
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get topology");
    res.status(500).json({ error: "Failed to get topology" });
  }
});

router.get("/netpath/:nodeId", async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { target = "8.8.8.8" } = req.query as Record<string, string>;

    const hopCount = Math.floor(Math.random() * 8) + 5;
    const hops = [];
    let cumulativeLatency = 0;

    const hopIps = [
      "10.0.0.1", "10.1.0.1", "10.2.0.1", "172.16.0.1",
      "192.168.1.1", "200.143.4.1", "177.52.20.1", "8.8.4.4",
      target
    ];

    for (let i = 0; i < hopCount; i++) {
      const hopLatency = randomLatency(2 + i * 3, 4);
      const minLatency = randomLatency(hopLatency * 0.7, 1);
      const maxLatency = randomLatency(hopLatency * 1.4, 2);
      cumulativeLatency += hopLatency;

      hops.push({
        hop: i + 1,
        ipAddress: i < hopIps.length ? hopIps[i] : `10.${i}.${i}.1`,
        hostname: i === hopCount - 1 ? "dns.google" : `hop-${i + 1}.latam.backbone.net`,
        avgLatency: parseFloat(hopLatency.toFixed(3)),
        minLatency: parseFloat(minLatency.toFixed(3)),
        maxLatency: parseFloat(maxLatency.toFixed(3)),
        packetLoss: Math.random() < 0.05 ? parseFloat((Math.random() * 2).toFixed(2)) : 0,
      });
    }

    res.json({
      sourceNodeId: nodeId,
      target,
      hops,
      totalLatency: parseFloat(cumulativeLatency.toFixed(3)),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get netpath");
    res.status(500).json({ error: "Failed to get netpath" });
  }
});

export default router;
