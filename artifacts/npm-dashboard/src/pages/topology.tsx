import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import ForceGraph2D from "react-force-graph-2d";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, GitBranch, Radar, Server, Share2, Shield } from "lucide-react";

interface TopologyNodeData {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
  status: string;
  vendor?: string | null;
  model?: string | null;
  location?: string | null;
  cpuUsage?: number | null;
  memUsage?: number | null;
  degree: number;
  isVirtual?: boolean;
  lastPolled?: string;
  createdAt?: string;
}

interface TopologyEdgeData {
  id: string;
  sourceId: string;
  targetId: string;
  protocol: string;
  protocols: string[];
  protocolLabel: string;
  localInterfaces: string[];
  remoteInterfaces: string[];
  linkSpeed?: number | null;
  utilization: number;
  peakUtilization: number;
  trafficState: "idle" | "normal" | "warm" | "hot";
  animationLevel: number;
  memberCount: number;
  isAggregated: boolean;
  aggregationLabel: string;
  strokeColor: string;
  strokeWidth: number;
}

interface TopologyResponse {
  nodes: TopologyNodeData[];
  edges: TopologyEdgeData[];
  lastUpdated?: string;
}

interface GraphNode extends TopologyNodeData {
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

interface GraphLink extends TopologyEdgeData {
  source: string | GraphNode;
  target: string | GraphNode;
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function getLastOctet(ipAddress: string) {
  const parts = ipAddress.split(".");
  const last = Number(parts[parts.length - 1]);
  return Number.isFinite(last) ? last : -1;
}

function getSubnetKey(ipAddress: string) {
  const parts = ipAddress.split(".");
  return parts.length >= 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : ipAddress;
}

function isGatewayCandidate(node: TopologyNodeData) {
  const name = normalizeToken(node.name);
  const type = normalizeToken(node.type);
  return (
    getLastOctet(node.ipAddress) === 1 ||
    type === "router" ||
    type === "firewall" ||
    name.includes("gateway") ||
    name.includes("router") ||
    name.includes("firewall") ||
    name.includes("core")
  );
}

function gatewayScore(node: TopologyNodeData) {
  let score = 0;
  const name = normalizeToken(node.name);
  const type = normalizeToken(node.type);
  if (getLastOctet(node.ipAddress) === 1) score += 100;
  if (type === "router") score += 80;
  if (type === "firewall") score += 60;
  if (name.includes("gateway")) score += 70;
  if (name.includes("router")) score += 50;
  if (name.includes("firewall")) score += 40;
  if (name.includes("core")) score += 35;
  if (node.degree > 0) score += Math.min(node.degree * 2, 20);
  return score;
}

function isConcentrator(node: TopologyNodeData) {
  const name = normalizeToken(node.name);
  const type = normalizeToken(node.type);
  return (
    type === "switch" ||
    type === "router" ||
    type === "firewall" ||
    name.startsWith("sw") ||
    name.includes("switch") ||
    name.includes("dist") ||
    name.includes("access") ||
    name.includes("agg") ||
    name.includes("stack") ||
    name.includes("core")
  );
}

function buildSyntheticLink(input: {
  sourceId: string;
  targetId: string;
  protocol?: string;
  protocolLabel: string;
  trafficState: "idle" | "normal" | "warm" | "hot";
  animationLevel: number;
  strokeColor: string;
  strokeWidth: number;
}): GraphLink {
  return {
    id: `${input.sourceId}__${input.targetId}`,
    sourceId: input.sourceId,
    targetId: input.targetId,
    source: input.sourceId,
    target: input.targetId,
    protocol: input.protocol ?? "inferred",
    protocols: [input.protocol ?? "inferred"],
    protocolLabel: input.protocolLabel,
    localInterfaces: [],
    remoteInterfaces: [],
    linkSpeed: null,
    utilization: input.animationLevel > 0 ? 18 : 0,
    peakUtilization: input.animationLevel > 0 ? 18 : 0,
    trafficState: input.trafficState,
    animationLevel: input.animationLevel,
    memberCount: 1,
    isAggregated: false,
    aggregationLabel: "inferred",
    strokeColor: input.strokeColor,
    strokeWidth: input.strokeWidth,
  };
}

function buildHierarchicalGraph(
  topologyData: TopologyResponse | undefined,
  viewport: { width: number; height: number },
) {
  const nodes = topologyData?.nodes ?? [];
  const rawEdges = topologyData?.edges ?? [];
  const collectorNode = nodes.find((node) => node.isVirtual) ?? null;
  const managedNodes = nodes.filter((node) => !node.isVirtual);
  const protocolEdges = rawEdges.filter((edge) => edge.protocol !== "telemetry");
  const realEdgeByPair = new Map<string, TopologyEdgeData>();
  for (const edge of protocolEdges) {
    realEdgeByPair.set(`${edge.sourceId}__${edge.targetId}`, edge);
    realEdgeByPair.set(`${edge.targetId}__${edge.sourceId}`, edge);
  }

  const rootGateway =
    [...managedNodes].sort((a, b) => gatewayScore(b) - gatewayScore(a) || a.name.localeCompare(b.name))[0] ??
    null;

  if (!rootGateway) {
    return {
      nodes: [] as GraphNode[],
      links: [] as GraphLink[],
      rootGateway: null as TopologyNodeData | null,
    };
  }

  const parentByNodeId = new Map<string, string>();
  const childrenByNodeId = new Map<string, string[]>();
  const ensureChildren = (nodeId: string) => {
    const children = childrenByNodeId.get(nodeId) ?? [];
    childrenByNodeId.set(nodeId, children);
    return children;
  };

  const adjacency = new Map<string, Set<string>>();
  for (const edge of protocolEdges) {
    const left = adjacency.get(edge.sourceId) ?? new Set<string>();
    left.add(edge.targetId);
    adjacency.set(edge.sourceId, left);
    const right = adjacency.get(edge.targetId) ?? new Set<string>();
    right.add(edge.sourceId);
    adjacency.set(edge.targetId, right);
  }

  const visited = new Set<string>([rootGateway.id]);
  const queue = [rootGateway.id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const neighbors = Array.from(adjacency.get(current) ?? []);
    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      parentByNodeId.set(neighbor, current);
      ensureChildren(current).push(neighbor);
      queue.push(neighbor);
    }
  }

