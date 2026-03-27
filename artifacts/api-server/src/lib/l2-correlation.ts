import { db } from "@workspace/db";
import {
  nodeArpEntriesTable,
  nodeInterfacesTable,
  nodeMacEntriesTable,
  nodePortObservationsTable,
  nodePortProfilesTable,
  nodesTable,
  topologyEdgesTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, or } from "drizzle-orm";

type Confidence = "high" | "medium" | "low";
type EndpointKind = "managed-node" | "endpoint" | "unknown";
type PortRole = "uplink" | "trunk" | "access" | "server-edge" | "unknown";
type RiskSeverity = "critical" | "warning" | "info";

export interface PortRiskFlag {
  code:
    | "mac_flood"
    | "duplicate_mac"
    | "managed_node_on_access"
    | "multi_vlan_edge"
    | "rogue_switch_suspected"
    | "loop_suspected"
    | "uplink_high_utilization"
    | "learned_macs_while_down";
  severity: RiskSeverity;
  message: string;
}

export interface CorrelatedEndpoint {
  macAddress: string;
  vlanId: number | null;
  ipAddresses: string[];
  kind: EndpointKind;
  confidence: Confidence;
  managedNodeId: string | null;
  managedNodeName: string | null;
  managedNodeIp: string | null;
}

export interface CorrelatedPort {
  ifIndex: number | null;
  interfaceName: string;
  alias: string | null;
  adminStatus: string | null;
  operStatus: string | null;
  speedBps: number | null;
  lastInBps: number | null;
  lastOutBps: number | null;
  isUplink: boolean;
  role: PortRole;
  utilizationPct: number | null;
  learnedMacCount: number;
  vlanIds: number[];
  endpointCount: number;
  managedEndpointCount: number;
  riskFlags: PortRiskFlag[];
  endpoints: CorrelatedEndpoint[];
}

export interface CorrelatedAccessView {
  nodeId: string;
  summary: {
    totalPorts: number;
    accessPorts: number;
    uplinkPorts: number;
    trunkPorts: number;
    serverEdgePorts: number;
    totalEndpoints: number;
    managedNeighbors: number;
    suspiciousPorts: number;
    criticalRisks: number;
    warningRisks: number;
  };
  ports: CorrelatedPort[];
}

export interface NodePortProfileView {
  id: string;
  nodeId: string;
  ifIndex: number | null;
  interfaceName: string;
  alias: string | null;
  baselineRole: string | null;
  baselineMacCount: number;
  baselineVlanCount: number;
  baselineEndpointCount: number;
  baselineVlanSignature: string | null;
  lastRole: string | null;
  lastMacCount: number;
  lastVlanCount: number;
  lastEndpointCount: number;
  lastRiskCount: number;
  lastVlanSignature: string | null;
  lastChangeSummary: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  updatedAt: string;
}

export interface NodePortObservationView {
  id: string;
  profileId: string;
  nodeId: string;
  ifIndex: number | null;
  interfaceName: string;
  role: string | null;
  macCount: number;
  vlanCount: number;
  endpointCount: number;
  managedEndpointCount: number;
  riskCount: number;
  vlanSignature: string | null;
  observedAt: string;
}

export interface L2ProfileAlert {
  type: string;
  severity: RiskSeverity;
  message: string;
}

function normalizeMac(value: string) {
  return value.trim().toLowerCase();
}

function inferConfidence(input: {
  isUplink: boolean;
  hasIp: boolean;
  managedNodeId: string | null;
  macsOnPort: number;
}): Confidence {
  if (input.managedNodeId) return "high";
  if (!input.isUplink && input.hasIp && input.macsOnPort <= 2) return "high";
  if (!input.isUplink && input.macsOnPort <= 4) return "medium";
  return "low";
}

function inferRole(input: {
  isUplink: boolean;
  vlanIds: number[];
  learnedMacCount: number;
  managedEndpointCount: number;
}): PortRole {
  if (input.isUplink) return "uplink";
  if (input.vlanIds.length >= 3) return "trunk";
  if (input.managedEndpointCount > 0 && input.learnedMacCount <= 3) return "server-edge";
  if (input.learnedMacCount > 0) return "access";
  return "unknown";
}

