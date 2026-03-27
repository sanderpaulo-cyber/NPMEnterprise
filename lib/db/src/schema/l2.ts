import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nodeVlansTable = pgTable("node_vlans", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  vlanId: integer("vlan_id").notNull(),
  name: text("name"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nodeArpEntriesTable = pgTable("node_arp_entries", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  ifIndex: integer("if_index"),
  ipAddress: text("ip_address").notNull(),
  macAddress: text("mac_address").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nodeMacEntriesTable = pgTable("node_mac_entries", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  vlanId: integer("vlan_id"),
  macAddress: text("mac_address").notNull(),
  bridgePort: integer("bridge_port"),
  ifIndex: integer("if_index"),
  interfaceName: text("interface_name"),
  status: text("status"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nodePortProfilesTable = pgTable("node_port_profiles", {
  id: text("id").primaryKey(),
  nodeId: text("node_id").notNull(),
  ifIndex: integer("if_index"),
  interfaceName: text("interface_name").notNull(),
  alias: text("alias"),
  baselineRole: text("baseline_role"),
  baselineMacCount: integer("baseline_mac_count").notNull().default(0),
  baselineVlanCount: integer("baseline_vlan_count").notNull().default(0),
  baselineEndpointCount: integer("baseline_endpoint_count").notNull().default(0),
  baselineVlanSignature: text("baseline_vlan_signature"),
  lastRole: text("last_role"),
  lastMacCount: integer("last_mac_count").notNull().default(0),
  lastVlanCount: integer("last_vlan_count").notNull().default(0),
  lastEndpointCount: integer("last_endpoint_count").notNull().default(0),
  lastRiskCount: integer("last_risk_count").notNull().default(0),
  lastVlanSignature: text("last_vlan_signature"),
  lastChangeSummary: text("last_change_summary"),
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  lastChangedAt: timestamp("last_changed_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const nodePortObservationsTable = pgTable("node_port_observations", {
  id: text("id").primaryKey(),
  profileId: text("profile_id").notNull(),
  nodeId: text("node_id").notNull(),
  ifIndex: integer("if_index"),
  interfaceName: text("interface_name").notNull(),
  role: text("role"),
  macCount: integer("mac_count").notNull().default(0),
  vlanCount: integer("vlan_count").notNull().default(0),
  endpointCount: integer("endpoint_count").notNull().default(0),
  managedEndpointCount: integer("managed_endpoint_count").notNull().default(0),
  riskCount: integer("risk_count").notNull().default(0),
  vlanSignature: text("vlan_signature"),
  observedAt: timestamp("observed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeVlanSchema = createInsertSchema(nodeVlansTable).omit({
  updatedAt: true,
  createdAt: true,
});
export const insertNodeArpEntrySchema = createInsertSchema(nodeArpEntriesTable).omit({
  updatedAt: true,
  createdAt: true,
});
export const insertNodeMacEntrySchema = createInsertSchema(nodeMacEntriesTable).omit({
  updatedAt: true,
  createdAt: true,
});
export const insertNodePortProfileSchema = createInsertSchema(nodePortProfilesTable).omit({
  updatedAt: true,
  createdAt: true,
});
export const insertNodePortObservationSchema = createInsertSchema(
  nodePortObservationsTable,
).omit({
  createdAt: true,
});

export type InsertNodeVlan = z.infer<typeof insertNodeVlanSchema>;
export type InsertNodeArpEntry = z.infer<typeof insertNodeArpEntrySchema>;
export type InsertNodeMacEntry = z.infer<typeof insertNodeMacEntrySchema>;
export type InsertNodePortProfile = z.infer<typeof insertNodePortProfileSchema>;
export type InsertNodePortObservation = z.infer<typeof insertNodePortObservationSchema>;