  const subnetGatewayBySubnet = new Map<string, TopologyNodeData>();
  const concentratorsBySubnet = new Map<string, TopologyNodeData[]>();
  for (const node of managedNodes) {
    const subnet = getSubnetKey(node.ipAddress);
    if (isGatewayCandidate(node)) {
      const existing = subnetGatewayBySubnet.get(subnet);
      if (!existing || gatewayScore(node) > gatewayScore(existing)) {
        subnetGatewayBySubnet.set(subnet, node);
      }
    }
    if (isConcentrator(node) && node.id !== rootGateway.id) {
      const list = concentratorsBySubnet.get(subnet) ?? [];
      list.push(node);
      concentratorsBySubnet.set(subnet, list);
    }
  }

  for (const node of managedNodes) {
    if (node.id === rootGateway.id || parentByNodeId.has(node.id)) continue;
    const subnet = getSubnetKey(node.ipAddress);
    const subnetGateway = subnetGatewayBySubnet.get(subnet);
    const subnetConcentrator =
      (concentratorsBySubnet.get(subnet) ?? [])
        .filter((item) => item.id !== node.id)
        .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))[0] ?? null;

    let parentId = rootGateway.id;
    if (subnet !== getSubnetKey(rootGateway.ipAddress) && subnetGateway && subnetGateway.id !== node.id) {
      parentId = subnetGateway.id === rootGateway.id ? rootGateway.id : subnetGateway.id;
    } else if (isConcentrator(node) && subnetGateway && subnetGateway.id !== node.id) {
      parentId = subnetGateway.id;
    } else if (subnetConcentrator) {
      parentId = subnetConcentrator.id;
    }

