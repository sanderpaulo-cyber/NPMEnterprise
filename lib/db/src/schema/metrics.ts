import { pgTable, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const metricsTable = pgTable("metrics", {
  nodeId: text("node_id").notNull(),
  metric: text("metric").notNull(),
  value: real("value").notNull(),
  min: real("min").notNull().default(0),
  max: real("max").notNull().default(0),
  avg: real("avg").notNull().default(0),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
}, (t) => [
  index("metrics_node_id_metric_timestamp_idx").on(t.nodeId, t.metric, t.timestamp),
  index("metrics_timestamp_idx").on(t.timestamp),
]);

export const insertMetricSchema = createInsertSchema(metricsTable);
export type InsertMetric = z.infer<typeof insertMetricSchema>;
export type Metric = typeof metricsTable.$inferSelect;
