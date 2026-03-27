import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  nodeInterfacesTable,
  nodesTable,
  topologyEdgesTable,
} from "@workspace/db/schema";
import type {
  SnmpCdpNeighbor,
  SnmpInterfaceSnapshot,
  SnmpLldpNeighbor,
} from "./snmp-client";

function normalize(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizeHostToken(value?: string | null) {
  const text = normalize(value);
  if (!text) return "";
  const withoutDomain = text.split(".")[0] ?? text;
  return withoutDomain.replace(/\(.*?\)/g, "").trim();
}

function normalizeIp(value?: string | null) {
  const text = value?.trim() ?? "";
  const match = text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/);
  return match?.[0] ?? "";
}

function resolveNeighborNode(
  nodes: Array<{
    id: string;
    name: string;
    ipAddress: string;
    sysDescription: string | null;
  }>,
  options: {
    sysName?: string | null;
    remoteAddress?: string | null;
    platform?: string | null;
  },
) {
  const remoteIp = normalizeIp(options.remoteAddress);
  if (remoteIp) {
    const byIp = nodes.find((node) => normalizeIp(node.ipAddress) === remoteIp);
    if (byIp) return byIp;
  }

  const candidateNames = [
    normalize(options.sysName),
    normalizeHostToken(options.sysName),
    normalize(options.platform),
    normalizeHostToken(options.platform),
  ].filter((value) => value.length > 0);

  for (const candidate of candidateNames) {
    const exact =
      nodes.find((node) => normalize(node.name) === candidate) ??
      nodes.find((node) => normalizeHostToken(node.name) === candidate) ??
      nodes.find((node) => normalize(node.sysDescription) === candidate) ??
      null;
    if (exact) return exact;

    const fuzzy =
      nodes.find((node) => normalize(node.name).includes(candidate)) ??
      nodes.find((node) => candidate.includes(normalizeHostToken(node.name))) ??
      null;
    if (fuzzy) return fuzzy;
  }

  return null;
}

function resolveLocalInterface(
  interfaces: SnmpInterfaceSnapshot[] | undefined,
  neighbor: SnmpLldpNeighbor,
) {
  if (!interfaces) return null;
  return (
    interfaces.find((iface) => iface.ifIndex === neighbor.localPortNumber) ??
    interfaces.find((iface) => normalize(iface.name) === normalize(neighbor.localPortName)) ??
    interfaces.find((iface) => normalize(iface.description) === normalize(neighbor.localPortName)) ??
    null
  );
}

export async function syncTopologyFromLldp(input: {
  nodeId: string;
  interfaces?: SnmpInterfaceSnapshot[];
  neighbors?: SnmpLldpNeighbor[];
}) {
  const neighbors = input.neighbors ?? [];

  await db
    .delete(topologyEdgesTable)
    .where(
      and(
        eq(topologyEdgesTable.sourceId, input.nodeId),
        eq(topologyEdgesTable.protocol, "lldp"),
      ),
    );

  if (neighbors.length === 0) return;

  const nodes = await db.select().from(nodesTable);

  for (const neighbor of neighbors) {
    const targetNode = resolveNeighborNode(nodes, {
      sysName: neighbor.remoteSysName,
    });
    if (!targetNode) continue;

    const localInterface = resolveLocalInterface(input.interfaces, neighbor);
    const utilization =
      localInterface?.speedBps && localInterface.speedBps > 0
        ? Math.max(localInterface.inBps ?? 0, localInterface.outBps ?? 0) /
          localInterface.speedBps *
          100
        : 0;

    await db.insert(topologyEdgesTable).values({
      id: `${input.nodeId}:${neighbor.localPortNumber}:${targetNode.id}`,
      sourceId: input.nodeId,
      targetId: targetNode.id,
      protocol: "lldp",
      localInterface:
        localInterface?.name ?? localInterface?.description ?? neighbor.localPortName ?? null,
      remoteInterface: neighbor.remotePortDescription ?? neighbor.remotePortId ?? null,
      linkSpeed: localInterface?.speedBps
        ? Math.round(localInterface.speedBps / 1_000_000)
        : null,
      utilization: Number(utilization.toFixed(2)),
    });
  }
}

export async function syncTopologyFromCdp(input: {
  nodeId: string;
  interfaces?: SnmpInterfaceSnapshot[];
  neighbors?: SnmpCdpNeighbor[];
}) {
  const neighbors = input.neighbors ?? [];

  await db
    .delete(topologyEdgesTable)
    .where(
      and(
        eq(topologyEdgesTable.sourceId, input.nodeId),
        eq(topologyEdgesTable.protocol, "cdp"),
      ),
    );

  if (neighbors.length === 0) return;

  const nodes = await db.select().from(nodesTable);

  for (const neighbor of neighbors) {
    const targetNode = resolveNeighborNode(nodes, {
      sysName: neighbor.remoteDeviceId,
      remoteAddress: neighbor.remoteAddress,
      platform: neighbor.remotePlatform,
    });
    if (!targetNode) continue;

    const localInterface =
      input.interfaces?.find((iface) => iface.ifIndex === neighbor.localIfIndex) ?? null;
    const utilization =
      localInterface?.speedBps && localInterface.speedBps > 0
        ? Math.max(localInterface.inBps ?? 0, localInterface.outBps ?? 0) /
          localInterface.speedBps *
          100
        : 0;

    await db.insert(topologyEdgesTable).values({
      id: `${input.nodeId}:cdp:${neighbor.localIfIndex}:${targetNode.id}`,
      sourceId: input.nodeId,
      targetId: targetNode.id,
      protocol: "cdp",
      localInterface: localInterface?.name ?? localInterface?.description ?? null,
      remoteInterface: neighbor.remotePort ?? null,
      linkSpeed: localInterface?.speedBps
        ? Math.round(localInterface.speedBps / 1_000_000)
        : null,
      utilization: Number(utilization.toFixed(2)),
    });
  }
}
