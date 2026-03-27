import { randomUUID } from "crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  discoveryRunsTable,
  networkScopesTable,
  nodesTable,
  snmpCredentialsTable,
  type DiscoveryRunRecord,
  type NetworkScopeRecord,
  type SnmpCredentialRecord,
} from "@workspace/db/schema";
import { logger } from "./logger";
import { icmpPingOnce } from "./icmp-ping";
import { fetchSnmpIdentity } from "./snmp-client";

const DEFAULT_CONCURRENCY = 24;
const DEFAULT_MAX_HOSTS = 4096;

type NodeKind = "router" | "switch" | "firewall" | "server" | "unknown";

interface LiveRunState {
  id: string;
  cidr: string;
  scopeId?: string | null;
  scopeName?: string | null;
  credentialId?: string | null;
  status: DiscoveryRunRecord["status"];
  hostsTotal: number;
  hostsScanned: number;
  hostsResponsive: number;
  hostsDiscovered: number;
  errorsCount: number;
  message?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface DiscoveryRunInput {
  cidr: string;
  scopeId?: string | null;
  scopeName?: string | null;
  credentialId?: string | null;
}

const liveRuns = new Map<string, LiveRunState>();

function ipv4ToInt(ip: string) {
  const parts = ip.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 4 ||
    parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)
  ) {
    throw new Error(`IPv4 inválido: ${ip}`);
  }
  return (
    ((parts[0] << 24) >>> 0) +
    ((parts[1] << 16) >>> 0) +
    ((parts[2] << 8) >>> 0) +
    (parts[3] >>> 0)
  ) >>> 0;
}

function intToIpv4(value: number) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join(".");
}

function expandCidr(cidr: string) {
  const [baseIp, prefixRaw] = cidr.trim().split("/");
  const prefix = Number.parseInt(prefixRaw ?? "", 10);
  if (!baseIp || Number.isNaN(prefix) || prefix < 0 || prefix > 32) {
    throw new Error(`CIDR inválido: ${cidr}`);
  }

  const ipInt = ipv4ToInt(baseIp);
  const mask =
    prefix === 0 ? 0 : (((0xffffffff << (32 - prefix)) >>> 0) & 0xffffffff) >>> 0;
  const network = ipInt & mask;
  const broadcast = network | (~mask >>> 0);

  if (prefix >= 31) {
    return [intToIpv4(network)];
  }

  const hostCount = broadcast - network - 1;
  const maxHosts = Number.parseInt(
    process.env.DISCOVERY_MAX_HOSTS_PER_RUN ?? `${DEFAULT_MAX_HOSTS}`,
    10,
  );
  if (hostCount > maxHosts) {
    throw new Error(
      `Escopo ${cidr} excede o limite atual de ${maxHosts} hosts por execução.`,
    );
  }

  const hosts: string[] = [];
  for (let current = network + 1; current < broadcast; current += 1) {
    hosts.push(intToIpv4(current >>> 0));
  }
  return hosts;
}

function inferVendor(sysDescr?: string | null) {
  if (!sysDescr) return undefined;
  const text = sysDescr.toLowerCase();
  if (text.includes("cisco")) return "Cisco";
  if (text.includes("juniper")) return "Juniper";
  if (text.includes("arista")) return "Arista";
  if (text.includes("palo alto")) return "Palo Alto";
  if (text.includes("fortinet")) return "Fortinet";
  if (text.includes("mikrotik")) return "MikroTik";
  if (text.includes("hpe") || text.includes("procurve") || text.includes("aruba")) {
    return "HPE/Aruba";
  }
  if (text.includes("windows")) return "Microsoft";
  if (text.includes("linux")) return "Linux";
  return undefined;
}

function inferNodeType(
  sysDescr?: string | null,
  interfaceCount?: number | null,
): NodeKind {
  const text = (sysDescr ?? "").toLowerCase();
  if (
    text.includes("firewall") ||
    text.includes("fortigate") ||
    text.includes("palo alto") ||
    text.includes("asa")
  ) {
    return "firewall";
  }
  if (
    text.includes("switch") ||
    text.includes("catalyst") ||
    text.includes("nexus") ||
    (interfaceCount ?? 0) >= 24
  ) {
    return "switch";
  }
  if (
    text.includes("router") ||
    text.includes("ios xe") ||
    text.includes("ios xr") ||
    text.includes("junos")
  ) {
    return "router";
  }
  if (
    text.includes("windows") ||
    text.includes("linux") ||
    text.includes("ubuntu") ||
    text.includes("vmware") ||
    text.includes("server")
  ) {
    return "server";
  }
  return "unknown";
}

