import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import ForceGraph2D from "react-force-graph-2d";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  GitBranch,
  GripHorizontal,
  Maximize2,
  Radar,
  Server,
  Share2,
  Shield,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
  /** Prefixo L3 do scope de descoberta (ex.: 16 em 10.0.0.0/16). Omite-se → 24. */
  subnetPrefixLength?: number;
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

const DEFAULT_SUBNET_PREFIX = 24;

function nodeSubnetPrefix(n: TopologyNodeData): number {
  const p = n.subnetPrefixLength;
  if (p == null || !Number.isFinite(p)) return DEFAULT_SUBNET_PREFIX;
  const r = Math.round(p);
  if (r < 0 || r > 32) return DEFAULT_SUBNET_PREFIX;
  return r;
}

function parseIpv4ToInt(ipAddress: string): number | null {
  const parts = ipAddress.trim().split(".");
  if (parts.length !== 4) return null;
  const o = parts.map((x) => Number(x));
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0) as number;
}

function formatIpv4FromInt(n: number): string {
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

/** Chave canónica da rede IPv4 para o prefixo dado (ex.: 10.0.5.9 + 16 → 10.0.0.0/16). */
function getNetworkSegmentKey(ipAddress: string, prefixLength: number): string {
  const n = parseIpv4ToInt(ipAddress);
  if (n === null) return ipAddress;
  const p = Math.max(0, Math.min(32, Math.round(prefixLength)));
  const mask = p === 0 ? 0 : ((0xffffffff << (32 - p)) >>> 0) as number;
  const net = (n & mask) >>> 0;
  return `${formatIpv4FromInt(net)}/${p}`;
}

function parseSegmentKey(key: string): { base: number; prefix: number } | null {
  const slash = key.lastIndexOf("/");
  if (slash < 0) return null;
  const base = parseIpv4ToInt(key.slice(0, slash));
  const prefix = Number(key.slice(slash + 1));
  if (base === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return { base, prefix };
}

function ipv4InPrefix(ip: string, networkBase: number, prefixLength: number): boolean {
  const n = parseIpv4ToInt(ip);
  if (n === null) return false;
  const p = Math.max(0, Math.min(32, prefixLength));
  const mask = p === 0 ? 0 : ((0xffffffff << (32 - p)) >>> 0) as number;
  return ((n & mask) >>> 0) === (networkBase & mask);
}

function getLastOctet(ipAddress: string) {
  const parts = ipAddress.split(".");
  const last = Number(parts[parts.length - 1]);
  return Number.isFinite(last) ? last : -1;
}

/** Mesmo «site» L3 que a raiz, usando o prefixo mais curto dos dois (visão mais abrangente). */
function sameL3SiteAsRoot(node: TopologyNodeData, root: TopologyNodeData): boolean {
  const p = Math.min(nodeSubnetPrefix(node), nodeSubnetPrefix(root));
  return getNetworkSegmentKey(node.ipAddress, p) === getNetworkSegmentKey(root.ipAddress, p);
}

function findGatewayForNode(
  node: TopologyNodeData,
  subnetGatewayBySegment: Map<string, TopologyNodeData>,
): TopologyNodeData | undefined {
  const exactKey = getNetworkSegmentKey(node.ipAddress, nodeSubnetPrefix(node));
  const direct = subnetGatewayBySegment.get(exactKey);
  if (direct) return direct;
  let best: { prefix: number; gw: TopologyNodeData } | undefined;
  for (const [seg, gw] of subnetGatewayBySegment) {
    const parsed = parseSegmentKey(seg);
    if (!parsed) continue;
    if (!ipv4InPrefix(node.ipAddress, parsed.base, parsed.prefix)) continue;
    if (!best || parsed.prefix > best.prefix) best = { prefix: parsed.prefix, gw: gw };
  }
  return best?.gw;
}

function findConcentratorsForNode(
  node: TopologyNodeData,
  concentratorsBySegment: Map<string, TopologyNodeData[]>,
): TopologyNodeData[] {
  const exactKey = getNetworkSegmentKey(node.ipAddress, nodeSubnetPrefix(node));
  const fromExact = concentratorsBySegment.get(exactKey);
  const merged = new Map<string, TopologyNodeData>();
  if (fromExact) {
    for (const c of fromExact) merged.set(c.id, c);
  }
  for (const [seg, list] of concentratorsBySegment) {
    if (seg === exactKey) continue;
    const parsed = parseSegmentKey(seg);
    if (!parsed) continue;
    if (!ipv4InPrefix(node.ipAddress, parsed.base, parsed.prefix)) continue;
    for (const c of list) merged.set(c.id, c);
  }
  return Array.from(merged.values());
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

  const subnetGatewayBySegment = new Map<string, TopologyNodeData>();
  const concentratorsBySegment = new Map<string, TopologyNodeData[]>();
  for (const node of managedNodes) {
    const segment = getNetworkSegmentKey(node.ipAddress, nodeSubnetPrefix(node));
    if (isGatewayCandidate(node)) {
      const existing = subnetGatewayBySegment.get(segment);
      if (!existing || gatewayScore(node) > gatewayScore(existing)) {
        subnetGatewayBySegment.set(segment, node);
      }
    }
    if (isConcentrator(node) && node.id !== rootGateway.id) {
      const list = concentratorsBySegment.get(segment) ?? [];
      list.push(node);
      concentratorsBySegment.set(segment, list);
    }
  }

  for (const node of managedNodes) {
    if (node.id === rootGateway.id || parentByNodeId.has(node.id)) continue;
    const subnetGateway = findGatewayForNode(node, subnetGatewayBySegment);
    const subnetConcentrator =
      findConcentratorsForNode(node, concentratorsBySegment)
        .filter((item) => item.id !== node.id)
        .sort((a, b) => b.degree - a.degree || a.name.localeCompare(b.name))[0] ?? null;

    let parentId = rootGateway.id;
    if (
      !sameL3SiteAsRoot(node, rootGateway) &&
      subnetGateway &&
      subnetGateway.id !== node.id
    ) {
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
    /* Sem fx/fy: nós movem-se livremente; só posição inicial (o colector virtual mantém-se fixo). */
    positionedByNodeId.set(nodeId, { ...node, x, y });

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
  if (state === "idle") return "#64748b";
  return "#22c55e";
}

/** Partículas ao longo do link: mínimo 1 para mostrar fluxo; mais com carga (API). */
function linkParticleCount(link: GraphLink): number {
  if (link.trafficState === "idle" && link.animationLevel === 0) {
    return 1;
  }
  return Math.min(8, Math.max(1, link.animationLevel + 1));
}

function linkParticleSpeed(link: GraphLink): number {
  const level = Math.max(0, link.animationLevel);
  const base = link.trafficState === "idle" ? 0.005 : 0.008;
  return base + level * 0.006;
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
  const seg =
    node.subnetPrefixLength != null
      ? `<div>Mapa L3: /${node.subnetPrefixLength} (${getNetworkSegmentKey(node.ipAddress, nodeSubnetPrefix(node))})</div>`
      : "";
  return `
    <div style="padding:8px 10px; max-width: 320px;">
      <div><strong>${node.name}</strong></div>
      <div>IP: ${node.ipAddress}</div>
      ${seg}
      <div>Status: ${node.status}</div>
      <div>Links: ${node.degree}</div>
      ${node.vendor ? `<div>Vendor: ${node.vendor}</div>` : ""}
      ${node.model ? `<div>Modelo: ${node.model}</div>` : ""}
    </div>
  `;
}

type PersistedNodePos = {
  x: number;
  y: number;
  fx?: number;
  fy?: number;
};

/** Mantém posições entre refetches da API (evita saltar para a árvore inicial). */
function mergePersistedPositions(
  nodes: GraphNode[],
  store: Map<string, PersistedNodePos>,
): void {
  const ids = new Set(nodes.map((n) => n.id));
  for (const id of [...store.keys()]) {
    if (!ids.has(id)) store.delete(id);
  }
  for (const n of nodes) {
    if (n.isVirtual) continue;
    const p = store.get(n.id);
    if (!p) continue;
    n.x = p.x;
    n.y = p.y;
    if (p.fx !== undefined && p.fy !== undefined) {
      n.fx = p.fx;
      n.fy = p.fy;
    } else {
      n.fx = undefined;
      n.fy = undefined;
    }
  }
}

function persistNodePosition(node: GraphNode, store: Map<string, PersistedNodePos>) {
  if (node.isVirtual || node.x == null || node.y == null) return;
  store.set(node.id, {
    x: node.x,
    y: node.y,
    fx: node.fx,
    fy: node.fy,
  });
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

const TOPOLOGY_TOP_PANEL_STORAGE = "npm-enterprise.topology.topPanelPx";
const TOP_PANEL_MIN = 132;
const GRAPH_AREA_MIN = 200;
const TOP_PANEL_DEFAULT = 300;
const TOP_PANEL_CLICK_STEP = 56;

function readStoredTopPanelPx(): number | null {
  try {
    const raw = sessionStorage.getItem(TOPOLOGY_TOP_PANEL_STORAGE);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeStoredTopPanelPx(px: number) {
  try {
    sessionStorage.setItem(TOPOLOGY_TOP_PANEL_STORAGE, String(px));
  } catch {
    /* ignore */
  }
}

export default function Topology() {
  const graphRef = useRef<any>(undefined);
  const nodePositionsRef = useRef<Map<string, PersistedNodePos>>(new Map());
  const lastZoomLayoutKeyRef = useRef<number | null>(null);
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
  const pageRef = useRef<HTMLDivElement>(null);
  const graphHostRef = useRef<HTMLDivElement>(null);
  const topPanelDragRef = useRef<{ startY: number; startTop: number; parentH: number } | null>(null);
  const topPanelPxRef = useRef(TOP_PANEL_DEFAULT);
  const [viewport, setViewport] = useState({ width: 960, height: 640 });
  const [layoutResetKey, setLayoutResetKey] = useState(0);
  const [topPanelPx, setTopPanelPx] = useState(() => readStoredTopPanelPx() ?? TOP_PANEL_DEFAULT);
  const [immersiveMap, setImmersiveMap] = useState(false);

  topPanelPxRef.current = topPanelPx;

  const clampTopPanel = (px: number, parentHeight: number) => {
    if (!Number.isFinite(parentHeight) || parentHeight < 120) return px;
    const splitterAndGaps = 56;
    const maxTop = Math.max(
      TOP_PANEL_MIN,
      parentHeight - GRAPH_AREA_MIN - splitterAndGaps,
    );
    return Math.min(maxTop, Math.max(TOP_PANEL_MIN, Math.round(px)));
  };

  useEffect(() => {
    if (isLoading || immersiveMap) return;
    const sync = () => {
      const el = pageRef.current;
      if (!el) return;
      const h = el.getBoundingClientRect().height;
      if (h < 80) return;
      setTopPanelPx((t) => clampTopPanel(t, h));
    };
    sync();
    const el = pageRef.current;
    let ro: ResizeObserver | undefined;
    if (el) {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(sync);
      });
      ro.observe(el);
    }
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, [isLoading, immersiveMap]);

  useEffect(() => {
    const el = graphHostRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      setViewport({
        width: Math.max(280, Math.floor(w)),
        height: Math.max(160, Math.floor(h)),
      });
    };
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      apply(cr.width, cr.height);
    });
    ro.observe(el);
    const id = requestAnimationFrame(() => {
      apply(el.clientWidth, el.clientHeight);
    });
    return () => {
      cancelAnimationFrame(id);
      ro.disconnect();
    };
  }, [immersiveMap]);

  useEffect(() => {
    if (!immersiveMap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setImmersiveMap(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [immersiveMap]);

  useEffect(() => {
    if (!immersiveMap) return;
    const t = window.setTimeout(() => {
      graphRef.current?.zoomToFit(520, 72);
    }, 350);
    return () => window.clearTimeout(t);
  }, [immersiveMap, viewport.width, viewport.height]);

  const visualGraph = useMemo(() => {
    const built = buildHierarchicalGraph(topologyData, viewport);
    mergePersistedPositions(built.nodes, nodePositionsRef.current);
    return built;
  }, [topologyData, viewport.height, viewport.width, layoutResetKey]);
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
      chargeForce.strength(-520);
    }
    const linkForce = graph.d3Force("link");
    if (linkForce?.distance) {
      linkForce.distance((link: GraphLink) =>
        link.protocol === "telemetry" ? 190 : 120 + Math.min(link.memberCount * 24, 80),
      );
    }
    if (linkForce?.strength) {
      linkForce.strength((link: GraphLink) => (link.protocol === "telemetry" ? 0.22 : 0.55));
    }
    graph.d3ReheatSimulation();
  }, [graphData]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || graphData.nodes.length === 0) return;
    if (lastZoomLayoutKeyRef.current === layoutResetKey) return;
    lastZoomLayoutKeyRef.current = layoutResetKey;
    const t = window.setTimeout(() => {
      graph.zoomToFit(700, 80);
    }, 900);
    return () => window.clearTimeout(t);
  }, [graphData, layoutResetKey]);

  if (isLoading) {
    return (
      <div className="flex min-h-[min(60dvh,520px)] w-full flex-1 flex-col items-center justify-center space-y-4 py-12">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-mono">Descobrindo topologia e fluxos...</p>
      </div>
    );
  }

  const nudgeTopPanel = (delta: number) => {
    const el = pageRef.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    setTopPanelPx((t) => {
      const next = clampTopPanel(t + delta, h);
      writeStoredTopPanelPx(next);
      return next;
    });
  };

  const renderGraph = () => (
    <div ref={graphHostRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
      <Card
        className={`relative h-full min-h-[200px] overflow-hidden bg-[#08111f] ${
          immersiveMap
            ? "rounded-lg border border-white/10 shadow-2xl"
            : "glass-panel border-border/50"
        }`}
      >
        <CardContent className="h-full p-0">
          <ForceGraph2D
            key={`topo-fg-${layoutResetKey}`}
            ref={graphRef}
            width={viewport.width}
            height={viewport.height}
            graphData={graphData}
            backgroundColor="#08111f"
            nodeRelSize={6}
            cooldownTicks={120}
            d3AlphaDecay={0.022}
            d3VelocityDecay={0.28}
            enableNodeDrag
            onNodeDrag={(node) => {
              const item = node as GraphNode;
              if (item.isVirtual) return;
              item.fx = item.x;
              item.fy = item.y;
              persistNodePosition(item, nodePositionsRef.current);
            }}
            onNodeDragEnd={(node) => {
              const item = node as GraphNode;
              if (item.isVirtual) return;
              item.fx = item.x;
              item.fy = item.y;
              persistNodePosition(item, nodePositionsRef.current);
            }}
            onNodeRightClick={(node, event) => {
              event?.preventDefault?.();
              const item = node as GraphNode;
              if (item.isVirtual) return;
              nodePositionsRef.current.delete(item.id);
              item.fx = undefined;
              item.fy = undefined;
              graphRef.current?.d3ReheatSimulation();
            }}
            linkWidth={(link) => (link as GraphLink).strokeWidth}
            linkColor={(link) => (link as GraphLink).strokeColor}
            linkDirectionalParticles={(link) => linkParticleCount(link as GraphLink)}
            linkDirectionalParticleWidth={(link) =>
              2.2 + Math.min(4, (link as GraphLink).animationLevel * 1.1)
            }
            linkDirectionalParticleColor={(link) => trafficParticleColor((link as GraphLink).trafficState)}
            linkDirectionalParticleSpeed={(link) => linkParticleSpeed(link as GraphLink)}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
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

  if (immersiveMap) {
    return createPortal(
      <div className="fixed inset-0 z-[400] flex flex-col bg-[#08111f]">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0a1628] px-4 py-2.5">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="truncate text-sm font-semibold text-foreground">Topology Map</span>
            <span className="text-xs text-muted-foreground">
              <kbd className="mr-1 rounded border border-white/20 bg-black/30 px-1.5 py-0.5 font-mono text-[10px]">
                ESC
              </kbd>
              para voltar à vista normal
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-xs"
              onClick={() => {
                nodePositionsRef.current.clear();
                setLayoutResetKey((k) => k + 1);
              }}
            >
              Repor layout
            </Button>
            <Button type="button" variant="default" size="sm" onClick={() => setImmersiveMap(false)}>
              <X className="mr-1 h-4 w-4" />
              Fechar
            </Button>
          </div>
        </div>
        {renderGraph()}
      </div>,
      document.body,
    );
  }

  return (
    <div ref={pageRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div
        className="flex min-h-0 shrink-0 flex-col gap-2 overflow-x-hidden overflow-y-auto"
        style={{ height: topPanelPx, minHeight: TOP_PANEL_MIN }}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-mono">Topology Map</h1>
            <p className="text-muted-foreground text-sm">
              Árvore inicial com raiz no gateway; arraste os nós livremente. Partículas nos links
              indicam sentido e intensidade do fluxo.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Durante o arrasto o nó fixa-se à posição; clique direito num nó para o libertar e voltar
              à simulação. Use «Repor layout» para recolocar a árvore.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              O agrupamento L3 segue o prefixo do scope de descoberta (ex.{" "}
              <span className="font-mono">/16</span>, <span className="font-mono">/24</span>); scopes só por
              intervalo IP assumem <span className="font-mono">/24</span>.
            </p>
            <p className="text-muted-foreground text-xs">
              Gateway raiz:{" "}
              <span className="font-mono text-foreground">{visualGraph.rootGateway?.name ?? "indefinido"}</span>
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Redimensione a área do mapa: setas (clique) ou barra central (arrastar). Ícone de ecrã inteiro
              expande o mapa; use <kbd className="rounded border px-1 font-mono text-[10px]">ESC</kbd> para
              sair. Duplo clique na barra repõe o tamanho por omissão.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <button
              type="button"
              className="rounded-md border border-border bg-secondary/60 px-3 py-1.5 font-medium text-foreground hover:bg-secondary"
              onClick={() => {
                nodePositionsRef.current.clear();
                setLayoutResetKey((k) => k + 1);
              }}
            >
              Repor layout
            </button>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-success"></span>
              <span>Online</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-warning"></span>
              <span>Warning</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-destructive"></span>
              <span>Offline</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span>Particulas de trafego</span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-3.5 w-3.5 text-primary" />
              <span>Links de protocolo</span>
            </div>
            <div className="flex items-center gap-2">
              <Radar className="h-3.5 w-3.5 text-primary" />
              <span>Fluxos de coleta</span>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <Card className="glass-panel border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
                Links de protocolo
              </div>
              <div className="mt-0.5 font-mono text-xl sm:text-2xl">{protocolLinks}</div>
            </CardContent>
          </Card>
          <Card className="glass-panel border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
                Fluxos de coleta
              </div>
              <div className="mt-0.5 font-mono text-xl sm:text-2xl">{telemetryLinks}</div>
            </CardContent>
          </Card>
          <Card className="glass-panel border-border/50">
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground sm:text-xs">
                Nos no mapa
              </div>
              <div className="mt-0.5 font-mono text-xl sm:text-2xl">{topologyData?.nodes.length ?? 0}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border/50 bg-secondary/25 px-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title="Mapa em ecrã inteiro (ESC para voltar)"
          onClick={() => setImmersiveMap(true)}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title="Ampliar área do mapa (menos cabeçalho)"
          onClick={() => nudgeTopPanel(-TOP_PANEL_CLICK_STEP)}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Arrastar para redimensionar área do mapa"
          className="flex h-8 min-w-0 flex-1 cursor-row-resize touch-none items-center justify-center rounded-md border border-dashed border-border/60 bg-background/40 hover:bg-secondary/50"
          onPointerDown={(e) => {
            if (!pageRef.current || e.button !== 0) return;
            e.preventDefault();
            topPanelDragRef.current = {
              startY: e.clientY,
              startTop: topPanelPxRef.current,
              parentH: pageRef.current.getBoundingClientRect().height,
            };
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const drag = topPanelDragRef.current;
            if (!drag) return;
            const dy = e.clientY - drag.startY;
            const next = clampTopPanel(drag.startTop + dy, drag.parentH);
            setTopPanelPx(next);
          }}
          onPointerUp={(e) => {
            if (topPanelDragRef.current) {
              writeStoredTopPanelPx(topPanelPxRef.current);
            }
            topPanelDragRef.current = null;
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onPointerCancel={(e) => {
            topPanelDragRef.current = null;
            try {
              (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onDoubleClick={() => {
            const el = pageRef.current;
            if (!el) return;
            const h = el.getBoundingClientRect().height;
            const next = clampTopPanel(TOP_PANEL_DEFAULT, h);
            setTopPanelPx(next);
            writeStoredTopPanelPx(next);
          }}
        >
          <GripHorizontal className="pointer-events-none h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          title="Reduzir área do mapa (mais cabeçalho)"
          onClick={() => nudgeTopPanel(TOP_PANEL_CLICK_STEP)}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {renderGraph()}
    </div>
  );
}