function computeUtilizationPct(input: {
  speedBps: number | null;
  lastInBps: number | null;
  lastOutBps: number | null;
}) {
  if (!input.speedBps || input.speedBps <= 0) return null;
  const peak = Math.max(input.lastInBps ?? 0, input.lastOutBps ?? 0);
  return Number(((peak / input.speedBps) * 100).toFixed(2));
}

function buildPortProfileId(nodeId: string, port: { ifIndex: number | null; interfaceName: string }) {
  return `${nodeId}:port:${port.ifIndex ?? "na"}:${port.interfaceName}`;
}

function vlanSignature(vlanIds: number[]) {
  return vlanIds.slice().sort((a, b) => a - b).join(",");
}

function uniqueCount<T>(values: T[]) {
  return new Set(values).size;
}

export async function correlateNodeAccessPorts(
  nodeId: string,
): Promise<CorrelatedAccessView> {
  const [interfaces, macEntries, arpEntries, allArpEntries, allNodes, topologyEdges] =
    await Promise.all([
      db
        .select()
        .from(nodeInterfacesTable)
        .where(eq(nodeInterfacesTable.nodeId, nodeId)),
      db
        .select()
        .from(nodeMacEntriesTable)
        .where(eq(nodeMacEntriesTable.nodeId, nodeId)),
      db
        .select()
        .from(nodeArpEntriesTable)
        .where(eq(nodeArpEntriesTable.nodeId, nodeId)),
      db.select().from(nodeArpEntriesTable),
      db.select().from(nodesTable),
      db
        .select()
        .from(topologyEdgesTable)
        .where(
          or(
            eq(topologyEdgesTable.sourceId, nodeId),
            eq(topologyEdgesTable.targetId, nodeId),
          ),
        ),
    ]);

  const uplinkNames = new Set<string>();
  for (const edge of topologyEdges) {
    if (edge.sourceId === nodeId && edge.localInterface) {
      uplinkNames.add(edge.localInterface);
    }
    if (edge.targetId === nodeId && edge.remoteInterface) {
      uplinkNames.add(edge.remoteInterface);
    }
  }

  const interfaceByIfIndex = new Map(interfaces.map((iface) => [iface.ifIndex, iface]));
  const macPortMembership = new Map<string, Set<string>>();
  for (const entry of macEntries) {
    const portKey = `${entry.ifIndex ?? "na"}:${entry.interfaceName ?? "unknown"}`;
    const mac = normalizeMac(entry.macAddress);
    const ports = macPortMembership.get(mac) ?? new Set<string>();
    ports.add(portKey);
    macPortMembership.set(mac, ports);
  }

  const arpByMac = new Map<string, Set<string>>();
  for (const entry of [...allArpEntries, ...arpEntries]) {
    const mac = normalizeMac(entry.macAddress);
    const set = arpByMac.get(mac) ?? new Set<string>();
    set.add(entry.ipAddress);
    arpByMac.set(mac, set);
  }

  const nodeByIp = new Map(allNodes.map((node) => [node.ipAddress, node]));

  const portGroups = new Map<
    string,
    {
      ifIndex: number | null;
      interfaceName: string;
      interfaceRef: (typeof interfaces)[number] | undefined;
      entries: typeof macEntries;
    }
  >();

  for (const entry of macEntries) {
    const interfaceRef =
      entry.ifIndex != null ? interfaceByIfIndex.get(entry.ifIndex) : undefined;
    const interfaceName =
      interfaceRef?.name ??
      entry.interfaceName ??
      (entry.ifIndex != null ? `if${entry.ifIndex}` : "unknown");
    const key = `${entry.ifIndex ?? "na"}:${interfaceName}`;
    const existing = portGroups.get(key);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    portGroups.set(key, {
      ifIndex: entry.ifIndex ?? null,
      interfaceName,
      interfaceRef,
      entries: [entry],
    });
  }

  const ports: CorrelatedPort[] = Array.from(portGroups.values()).map((group) => {
    const vlanIds = Array.from(
      new Set(group.entries.map((entry) => entry.vlanId).filter((value): value is number => value != null)),
    ).sort((a, b) => a - b);
    const isUplink =
      uplinkNames.has(group.interfaceName) ||
      (group.interfaceRef?.alias != null && uplinkNames.has(group.interfaceRef.alias));

    const endpointMap = new Map<string, CorrelatedEndpoint>();
    for (const entry of group.entries) {
      const macAddress = normalizeMac(entry.macAddress);
      const endpointKey = `${entry.vlanId ?? "na"}:${macAddress}`;
      const ips = Array.from(arpByMac.get(macAddress) ?? []).sort();
      const matchedNode =
        ips.map((ip) => nodeByIp.get(ip)).find((node) => node && node.id !== nodeId) ?? null;
      const kind: EndpointKind = matchedNode
        ? "managed-node"
        : ips.length > 0
          ? "endpoint"
          : "unknown";
      endpointMap.set(endpointKey, {
        macAddress,
        vlanId: entry.vlanId ?? null,
        ipAddresses: ips,
        kind,
        confidence: inferConfidence({
          isUplink,
          hasIp: ips.length > 0,
          managedNodeId: matchedNode?.id ?? null,
          macsOnPort: group.entries.length,
        }),
        managedNodeId: matchedNode?.id ?? null,
        managedNodeName: matchedNode?.name ?? null,
        managedNodeIp: matchedNode?.ipAddress ?? null,
      });
    }

    const endpoints = Array.from(endpointMap.values()).sort((a, b) => {
      if (a.kind === b.kind) return a.macAddress.localeCompare(b.macAddress);
      if (a.kind === "managed-node") return -1;
      if (b.kind === "managed-node") return 1;
      if (a.kind === "endpoint") return -1;
      if (b.kind === "endpoint") return 1;
      return 0;
    });
    const managedEndpointCount = endpoints.filter(
      (endpoint) => endpoint.kind === "managed-node",
    ).length;
    const role = inferRole({
      isUplink,
      vlanIds,
      learnedMacCount: group.entries.length,
      managedEndpointCount,
    });
    const utilizationPct = computeUtilizationPct({
      speedBps: group.interfaceRef?.speedBps ?? null,
      lastInBps: group.interfaceRef?.lastInBps ?? null,
      lastOutBps: group.interfaceRef?.lastOutBps ?? null,
    });
    const riskFlags: PortRiskFlag[] = [];
    const duplicateMacCount = endpoints.filter((endpoint) => {
      const ports = macPortMembership.get(endpoint.macAddress);
      return ports != null && ports.size > 1;
    }).length;

    if (!isUplink && group.entries.length >= 12) {
      riskFlags.push({
        code: "mac_flood",
        severity: group.entries.length >= 24 ? "critical" : "warning",
        message: `Porta aprendeu ${group.entries.length} MACs, acima do esperado para edge.`,
      });
    }
    if (duplicateMacCount > 0) {
      riskFlags.push({
        code: "duplicate_mac",
        severity: duplicateMacCount >= 3 ? "critical" : "warning",
        message: `${duplicateMacCount} MAC(s) também aparecem em outras portas deste nó.`,
      });
    }
    if (role === "access" && managedEndpointCount > 0) {
      riskFlags.push({
        code: "managed_node_on_access",
        severity: "warning",
        message: "Dispositivo gerenciado foi inferido atrás de uma porta de acesso.",
      });
    }
    if (role === "access" && vlanIds.length >= 2) {
      riskFlags.push({
        code: "multi_vlan_edge",
        severity: "info",
        message: `Porta de acesso aprendeu MACs em ${vlanIds.length} VLANs.`,
      });
    }
    if (!isUplink && vlanIds.length >= 3 && group.entries.length >= 8) {
      riskFlags.push({
        code: "rogue_switch_suspected",
        severity: group.entries.length >= 16 ? "critical" : "warning",
        message: `Porta edge com ${group.entries.length} MACs e ${vlanIds.length} VLANs sugere switch/bridge nao autorizado.`,
      });
    }
    if (duplicateMacCount >= 3 && vlanIds.length >= 2) {
      riskFlags.push({
        code: "loop_suspected",
        severity: "critical",
        message: "Duplicidade de MAC em multiplas portas e VLANs sugere loop/bridge indevida.",
      });
    }
    if (isUplink && utilizationPct != null && utilizationPct >= 70) {
      riskFlags.push({
        code: "uplink_high_utilization",
        severity: utilizationPct >= 90 ? "critical" : "warning",
        message: `Uplink com utilização estimada de ${utilizationPct.toFixed(1)}%.`,
      });
    }
    if (
      group.entries.length > 0 &&
      group.interfaceRef?.adminStatus === "up" &&
      group.interfaceRef?.operStatus !== "up"
    ) {
      riskFlags.push({
        code: "learned_macs_while_down",
        severity: "warning",
        message: "Porta com MACs aprendidos mas oper status diferente de up.",
      });
    }

    return {
      ifIndex: group.ifIndex,
      interfaceName: group.interfaceName,
      alias: group.interfaceRef?.alias ?? null,
      adminStatus: group.interfaceRef?.adminStatus ?? null,
      operStatus: group.interfaceRef?.operStatus ?? null,
      speedBps: group.interfaceRef?.speedBps ?? null,
      lastInBps: group.interfaceRef?.lastInBps ?? null,
      lastOutBps: group.interfaceRef?.lastOutBps ?? null,
      isUplink,
      role,
      utilizationPct,
      learnedMacCount: group.entries.length,
      vlanIds,
      endpointCount: endpoints.length,
      managedEndpointCount,
      riskFlags,
      endpoints,
    };
  });

  const sortedPorts = ports.sort((a, b) => {
    if (a.riskFlags.length !== b.riskFlags.length) return b.riskFlags.length - a.riskFlags.length;
    if (a.isUplink !== b.isUplink) return a.isUplink ? 1 : -1;
    if (a.endpointCount !== b.endpointCount) return b.endpointCount - a.endpointCount;
    return a.interfaceName.localeCompare(b.interfaceName);
  });
  const criticalRisks = sortedPorts.reduce(
    (sum, port) => sum + port.riskFlags.filter((risk) => risk.severity === "critical").length,
    0,
  );
  const warningRisks = sortedPorts.reduce(
    (sum, port) => sum + port.riskFlags.filter((risk) => risk.severity === "warning").length,
    0,
  );

  return {
    nodeId,
    summary: {
      totalPorts: sortedPorts.length,
      accessPorts: sortedPorts.filter((port) => port.role === "access").length,
      uplinkPorts: sortedPorts.filter((port) => port.isUplink).length,
      trunkPorts: sortedPorts.filter((port) => port.role === "trunk").length,
      serverEdgePorts: sortedPorts.filter((port) => port.role === "server-edge").length,
      totalEndpoints: sortedPorts.reduce((sum, port) => sum + port.endpointCount, 0),
      managedNeighbors: sortedPorts.reduce(
        (sum, port) =>
          sum + port.endpoints.filter((endpoint) => endpoint.kind === "managed-node").length,
        0,
      ),
      suspiciousPorts: sortedPorts.filter((port) => port.riskFlags.length > 0).length,
      criticalRisks,
      warningRisks,
    },
    ports: sortedPorts,
  };
}

