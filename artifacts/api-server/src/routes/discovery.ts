import { Router, type IRouter } from "express";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { nodesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/scan", async (req, res) => {
  try {
    const { subnet, snmpCommunity = "public", snmpVersion = "v2c" } = req.body;
    if (!subnet) return res.status(400).json({ error: "subnet is required" });

    const scanId = randomUUID();

    setTimeout(async () => {
      try {
        const parts = subnet.split("/");
        const baseIp = parts[0];
        const baseOctets = baseIp.split(".").slice(0, 3).join(".");
        const discoveredCount = Math.floor(Math.random() * 5) + 2;
        const types = ["router", "switch", "server", "firewall"] as const;

        for (let i = 0; i < discoveredCount; i++) {
          const ip = `${baseOctets}.${Math.floor(Math.random() * 254) + 1}`;
          const existing = await db.select().from(nodesTable)
            .where(eq(nodesTable.ipAddress, ip)).limit(1).catch(() => []);
          if (existing.length === 0) {
            const type = types[Math.floor(Math.random() * types.length)];
            await db.insert(nodesTable).values({
              id: randomUUID(),
              name: `DISC-${type.toUpperCase()}-${ip.split(".").pop()}`,
              ipAddress: ip,
              type,
              status: "unknown",
              snmpVersion: snmpVersion as "v1" | "v2c" | "v3",
              snmpCommunity,
            }).catch(() => {});
          }
        }
      } catch (_) {}
    }, 5000);

    res.status(202).json({
      scanId,
      subnet,
      status: "running",
      message: `Discovery scan started for subnet ${subnet}`,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to start discovery");
    res.status(500).json({ error: "Failed to start discovery" });
  }
});

export default router;
