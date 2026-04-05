import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { networkScopesTable, nodesTable, topologyEdgesTable } from "@workspace/db/schema";

const DEFAULT_TOPOLOGY_PREFIX = 24;

function parseCidrPrefixLength(cidr: string | null | undefined): number | null {
  if (cidr == null || typeof cidr !== "string") return null;
  const trimmed = cidr.trim();
  const slash = trimmed.lastIndexOf("/");
  if (slash < 0 || slash === trimmed.length - 1) return null;
  const p = Number(trimmed.slice(slash + 1));
  if (!Number.isInteger(p) || p < 0 || p > 32) return null;
  return p;
}

const router: IRouter = Router();

function normalizeInterfaceName(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function inferAggregationSignature(value?: string | null) {
  const text = normalizeInterfaceName(value);
  if (!text) return null;
  const patterns = [
    /(port-channel\s*\d+)/i,
    /\b(po\d+)\b/i,
    /\b(bundle-ether\d+)\b/i,
    /\b(ae\d+)\b/i,
    /\b(eth-trunk\d+)\b/i,
    /\b(lag\d+)\b/i,
    /\b(bond\d+)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, "");
  }
  return null;
}

function titleCaseProtocol(protocol: string) {
  if (protocol === "lldp") return "LLDP";
  if (protocol === "cdp") return "CDP";
  if (protocol === "lacp-inferred") return "LACP";
  if (protocol === "telemetry") return "SNMP + ICMP";
  return protocol.toUpperCase();
}

function edgeStrokeColor(utilization: number) {
  if (utilization >= 85) return "hsl(var(--destructive))";
  if (utilization >= 60) return "hsl(var(--warning))";
  return "hsl(var(--primary))";
}

const TELEMETRY_NODE_ID = "telemetry-hub";

function randomLatency(base: number, variance: number): number {
  return parseFloat((base + (Math.random() - 0.5) * variance).toFixed(3));
}