async function persistRun(state: LiveRunState) {
  await db
    .update(discoveryRunsTable)
    .set({
      status: state.status,
      hostsTotal: state.hostsTotal,
      hostsScanned: state.hostsScanned,
      hostsResponsive: state.hostsResponsive,
      hostsDiscovered: state.hostsDiscovered,
      errorsCount: state.errorsCount,
      message: state.message ?? null,
      startedAt: state.startedAt,
      finishedAt: state.finishedAt,
    })
    .where(eq(discoveryRunsTable.id, state.id));
}

async function upsertDiscoveredNode(input: {
  ipAddress: string;
  pingOk: boolean;
  latencyMs: number | null;
  credential?: SnmpCredentialRecord | null;
  snmpIdentity?: Awaited<ReturnType<typeof fetchSnmpIdentity>>;
  scopeId?: string | null;
}) {
  const { ipAddress, pingOk, credential, snmpIdentity, latencyMs, scopeId } = input;
  const name = snmpIdentity?.sysName?.trim() || ipAddress;
  const sysDescription = snmpIdentity?.sysDescr?.trim() || null;
  const interfaceCount = snmpIdentity?.interfaceCount ?? 0;
  const vendor = inferVendor(sysDescription);
  const type = inferNodeType(sysDescription, interfaceCount);
  const lastPolled = new Date();

  await db
    .insert(nodesTable)
    .values({
      id: randomUUID(),
      name,
      ipAddress,
      type,
      status: pingOk ? "up" : "unknown",
      discoveryScopeId: scopeId ?? null,
      credentialId: credential?.id ?? null,
      vendor,
      sysDescription,
      interfaceCount,
      uptime: snmpIdentity?.uptime ?? 0,
      lastPolled,
      snmpVersion: credential?.version ?? "v2c",
      snmpCommunity:
        credential?.version === "v1" || credential?.version === "v2c"
          ? (credential.community ?? "public")
          : undefined,
    })
    .onConflictDoUpdate({
      target: nodesTable.ipAddress,
      set: {
        name,
        type,
        status: pingOk ? "up" : "unknown",
        discoveryScopeId: scopeId ?? null,
        credentialId: credential?.id ?? null,
        vendor,
        sysDescription,
        interfaceCount,
        uptime: snmpIdentity?.uptime ?? 0,
        lastPolled,
      },
    });

  return {
    name,
    ipAddress,
    status: pingOk ? "up" : "unknown",
    latencyMs,
    viaSnmp: Boolean(snmpIdentity),
  };
}

async function runPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency: number,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function resolveCredential(credentialId?: string | null) {
  if (!credentialId) return null;
  const [credential] = await db
    .select()
    .from(snmpCredentialsTable)
    .where(
      and(
        eq(snmpCredentialsTable.id, credentialId),
        eq(snmpCredentialsTable.enabled, true),
      ),
    )
    .limit(1);
  return credential ?? null;
}

async function executeRun(state: LiveRunState) {
  try {
    const credential = await resolveCredential(state.credentialId);
    const hosts = expandCidr(state.cidr);
    state.status = "running";
    state.startedAt = new Date();
    state.hostsTotal = hosts.length;
    state.message = `Varrendo ${hosts.length} hosts em ${state.cidr}`;
    liveRuns.set(state.id, state);
    await persistRun(state);

    const concurrency = Number.parseInt(
      process.env.DISCOVERY_HOST_CONCURRENCY ?? `${DEFAULT_CONCURRENCY}`,
      10,
    );

    await runPool(
      hosts,
      async (hostIp, idx) => {
        try {
          const ping = await icmpPingOnce(hostIp, 1800);
          const snmpIdentity = credential
            ? await fetchSnmpIdentity(hostIp, credential)
            : null;
          const discovered = ping.ok || snmpIdentity != null;

          if (ping.ok) {
            state.hostsResponsive += 1;
          }

          if (discovered) {
            await upsertDiscoveredNode({
              ipAddress: hostIp,
              pingOk: ping.ok,
              latencyMs: ping.ok ? ping.rttMs : null,
              credential,
              snmpIdentity,
              scopeId: state.scopeId,
            });
            state.hostsDiscovered += 1;
          }
        } catch (error) {
          state.errorsCount += 1;
          logger.warn({ err: error, hostIp, runId: state.id }, "Discovery host failed");
        } finally {
          state.hostsScanned += 1;
          if ((idx + 1) % 25 === 0 || state.hostsScanned === state.hostsTotal) {
            await persistRun(state);
          }
        }
      },
      concurrency,
    );

    state.status = "completed";
    state.finishedAt = new Date();
    state.message = `Discovery concluído: ${state.hostsDiscovered} dispositivos encontrados`;
    await persistRun(state);

    if (state.scopeId) {
      await db
        .update(networkScopesTable)
        .set({ lastRunAt: state.finishedAt })
        .where(eq(networkScopesTable.id, state.scopeId));
    }
  } catch (error) {
    state.status = "failed";
    state.finishedAt = new Date();
    state.message = error instanceof Error ? error.message : "Discovery falhou";
    await persistRun(state);
    logger.error({ err: error, runId: state.id }, "Discovery run failed");
  }
}