    parentByNodeId.set(node.id, parentId);
    ensureChildren(parentId).push(node.id);
  }

  const nodeById = new Map(managedNodes.map((node) => [node.id, node]));
  const subtreeWidthCache = new Map<string, number>();
  const computeSubtreeWidth = (nodeId: string): number => {
    const cached = subtreeWidthCache.get(nodeId);
    if (cached != null) return cached;
    const children = childrenByNodeId.get(nodeId) ?? [];
    if (children.length === 0) {
      subtreeWidthCache.set(nodeId, 1);
      return 1;
    }
    const width = children.reduce((sum, childId) => sum + computeSubtreeWidth(childId), 0);
    subtreeWidthCache.set(nodeId, Math.max(1, width));
    return Math.max(1, width);
  };

  const rootWidth = computeSubtreeWidth(rootGateway.id);
  const xGap = Math.max(180, Math.min(240, viewport.width / Math.max(rootWidth, 6)));
  const yGap = 150;
  const topY = -viewport.height / 2 + 120;
  const positionedByNodeId = new Map<string, GraphNode>();

  const assignPositions = (nodeId: string, left: number, right: number, level: number) => {
    const node = nodeById.get(nodeId);
    if (!node) return;
    const x = (left + right) / 2;
    const y = topY + level * yGap;
    positionedByNodeId.set(nodeId, { ...node, x, y, fx: x, fy: y });

    const children = [...(childrenByNodeId.get(nodeId) ?? [])].sort((a, b) => {
      const leftNode = nodeById.get(a);
      const rightNode = nodeById.get(b);
      if (!leftNode || !rightNode) return 0;
      return Number(isConcentrator(rightNode)) - Number(isConcentrator(leftNode)) || leftNode.name.localeCompare(rightNode.name);
    });
    let cursor = left;
    for (const childId of children) {
      const widthUnits = computeSubtreeWidth(childId);
      const span = widthUnits * xGap;
      assignPositions(childId, cursor, cursor + span, level + 1);
      cursor += span;
    }
  };

  assignPositions(rootGateway.id, -(rootWidth * xGap) / 2, (rootWidth * xGap) / 2, 0);

  const visualLinks: GraphLink[] = [];
  for (const [childId, parentId] of parentByNodeId.entries()) {
    const existingEdge = realEdgeByPair.get(`${parentId}__${childId}`);
    const childNode = nodeById.get(childId);
    if (!childNode) continue;
    if (existingEdge) {
      visualLinks.push({
        ...existingEdge,
        source: parentId,
        target: childId,
      });
      continue;
    }
    const protocolLabel = isConcentrator(childNode)
      ? "Concentrador inferido"
      : "Adjacencia inferida";
    visualLinks.push(
      buildSyntheticLink({
        sourceId: parentId,
        targetId: childId,
        protocolLabel,
        trafficState: childNode.status === "down" ? "idle" : "normal",
        animationLevel: childNode.status === "down" ? 0 : 1,
        strokeColor: childNode.status === "down" ? "#475569" : "#38bdf8",
        strokeWidth: isConcentrator(childNode) ? 2.6 : 1.9,
      }),
    );
  }

  if (collectorNode) {
    const collectorX = -viewport.width / 2 + 140;
    const collectorY = topY;
    positionedByNodeId.set(collectorNode.id, {
      ...collectorNode,
      x: collectorX,
      y: collectorY,
      fx: collectorX,
      fy: collectorY,
    });
    visualLinks.push(
      buildSyntheticLink({
        sourceId: collectorNode.id,
        targetId: rootGateway.id,
        protocol: "telemetry",
        protocolLabel: "Telemetria do poller",
        trafficState: "normal",
        animationLevel: 1,
        strokeColor: "#60a5fa",
        strokeWidth: 2.2,
      }),
    );
  }

  return {
    nodes: Array.from(positionedByNodeId.values()),
    links: visualLinks,
    rootGateway,
  };
}

function statusStroke(status: string) {
  if (status === "down") return "#ef4444";
  if (status === "warning") return "#f59e0b";
  return "#22c55e";
}

function statusFill(status: string, isVirtual?: boolean) {
  if (isVirtual) return "rgba(59, 130, 246, 0.20)";
  if (status === "down") return "rgba(239, 68, 68, 0.14)";
  if (status === "warning") return "rgba(245, 158, 11, 0.14)";
  return "rgba(34, 197, 94, 0.14)";
}

