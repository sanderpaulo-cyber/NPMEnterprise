import { pgTable, text, real, integer, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const topologyProtocolEnum = pgEnum("topology_protocol", ["lldp", "cdp", "arp", "manual"]);

export const topologyEdgesTable = pgTable("topology_edges", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  targetId: text("target_id").notNull(),
  protocol: topologyProtocolEnum("protocol").notNull().default("lldp"),
  localInterface: text("local_interface"),
  remoteInterface: text("remote_interface"),
  linkSpeed: integer("link_speed"),
  utilization: real("utilization").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTopologyEdgeSchema = createInsertSchema(topologyEdgesTable).omit({ createdAt: true });
export type InsertTopologyEdge = z.infer<typeof insertTopologyEdgeSchema>;
export type TopologyEdge = typeof topologyEdgesTable.$inferSelect;
