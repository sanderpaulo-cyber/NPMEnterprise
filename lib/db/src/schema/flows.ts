import { pgTable, text, integer, bigint, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const flowsTable = pgTable("flows", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  srcIp: text("src_ip").notNull(),
  dstIp: text("dst_ip").notNull(),
  srcPort: integer("src_port"),
  dstPort: integer("dst_port"),
  protocol: integer("protocol"),
  bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
  packets: bigint("packets", { mode: "number" }).notNull().default(0),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (t) => [
  index("flows_node_id_timestamp_idx").on(t.nodeId, t.timestamp),
  index("flows_timestamp_idx").on(t.timestamp),
  index("flows_src_ip_idx").on(t.srcIp),
  index("flows_dst_ip_idx").on(t.dstIp),
]);

export const insertFlowSchema = createInsertSchema(flowsTable);
export type InsertFlow = z.infer<typeof insertFlowSchema>;
export type Flow = typeof flowsTable.$inferSelect;
