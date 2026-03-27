import {
  boolean,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const snmpCredentialVersionEnum = pgEnum("snmp_credential_version", [
  "v1",
  "v2c",
  "v3",
]);

export const snmpAuthProtocolEnum = pgEnum("snmp_auth_protocol", [
  "none",
  "md5",
  "sha",
  "sha224",
  "sha256",
  "sha384",
  "sha512",
]);

export const snmpPrivProtocolEnum = pgEnum("snmp_priv_protocol", [
  "none",
  "des",
  "aes",
]);

export const discoveryRunStatusEnum = pgEnum("discovery_run_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const networkScopesTable = pgTable("network_scopes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cidr: text("cidr").notNull().unique(),
  site: text("site"),
  description: text("description"),
  enabled: boolean("enabled").default(true).notNull(),
  priority: integer("priority").default(100).notNull(),
  defaultCredentialId: text("default_credential_id"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const snmpCredentialsTable = pgTable("snmp_credentials", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  version: snmpCredentialVersionEnum("version").notNull().default("v2c"),
  community: text("community"),
  username: text("username"),
  authProtocol: snmpAuthProtocolEnum("auth_protocol")
    .notNull()
    .default("none"),
  authPassword: text("auth_password"),
  privProtocol: snmpPrivProtocolEnum("priv_protocol")
    .notNull()
    .default("none"),
  privPassword: text("priv_password"),
  port: integer("port").notNull().default(161),
  timeoutMs: integer("timeout_ms").notNull().default(2000),
  retries: integer("retries").notNull().default(1),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const discoveryRunsTable = pgTable("discovery_runs", {
  id: text("id").primaryKey(),
  scopeId: text("scope_id"),
  scopeName: text("scope_name"),
  cidr: text("cidr").notNull(),
  credentialId: text("credential_id"),
  status: discoveryRunStatusEnum("status").notNull().default("queued"),
  hostsTotal: integer("hosts_total").notNull().default(0),
  hostsScanned: integer("hosts_scanned").notNull().default(0),
  hostsResponsive: integer("hosts_responsive").notNull().default(0),
  hostsDiscovered: integer("hosts_discovered").notNull().default(0),
  errorsCount: integer("errors_count").notNull().default(0),
  message: text("message"),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertNetworkScopeSchema = createInsertSchema(networkScopesTable).omit(
  {
    createdAt: true,
    lastRunAt: true,
  },
);

export const insertSnmpCredentialSchema = createInsertSchema(
  snmpCredentialsTable,
).omit({
  createdAt: true,
});

export const insertDiscoveryRunSchema = createInsertSchema(discoveryRunsTable).omit(
  {
    createdAt: true,
    startedAt: true,
    finishedAt: true,
  },
);

export type InsertNetworkScope = z.infer<typeof insertNetworkScopeSchema>;
export type InsertSnmpCredential = z.infer<typeof insertSnmpCredentialSchema>;
export type InsertDiscoveryRun = z.infer<typeof insertDiscoveryRunSchema>;

export type NetworkScopeRecord = typeof networkScopesTable.$inferSelect;
export type SnmpCredentialRecord = typeof snmpCredentialsTable.$inferSelect;
export type DiscoveryRunRecord = typeof discoveryRunsTable.$inferSelect;
