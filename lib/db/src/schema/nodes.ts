import { pgTable, text, integer, real, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const nodeTypeEnum = pgEnum("node_type", ["router", "switch", "firewall", "server", "unknown"]);
export const nodeStatusEnum = pgEnum("node_status", ["up", "down", "warning", "unknown"]);
export const snmpVersionEnum = pgEnum("snmp_version", ["v1", "v2c", "v3"]);
export const nodePollingProfileEnum = pgEnum("node_polling_profile", [
  "critical",
  "standard",
  "low_impact",
  "inventory_scheduled",
]);

export const nodesTable = pgTable("nodes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull().unique(),
  discoveryScopeId: text("discovery_scope_id"),
  credentialId: text("credential_id"),
  type: nodeTypeEnum("type").notNull().default("unknown"),
  status: nodeStatusEnum("status").notNull().default("unknown"),
  vendor: text("vendor"),
  model: text("model"),
  serialNumber: text("serial_number"),
  serviceTag: text("service_tag"),
  assetTag: text("asset_tag"),
  firmwareVersion: text("firmware_version"),
  softwareVersion: text("software_version"),
  hardwareRevision: text("hardware_revision"),
  manufactureDate: text("manufacture_date"),
  location: text("location"),
  sysDescription: text("sys_description"),
  uptime: integer("uptime").default(0),
  cpuUsage: real("cpu_usage").default(0),
  memUsage: real("mem_usage").default(0),
  cpuTemperatureC: real("cpu_temperature_c"),
  inletTemperatureC: real("inlet_temperature_c"),
  fanCount: integer("fan_count").default(0),
  fanHealthyCount: integer("fan_healthy_count").default(0),
  interfaceCount: integer("interface_count").default(0),
  pollingProfile: nodePollingProfileEnum("polling_profile").notNull().default("standard"),
  snmpVersion: snmpVersionEnum("snmp_version").default("v2c"),
  snmpCommunity: text("snmp_community").default("public"),
  lastPolled: timestamp("last_polled"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNodeSchema = createInsertSchema(nodesTable).omit({ createdAt: true });
export type InsertNode = z.infer<typeof insertNodeSchema>;
export type NodeRecord = typeof nodesTable.$inferSelect;
