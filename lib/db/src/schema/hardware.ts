import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nodeHardwareComponentsTable = pgTable("node_hardware_components", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  entityIndex: integer("entity_index").notNull(),
  parentIndex: integer("parent_index"),
  containedInIndex: integer("contained_in_index"),
  entityClass: text("entity_class"),
  name: text("name").notNull(),
  description: text("description"),
  vendor: text("vendor"),
  model: text("model"),
  serialNumber: text("serial_number"),
  assetTag: text("asset_tag"),
  hardwareRevision: text("hardware_revision"),
  firmwareVersion: text("firmware_version"),
  softwareVersion: text("software_version"),
  isFieldReplaceable: text("is_field_replaceable"),
  source: text("source"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeHardwareComponentSchema = createInsertSchema(
  nodeHardwareComponentsTable,
).omit({
  updatedAt: true,
  createdAt: true,
});

export type InsertNodeHardwareComponent = z.infer<
  typeof insertNodeHardwareComponentSchema
>;
export type NodeHardwareComponentRecord =
  typeof nodeHardwareComponentsTable.$inferSelect;