export async function queueDiscoveryRun(input: DiscoveryRunInput) {
  const state: LiveRunState = {
    id: randomUUID(),
    cidr: input.cidr,
    scopeId: input.scopeId,
    scopeName: input.scopeName,
    credentialId: input.credentialId,
    status: "queued",
    hostsTotal: 0,
    hostsScanned: 0,
    hostsResponsive: 0,
    hostsDiscovered: 0,
    errorsCount: 0,
    message: "Discovery em fila",
  };

  await db.insert(discoveryRunsTable).values({
    id: state.id,
    scopeId: state.scopeId ?? null,
    scopeName: state.scopeName ?? null,
    cidr: state.cidr,
    credentialId: state.credentialId ?? null,
    status: state.status,
    message: state.message,
  });

  liveRuns.set(state.id, state);
  void executeRun(state).finally(() => {
    liveRuns.set(state.id, state);
  });

  return state;
}

export async function queueDiscoveryRunsForScopes(scopeIds: string[]) {
  const scopes = await db
    .select()
    .from(networkScopesTable)
    .where(inArray(networkScopesTable.id, scopeIds));

  const runs: LiveRunState[] = [];
  for (const scope of scopes) {
    if (!scope.enabled) continue;
    runs.push(
      await queueDiscoveryRun({
        cidr: scope.cidr,
        scopeId: scope.id,
        scopeName: scope.name,
        credentialId: scope.defaultCredentialId,
      }),
    );
  }
  return runs;
}

function mergeLive(record: DiscoveryRunRecord) {
  const live = liveRuns.get(record.id);
  if (!live) {
    return record;
  }
  return {
    ...record,
    status: live.status,
    hostsTotal: live.hostsTotal,
    hostsScanned: live.hostsScanned,
    hostsResponsive: live.hostsResponsive,
    hostsDiscovered: live.hostsDiscovered,
    errorsCount: live.errorsCount,
    message: live.message ?? record.message,
    startedAt: live.startedAt ?? record.startedAt,
    finishedAt: live.finishedAt ?? record.finishedAt,
  };
}

export async function listDiscoveryRuns(limit = 30) {
  const runs = await db
    .select()
    .from(discoveryRunsTable)
    .orderBy(desc(discoveryRunsTable.createdAt))
    .limit(limit);
  return runs.map(mergeLive);
}

export async function getDiscoveryRun(runId: string) {
  const [run] = await db
    .select()
    .from(discoveryRunsTable)
    .where(eq(discoveryRunsTable.id, runId))
    .limit(1);
  return run ? mergeLive(run) : null;
}

export async function listNetworkScopes() {
  return db
    .select()
    .from(networkScopesTable)
    .orderBy(desc(networkScopesTable.createdAt));
}

export async function listSnmpCredentials() {
  return db
    .select()
    .from(snmpCredentialsTable)
    .orderBy(desc(snmpCredentialsTable.createdAt));
}

export function redactCredential<T extends SnmpCredentialRecord>(credential: T) {
  return {
    ...credential,
    community: credential.community ? "********" : null,
    authPassword: credential.authPassword ? "********" : null,
    privPassword: credential.privPassword ? "********" : null,
  };
}

export async function getScope(scopeId: string) {
  const [scope] = await db
    .select()
    .from(networkScopesTable)
    .where(eq(networkScopesTable.id, scopeId))
    .limit(1);
  return scope ?? null;
}

export async function getCredential(credentialId: string) {
  const [credential] = await db
    .select()
    .from(snmpCredentialsTable)
    .where(eq(snmpCredentialsTable.id, credentialId))
    .limit(1);
  return credential ?? null;
}

export async function countRunningDiscoveryRuns() {
  const runs = await listDiscoveryRuns(100);
  return runs.filter((run) => run.status === "queued" || run.status === "running")
    .length;
}
