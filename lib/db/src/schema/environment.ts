import { pgEnum, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nodeEnvironmentSensorTypeEnum = pgEnum("node_environment_sensor_type", [
  "temperature",
  "fan",
]);

export const nodeEnvironmentSensorStatusEnum = pgEnum(
  "node_environment_sensor_status",
  ["ok", "warning", "critical", "unknown"],
);

export const nodeEnvironmentSensorsTable = pgTable("node_environment_sensors", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  sensorType: nodeEnvironmentSensorTypeEnum("sensor_type").notNull(),
  name: text("name").notNull(),
  label: text("label"),
  value: real("value"),
  unit: text("unit"),
  status: nodeEnvironmentSensorStatusEnum("status").default("unknown").notNull(),
  source: text("source"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeEnvironmentSensorSchema = createInsertSchema(
  nodeEnvironmentSensorsTable,
).omit({
  updatedAt: true,
  createdAt: true,
});

export type InsertNodeEnvironmentSensor = z.infer<
  typeof insertNodeEnvironmentSensorSchema
>;
export type NodeEnvironmentSensorRecord = typeof nodeEnvironmentSensorsTable.$inferSelect;