export async function listNodePortProfiles(nodeId: string): Promise<NodePortProfileView[]> {
  const profiles = await db
    .select()
    .from(nodePortProfilesTable)
    .where(eq(nodePortProfilesTable.nodeId, nodeId));
  return profiles
    .map((profile) => ({
      id: profile.id,
      nodeId: profile.nodeId,
      ifIndex: profile.ifIndex,
      interfaceName: profile.interfaceName,
      alias: profile.alias ?? null,
      baselineRole: profile.baselineRole ?? null,
      baselineMacCount: profile.baselineMacCount,
      baselineVlanCount: profile.baselineVlanCount,
      baselineEndpointCount: profile.baselineEndpointCount,
      baselineVlanSignature: profile.baselineVlanSignature ?? null,
      lastRole: profile.lastRole ?? null,
      lastMacCount: profile.lastMacCount,
      lastVlanCount: profile.lastVlanCount,
      lastEndpointCount: profile.lastEndpointCount,
      lastRiskCount: profile.lastRiskCount,
      lastVlanSignature: profile.lastVlanSignature ?? null,
      lastChangeSummary: profile.lastChangeSummary ?? null,
      firstSeenAt: profile.firstSeenAt.toISOString(),
      lastSeenAt: profile.lastSeenAt.toISOString(),
      lastChangedAt: profile.lastChangedAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    }))
    .sort((a, b) => a.interfaceName.localeCompare(b.interfaceName));
}

