import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nodeInterfaceAddressesTable = pgTable("node_interface_addresses", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  ifIndex: integer("if_index"),
  interfaceName: text("interface_name"),
  ipAddress: text("ip_address").notNull(),
  subnetMask: text("subnet_mask"),
  prefixLength: integer("prefix_length"),
  addressType: text("address_type"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nodeRoutesTable = pgTable("node_routes", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  destination: text("destination").notNull(),
  subnetMask: text("subnet_mask"),
  prefixLength: integer("prefix_length"),
  nextHop: text("next_hop"),
  ifIndex: integer("if_index"),
  interfaceName: text("interface_name"),
  metric: integer("metric"),
  routeType: text("route_type"),
  protocol: text("protocol"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeInterfaceAddressSchema = createInsertSchema(
  nodeInterfaceAddressesTable,
).omit({
  updatedAt: true,
  createdAt: true,
});

export const insertNodeRouteSchema = createInsertSchema(nodeRoutesTable).omit({
  updatedAt: true,
  createdAt: true,
});

export type InsertNodeInterfaceAddress = z.infer<typeof insertNodeInterfaceAddressSchema>;
export type InsertNodeRoute = z.infer<typeof insertNodeRouteSchema>;