router.get("/", async (req, res) => {
  try {
    const [nodes, edges, scopes] = await Promise.all([
      db.select().from(nodesTable).limit(200),
      db.select().from(topologyEdgesTable).limit(1000),
      db
        .select({ id: networkScopesTable.id, cidr: networkScopesTable.cidr })
        .from(networkScopesTable),
    ]);

    const prefixByScopeId = new Map<string, number>();
    for (const scope of scopes) {
      const fromCidr = parseCidrPrefixLength(scope.cidr);
      prefixByScopeId.set(scope.id, fromCidr ?? DEFAULT_TOPOLOGY_PREFIX);
    }

    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const grouped = new Map<
      string,
      {
        sourceId: string;
        targetId: string;
        interfacesByNode: Map<string, Set<string>>;
        protocols: Set<string>;
        utilizations: number[];
        speeds: number[];
        memberCount: number;
        aggregation: Set<string>;
      }
    >();

    for (const edge of edges) {
      const a = edge.sourceId;
      const b = edge.targetId;
      const orderedPair = [a, b].sort();
      const localSig =
        inferAggregationSignature(edge.localInterface) ??
        normalizeInterfaceName(edge.localInterface) ??
        "unknown-a";
      const remoteSig =
        inferAggregationSignature(edge.remoteInterface) ??
        normalizeInterfaceName(edge.remoteInterface) ??
        "unknown-b";
      const ifaceKey = [localSig, remoteSig].sort().join("|");
      const key = `${orderedPair[0]}__${orderedPair[1]}__${ifaceKey}`;
      const existing =
        grouped.get(key) ??
        {
          sourceId: orderedPair[0],
          targetId: orderedPair[1],
          interfacesByNode: new Map<string, Set<string>>(),
          protocols: new Set<string>(),
          utilizations: [],
          speeds: [],
          memberCount: 0,
          aggregation: new Set<string>(),
        };

      const leftInterfaces = existing.interfacesByNode.get(edge.sourceId) ?? new Set<string>();
      if (edge.localInterface) leftInterfaces.add(edge.localInterface);
      existing.interfacesByNode.set(edge.sourceId, leftInterfaces);

      const rightInterfaces = existing.interfacesByNode.get(edge.targetId) ?? new Set<string>();
      if (edge.remoteInterface) rightInterfaces.add(edge.remoteInterface);
      existing.interfacesByNode.set(edge.targetId, rightInterfaces);

      existing.protocols.add(edge.protocol);
      if (
        inferAggregationSignature(edge.localInterface) ||
        inferAggregationSignature(edge.remoteInterface)
      ) {
        existing.protocols.add("lacp-inferred");
      }
      if (edge.utilization != null) existing.utilizations.push(edge.utilization);
      if (edge.linkSpeed != null) existing.speeds.push(edge.linkSpeed);
      existing.memberCount += 1;
      const aggregationLabel =
        inferAggregationSignature(edge.localInterface) ??
        inferAggregationSignature(edge.remoteInterface);
      if (aggregationLabel) existing.aggregation.add(aggregationLabel);

      grouped.set(key, existing);
    }

    const degreeByNode = new Map<string, number>();
    const aggregatedEdges = Array.from(grouped.entries()).map(([key, group]) => {
      degreeByNode.set(group.sourceId, (degreeByNode.get(group.sourceId) ?? 0) + 1);
      degreeByNode.set(group.targetId, (degreeByNode.get(group.targetId) ?? 0) + 1);
      const leftNodeName = nodeById.get(group.sourceId)?.name ?? group.sourceId;
      const rightNodeName = nodeById.get(group.targetId)?.name ?? group.targetId;
      const avgUtilization =
        group.utilizations.length > 0
          ? Number(
              (
                group.utilizations.reduce((sum, value) => sum + value, 0) /
                group.utilizations.length
              ).toFixed(2),
            )
          : 0;
      const maxUtilization =
        group.utilizations.length > 0 ? Math.max(...group.utilizations) : avgUtilization;
      const protocolList = Array.from(group.protocols);
      const sourceInterfaces = Array.from(
        group.interfacesByNode.get(group.sourceId) ?? new Set<string>(),
      ).sort();
      const targetInterfaces = Array.from(
        group.interfacesByNode.get(group.targetId) ?? new Set<string>(),
      ).sort();
      const aggregatedLabel =
        Array.from(group.aggregation).sort()[0] ??
        sourceInterfaces[0] ??
        targetInterfaces[0] ??
        "link";

      return {
        id: key,
        sourceId: group.sourceId,
        targetId: group.targetId,
        protocol: protocolList[0] ?? "lldp",
        protocols: protocolList,
        protocolLabel: protocolList.map(titleCaseProtocol).join(" + "),
        localInterface: sourceInterfaces[0] ?? null,
        remoteInterface: targetInterfaces[0] ?? null,
        localInterfaces: sourceInterfaces,
        remoteInterfaces: targetInterfaces,
        sourceLabel: leftNodeName,
        targetLabel: rightNodeName,
        linkSpeed:
          group.speeds.length > 0 ? Math.max(...group.speeds) : null,
        utilization: avgUtilization,
        peakUtilization: maxUtilization,
        trafficState:
          maxUtilization >= 85
            ? "hot"
            : maxUtilization >= 60
              ? "warm"
              : maxUtilization > 0
                ? "normal"
                : "idle",
        animationLevel:
          maxUtilization >= 85 ? 3 : maxUtilization >= 60 ? 2 : maxUtilization > 0 ? 1 : 0,
        memberCount: group.memberCount,
        isAggregated: group.aggregation.size > 0 || group.memberCount > 1,
        aggregationLabel: aggregatedLabel,
        strokeColor: edgeStrokeColor(maxUtilization),
        strokeWidth: Math.min(7, 2 + Math.max(0, group.memberCount - 1) + maxUtilization / 40),
      };
    });

    const telemetryTargets =
      aggregatedEdges.length === 0
        ? nodes
        : nodes.filter((node) => (degreeByNode.get(node.id) ?? 0) === 0);

    const telemetryEdges = telemetryTargets.map((node) => {
      const syntheticLoad =
        node.status === "down"
          ? 0
          : node.status === "warning"
            ? 55
            : Math.max(12, Math.min(42, Math.max(node.cpuUsage ?? 0, node.memUsage ?? 0, 18)));
      degreeByNode.set(node.id, (degreeByNode.get(node.id) ?? 0) + 1);
      degreeByNode.set(TELEMETRY_NODE_ID, (degreeByNode.get(TELEMETRY_NODE_ID) ?? 0) + 1);
      return {
        id: `${TELEMETRY_NODE_ID}__${node.id}`,
        sourceId: TELEMETRY_NODE_ID,
        targetId: node.id,
        protocol: "telemetry",
        protocols: ["telemetry"],
        protocolLabel: titleCaseProtocol("telemetry"),
        localInterface: "poller",
        remoteInterface: node.ipAddress,
        localInterfaces: ["poller"],
        remoteInterfaces: [node.ipAddress],
        sourceLabel: "Collector",
        targetLabel: node.name,
        linkSpeed: null,
        utilization: syntheticLoad,
        peakUtilization: syntheticLoad,
        trafficState:
          syntheticLoad >= 60 ? "warm" : syntheticLoad > 0 ? "normal" : "idle",
        animationLevel:
          syntheticLoad >= 60 ? 2 : syntheticLoad > 0 ? 1 : 0,
        memberCount: 1,
        isAggregated: false,
        aggregationLabel: "poller",
        strokeColor: node.status === "down" ? "hsl(var(--muted-foreground))" : edgeStrokeColor(syntheticLoad),
        strokeWidth: aggregatedEdges.length === 0 ? 1.8 : 1.25,
      };
    });

    const responseNodes = [
      ...(telemetryEdges.length > 0
        ? [
            {
              id: TELEMETRY_NODE_ID,
              name: "Collector",
              ipAddress: "127.0.0.1",
              type: "collector",
              status: "up",
              vendor: "NetworkSentinelPRO",
              model: "Telemetry Hub",
              location: "Local poller",
              cpuUsage: null,
              memUsage: null,
              degree: degreeByNode.get(TELEMETRY_NODE_ID) ?? 0,
              isVirtual: true,
              lastPolled: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ]
        : []),
      ...nodes.map((n) => {
        const subnetPrefixLength =
          n.discoveryScopeId != null && prefixByScopeId.has(n.discoveryScopeId)
            ? prefixByScopeId.get(n.discoveryScopeId)!
            : DEFAULT_TOPOLOGY_PREFIX;
        return {
          id: n.id,
          name: n.name,
          ipAddress: n.ipAddress,
          type: n.type,
          status: n.status,
          vendor: n.vendor,
          model: n.model,
          location: n.location,
          cpuUsage: n.cpuUsage,
          memUsage: n.memUsage,
          degree: degreeByNode.get(n.id) ?? 0,
          isVirtual: false,
          subnetPrefixLength,
          lastPolled: n.lastPolled?.toISOString(),
          createdAt: n.createdAt.toISOString(),
        };
      }),
    ];

    res.json({
      nodes: responseNodes,
      edges: [...aggregatedEdges, ...telemetryEdges],
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get topology");
    res.status(500).json({ error: "Failed to get topology" });
  }
});

router.get("/netpath/:nodeId", async (req, res) => {
  try {
    const { nodeId } = req.params;
    const { target = "8.8.8.8" } = req.query as Record<string, string>;

    const hopCount = Math.floor(Math.random() * 8) + 5;
    const hops = [];
    let cumulativeLatency = 0;

    const hopIps = [
      "10.0.0.1", "10.1.0.1", "10.2.0.1", "172.16.0.1",
      "192.168.1.1", "200.143.4.1", "177.52.20.1", "8.8.4.4",
      target
    ];

    for (let i = 0; i < hopCount; i++) {
      const hopLatency = randomLatency(2 + i * 3, 4);
      const minLatency = randomLatency(hopLatency * 0.7, 1);
      const maxLatency = randomLatency(hopLatency * 1.4, 2);
      cumulativeLatency += hopLatency;

      hops.push({
        hop: i + 1,
        ipAddress: i < hopIps.length ? hopIps[i] : `10.${i}.${i}.1`,
        hostname: i === hopCount - 1 ? "dns.google" : `hop-${i + 1}.latam.backbone.net`,
        avgLatency: parseFloat(hopLatency.toFixed(3)),
        minLatency: parseFloat(minLatency.toFixed(3)),
        maxLatency: parseFloat(maxLatency.toFixed(3)),
        packetLoss: Math.random() < 0.05 ? parseFloat((Math.random() * 2).toFixed(2)) : 0,
      });
    }

    res.json({
      sourceNodeId: nodeId,
      target,
      hops,
      totalLatency: parseFloat(cumulativeLatency.toFixed(3)),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get netpath");
    res.status(500).json({ error: "Failed to get netpath" });
  }
});

export default router;