function trafficParticleColor(state: GraphLink["trafficState"]) {
  if (state === "hot") return "#ef4444";
  if (state === "warm") return "#f59e0b";
  return "#22c55e";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function buildLinkLabel(link: TopologyEdgeData) {
  const local = link.localInterfaces.slice(0, 3).join(", ") || "n/a";
  const remote = link.remoteInterfaces.slice(0, 3).join(", ") || "n/a";
  const speed = link.linkSpeed != null ? `${link.linkSpeed} Mb` : "n/a";
  return `
    <div style="padding:8px 10px; max-width: 360px;">
      <div><strong>${link.protocolLabel}</strong></div>
      <div>Utilizacao: ${link.peakUtilization.toFixed(1)}%</div>
      <div>Velocidade: ${speed}</div>
      <div>Local: ${local}</div>
      <div>Remoto: ${remote}</div>
      <div>Membros: ${link.memberCount}</div>
    </div>
  `;
}

function buildNodeLabel(node: TopologyNodeData) {
  return `
    <div style="padding:8px 10px; max-width: 320px;">
      <div><strong>${node.name}</strong></div>
      <div>IP: ${node.ipAddress}</div>
      <div>Status: ${node.status}</div>
      <div>Links: ${node.degree}</div>
      ${node.vendor ? `<div>Vendor: ${node.vendor}</div>` : ""}
      ${node.model ? `<div>Modelo: ${node.model}</div>` : ""}
    </div>
  `;
}

function getNodeBoxMetrics(node: GraphNode, globalScale: number) {
  const isCollector = node.type === "collector";
  const label = node.name;
  const ip = isCollector ? "Telemetry Hub" : node.ipAddress;
  const fontSize = Math.max(9 / globalScale, 3.2);
  const width = Math.max(88, Math.max(label.length, ip.length) * (fontSize * 0.72) + 24);
  const height = fontSize * 3.6;
  return { isCollector, label, ip, fontSize, width, height };
}

export default function Topology() {
  const graphRef = useRef<any>(undefined);
  const { data: topologyData, isLoading } = useQuery({
    queryKey: ["/api/topology/force-graph"],
    queryFn: async (): Promise<TopologyResponse> => {
      const response = await authFetch("/api/topology");
      if (!response.ok) {
        throw new Error(`Falha ao carregar topologia (${response.status})`);
      }
      return response.json();
    },
    refetchInterval: 15000,
  });
  const [viewport, setViewport] = useState({
    width: Math.max(window.innerWidth - 80, 800),
    height: Math.max(window.innerHeight - 240, 620),
  });

  useEffect(() => {
    const onResize = () =>
      setViewport({
        width: Math.max(window.innerWidth - 80, 800),
        height: Math.max(window.innerHeight - 240, 620),
      });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const visualGraph = useMemo(() => {
    return buildHierarchicalGraph(topologyData, viewport);
  }, [topologyData, viewport.height, viewport.width]);
  const graphData = useMemo(() => {
    return { nodes: visualGraph.nodes, links: visualGraph.links };
  }, [visualGraph.links, visualGraph.nodes]);

  const protocolLinks = visualGraph.links.filter((edge) => edge.protocol !== "telemetry").length;
  const telemetryLinks = visualGraph.links.filter((edge) => edge.protocol === "telemetry").length;

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const chargeForce = graph.d3Force("charge");
    if (chargeForce?.strength) {
      chargeForce.strength(-900);
    }
    const linkForce = graph.d3Force("link");
    if (linkForce?.distance) {
      linkForce.distance((link: GraphLink) =>
        link.protocol === "telemetry" ? 190 : 120 + Math.min(link.memberCount * 24, 80),
      );
    }
    if (linkForce?.strength) {
      linkForce.strength((link: GraphLink) => (link.protocol === "telemetry" ? 0.25 : 0.9));
    }
    graph.d3ReheatSimulation();
    window.setTimeout(() => {
      graph.zoomToFit(700, 80);
    }, 900);
  }, [graphData]);

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-mono">Descobrindo topologia e fluxos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono">Topology Map</h1>
          <p className="text-muted-foreground text-sm">
            Arvore operacional com raiz no gateway, ramificacao por adjacencias e concentradores.
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Arraste os dispositivos para reorganizar o desenho. Clique direito no no para soltar a fixacao manual.
          </p>
          <p className="text-muted-foreground text-xs">
            Gateway raiz: <span className="font-mono text-foreground">{visualGraph.rootGateway?.name ?? "indefinido"}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-success"></span><span>Online</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-warning"></span><span>Warning</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-destructive"></span><span>Offline</span></div>
          <div className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-primary" /><span>Particulas de trafego</span></div>
          <div className="flex items-center gap-2"><GitBranch className="h-3.5 w-3.5 text-primary" /><span>Links de protocolo</span></div>
          <div className="flex items-center gap-2"><Radar className="h-3.5 w-3.5 text-primary" /><span>Fluxos de coleta</span></div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 shrink-0">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Links de protocolo</div>
            <div className="mt-1 text-2xl font-mono">{protocolLinks}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Fluxos de coleta</div>
            <div className="mt-1 text-2xl font-mono">{telemetryLinks}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Nos no mapa</div>
            <div className="mt-1 text-2xl font-mono">{topologyData?.nodes.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex-1 glass-panel border-border/50 overflow-hidden relative bg-[#08111f]">
        <CardContent className="p-0 h-full">
          <ForceGraph2D
            ref={graphRef}
            width={viewport.width}
            height={viewport.height}
            graphData={graphData}
            backgroundColor="#08111f"
            nodeRelSize={6}
            cooldownTicks={30}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.35}
            enableNodeDrag
            onNodeDragEnd={(node) => {
              const item = node as GraphNode;
              if (item.isVirtual) return;
              item.fx = item.x;
              item.fy = item.y;
            }}
            onNodeClick={(node) => {
              const item = node as GraphNode;
              if (item.isVirtual) return;
              item.fx = item.x;
              item.fy = item.y;
            }}
            onNodeRightClick={(node) => {
              const item = node as GraphNode;
              if (item.isVirtual) return;
              item.fx = undefined;
              item.fy = undefined;
              graphRef.current?.d3ReheatSimulation();
            }}
            linkWidth={(link) => (link as GraphLink).strokeWidth}
            linkColor={(link) => (link as GraphLink).strokeColor}
            linkDirectionalParticles={(link) => Math.max(0, (link as GraphLink).animationLevel)}
            linkDirectionalParticleWidth={(link) => 2 + (link as GraphLink).animationLevel}
            linkDirectionalParticleColor={(link) => trafficParticleColor((link as GraphLink).trafficState)}
            linkDirectionalParticleSpeed={(link) => 0.0025 * Math.max(1, (link as GraphLink).animationLevel)}
            linkCurvature={(link) => ((link as GraphLink).protocol === "telemetry" ? 0.1 : 0.02)}
            nodeLabel={(node) => buildNodeLabel(node as GraphNode)}
            linkLabel={(link) => buildLinkLabel(link as GraphLink)}
            nodeCanvasObject={(node, ctx, globalScale) => {
              const item = node as GraphNode;
              const { isCollector, label, ip, fontSize, width, height } = getNodeBoxMetrics(
                item,
                globalScale,
              );
              const x = item.x ?? 0;
              const y = item.y ?? 0;

              ctx.save();
              roundRect(ctx, x - width / 2, y - height / 2, width, height, 8 / globalScale);
              ctx.fillStyle = statusFill(item.status, item.isVirtual);
              ctx.fill();
              ctx.lineWidth = isCollector ? 2.2 / globalScale : 1.6 / globalScale;
              ctx.strokeStyle = isCollector ? "#60a5fa" : statusStroke(item.status);
              ctx.stroke();

              ctx.fillStyle = isCollector ? "#93c5fd" : "#e5eefc";
              ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(label, x, y - fontSize * 0.45);

              ctx.fillStyle = "rgba(203, 213, 225, 0.88)";
              ctx.font = `${fontSize * 0.82}px ui-monospace, SFMono-Regular, Menlo, monospace`;
              ctx.fillText(ip, x, y + fontSize * 0.62);
              ctx.restore();
            }}
            nodePointerAreaPaint={(node, color, ctx, globalScale) => {
              const item = node as GraphNode;
              const { width, height } = getNodeBoxMetrics(item, globalScale);
              const x = item.x ?? 0;
              const y = item.y ?? 0;
              ctx.fillStyle = color;
              roundRect(ctx, x - width / 2, y - height / 2, width, height, 8 / globalScale);
              ctx.fill();
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