export async function listNodePortObservations(
  nodeId: string,
  limit = 200,
): Promise<NodePortObservationView[]> {
  const observations = await db
    .select()
    .from(nodePortObservationsTable)
    .where(eq(nodePortObservationsTable.nodeId, nodeId))
    .orderBy(desc(nodePortObservationsTable.observedAt))
    .limit(limit);
  return observations.map((observation) => ({
    id: observation.id,
    profileId: observation.profileId,
    nodeId: observation.nodeId,
    ifIndex: observation.ifIndex,
    interfaceName: observation.interfaceName,
    role: observation.role ?? null,
    macCount: observation.macCount,
    vlanCount: observation.vlanCount,
    endpointCount: observation.endpointCount,
    managedEndpointCount: observation.managedEndpointCount,
    riskCount: observation.riskCount,
    vlanSignature: observation.vlanSignature ?? null,
    observedAt: observation.observedAt.toISOString(),
  }));
}

export async function persistNodePortProfiles(
  nodeId: string,
  now: Date,
): Promise<{ view: CorrelatedAccessView; alerts: L2ProfileAlert[] }> {
  const view = await correlateNodeAccessPorts(nodeId);
  const historyCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const existingProfiles = await db
    .select()
    .from(nodePortProfilesTable)
    .where(eq(nodePortProfilesTable.nodeId, nodeId));
  const recentObservations = await db
    .select()
    .from(nodePortObservationsTable)
    .where(
      and(
        eq(nodePortObservationsTable.nodeId, nodeId),
        gte(nodePortObservationsTable.observedAt, historyCutoff),
      ),
    )
    .orderBy(desc(nodePortObservationsTable.observedAt));
  const existingById = new Map(existingProfiles.map((profile) => [profile.id, profile]));
  const observationsByProfileId = new Map<
    string,
    Array<(typeof recentObservations)[number]>
  >();
  for (const observation of recentObservations) {
    const list = observationsByProfileId.get(observation.profileId) ?? [];
    list.push(observation);
    observationsByProfileId.set(observation.profileId, list);
  }
  const alerts: L2ProfileAlert[] = [];

  for (const port of view.ports) {
    const profileId = buildPortProfileId(nodeId, port);
    const currentVlanSignature = vlanSignature(port.vlanIds);
    const existing = existingById.get(profileId);
    const previousObservations = observationsByProfileId.get(profileId) ?? [];

    const changeMessages: string[] = [];
    if (existing) {
      if (existing.lastRole && existing.lastRole !== port.role) {
        changeMessages.push(`role ${existing.lastRole} -> ${port.role}`);
        alerts.push({
          type: "l2_port_role_change",
          severity: "warning",
          message: `${port.interfaceName}: role mudou de ${existing.lastRole} para ${port.role}.`,
        });
      }
      if (
        existing.lastMacCount > 0 &&
        port.learnedMacCount >= existing.lastMacCount + 10
      ) {
        changeMessages.push(`MACs ${existing.lastMacCount} -> ${port.learnedMacCount}`);
        alerts.push({
          type: "l2_port_mac_spike",
          severity: port.learnedMacCount >= existing.lastMacCount + 20 ? "critical" : "warning",
          message: `${port.interfaceName}: aumento abrupto de MACs aprendidos (${existing.lastMacCount} -> ${port.learnedMacCount}).`,
        });
      }
      if (
        existing.lastVlanSignature &&
        existing.lastVlanSignature !== currentVlanSignature &&
        port.role !== "uplink"
      ) {
        changeMessages.push(
          `VLANs ${existing.lastVlanSignature || "none"} -> ${currentVlanSignature || "none"}`,
        );
        alerts.push({
          type: "l2_port_vlan_shift",
          severity: "warning",
          message: `${port.interfaceName}: conjunto de VLANs mudou de ${existing.lastVlanSignature || "none"} para ${currentVlanSignature || "none"}.`,
        });
      }
    }

    const synthesizedHistory = [
      ...previousObservations.slice(0, 12).map((observation) => ({
        role: observation.role ?? "unknown",
        macCount: observation.macCount,
        vlanSignature: observation.vlanSignature ?? "",
        riskCount: observation.riskCount,
      })),
      {
        role: port.role,
        macCount: port.learnedMacCount,
        vlanSignature: currentVlanSignature,
        riskCount: port.riskFlags.length,
      },
    ];
    const roleVariants = uniqueCount(synthesizedHistory.map((item) => item.role));
    const vlanVariants = uniqueCount(
      synthesizedHistory
        .map((item) => item.vlanSignature)
        .filter((item) => item.length > 0),
    );
    const macCounts = synthesizedHistory.map((item) => item.macCount);
    const maxMacCount = macCounts.length > 0 ? Math.max(...macCounts) : 0;
    const minMacCount = macCounts.length > 0 ? Math.min(...macCounts) : 0;
    const maxRiskCount = synthesizedHistory.length > 0
      ? Math.max(...synthesizedHistory.map((item) => item.riskCount))
      : 0;

    if (roleVariants >= 3 || vlanVariants >= 3) {
      alerts.push({
        type: "l2_port_profile_flap",
        severity: roleVariants >= 4 || vlanVariants >= 4 ? "critical" : "warning",
        message: `${port.interfaceName}: perfil L2 instavel nas ultimas observacoes (roles=${roleVariants}, vlans=${vlanVariants}).`,
      });
    }
    if (maxMacCount >= minMacCount + 12) {
      alerts.push({
        type: "l2_port_mac_churn",
        severity: maxMacCount >= minMacCount + 24 ? "critical" : "warning",
        message: `${port.interfaceName}: forte churn de MACs observado (${minMacCount} -> ${maxMacCount}).`,
      });
    }
    if (maxRiskCount >= 3 && port.riskFlags.length >= 2) {
      alerts.push({
        type: "l2_port_persistent_risk",
        severity: "warning",
        message: `${port.interfaceName}: riscos L2 recorrentes persistem ao longo do tempo.`,
      });
    }

    for (const risk of port.riskFlags) {
      if (risk.severity === "info") continue;
      alerts.push({
        type: `l2_port_risk_${risk.code}`,
        severity: risk.severity,
        message: `${port.interfaceName}: ${risk.message}`,
      });
    }

    await db
      .insert(nodePortProfilesTable)
      .values({
        id: profileId,
        nodeId,
        ifIndex: port.ifIndex ?? null,
        interfaceName: port.interfaceName,
        alias: port.alias ?? null,
        baselineRole: existing?.baselineRole ?? port.role,
        baselineMacCount: existing?.baselineMacCount ?? port.learnedMacCount,
        baselineVlanCount: existing?.baselineVlanCount ?? port.vlanIds.length,
        baselineEndpointCount: existing?.baselineEndpointCount ?? port.endpointCount,
        baselineVlanSignature:
          existing?.baselineVlanSignature ?? currentVlanSignature ?? null,
        lastRole: port.role,
        lastMacCount: port.learnedMacCount,
        lastVlanCount: port.vlanIds.length,
        lastEndpointCount: port.endpointCount,
        lastRiskCount: port.riskFlags.length,
        lastVlanSignature: currentVlanSignature || null,
        lastChangeSummary: changeMessages.length > 0 ? changeMessages.join("; ") : null,
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        lastChangedAt: changeMessages.length > 0 ? now : (existing?.lastChangedAt ?? now),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: nodePortProfilesTable.id,
        set: {
          ifIndex: port.ifIndex ?? null,
          interfaceName: port.interfaceName,
          alias: port.alias ?? null,
          lastRole: port.role,
          lastMacCount: port.learnedMacCount,
          lastVlanCount: port.vlanIds.length,
          lastEndpointCount: port.endpointCount,
          lastRiskCount: port.riskFlags.length,
          lastVlanSignature: currentVlanSignature || null,
          lastChangeSummary: changeMessages.length > 0 ? changeMessages.join("; ") : null,
          lastSeenAt: now,
          lastChangedAt: changeMessages.length > 0 ? now : (existing?.lastChangedAt ?? now),
          updatedAt: now,
        },
      });
    await db.insert(nodePortObservationsTable).values({
      id: `${profileId}:${now.getTime()}`,
      profileId,
      nodeId,
      ifIndex: port.ifIndex ?? null,
      interfaceName: port.interfaceName,
      role: port.role,
      macCount: port.learnedMacCount,
      vlanCount: port.vlanIds.length,
      endpointCount: port.endpointCount,
      managedEndpointCount: port.managedEndpointCount,
      riskCount: port.riskFlags.length,
      vlanSignature: currentVlanSignature || null,
      observedAt: now,
    });
  }

  return { view, alerts };
}
