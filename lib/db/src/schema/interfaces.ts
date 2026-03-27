import {
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const interfaceOperStatusEnum = pgEnum("interface_oper_status", [
  "up",
  "down",
  "testing",
  "unknown",
  "dormant",
  "notPresent",
  "lowerLayerDown",
]);

export const interfaceAdminStatusEnum = pgEnum("interface_admin_status", [
  "up",
  "down",
  "testing",
]);

export const nodeInterfacesTable = pgTable("node_interfaces", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  ifIndex: integer("if_index").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  alias: text("alias"),
  adminStatus: interfaceAdminStatusEnum("admin_status").default("down"),
  operStatus: interfaceOperStatusEnum("oper_status").default("down"),
  speedBps: real("speed_bps"),
  lastInBps: real("last_in_bps"),
  lastOutBps: real("last_out_bps"),
  lastChangeAt: timestamp("last_change_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeInterfaceSchema = createInsertSchema(nodeInterfacesTable).omit({
  updatedAt: true,
  createdAt: true,
});

export type InsertNodeInterface = z.infer<typeof insertNodeInterfaceSchema>;
export type NodeInterfaceRecord = typeof nodeInterfacesTable.$inferSelect;
