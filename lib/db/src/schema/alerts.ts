import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertSeverityEnum = pgEnum("alert_severity", ["critical", "warning", "info"]);

export const alertsTable = pgTable("alerts", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  nodeName: text("node_name").notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ createdAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
