import { useGetNodeMetrics } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ArrowLeft, Cpu, HardDrive, Activity, Thermometer, Fan } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { listCredentials, type SnmpCredential } from "@/lib/discovery-api";
import { authFetch } from "@/lib/auth-fetch";

interface NodeInterface {
  id: string;
  ifIndex: number;
  name: string;
  description?: string | null;
  alias?: string | null;
  adminStatus: string;
  operStatus: string;
  speedBps?: number | null;
  lastInBps?: number | null;
  lastOutBps?: number | null;
  updatedAt: string;
}

interface NodeArpEntry {
  id: string;
  ifIndex?: number | null;
  ipAddress: string;
  macAddress: string;
  updatedAt: string;
}

interface NodeMacEntry {
  id: string;
  vlanId?: number | null;
  macAddress: string;
  bridgePort?: number | null;
  ifIndex?: number | null;
  interfaceName?: string | null;
  status?: string | null;
  updatedAt: string;
}

interface NodeVlanEntry {
  id: string;
  vlanId: number;
  name?: string | null;
  updatedAt: string;
}

interface ManagedNodeSummary {
  id: string;
  name: string;
  ipAddress: string;
  type: string;
  status: string;
  vendor?: string | null;
  model?: string | null;
}

interface NodeDetails {
  id: string;
  name: string;
  ipAddress: string;
  credentialId?: string | null;
  type: string;
  status: string;
  vendor?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  serviceTag?: string | null;
  assetTag?: string | null;
  firmwareVersion?: string | null;
  softwareVersion?: string | null;
  hardwareRevision?: string | null;
  manufactureDate?: string | null;
  location?: string | null;
  sysDescription?: string | null;
  uptime?: number | null;
  cpuUsage?: number | null;
  memUsage?: number | null;
  cpuTemperatureC?: number | null;
  inletTemperatureC?: number | null;
  fanCount?: number | null;
  fanHealthyCount?: number | null;
  interfaceCount?: number | null;
  pollingProfile?: "critical" | "standard" | "low_impact" | "inventory_scheduled" | null;
  snmpVersion?: "v1" | "v2c" | "v3" | null;
  snmpCommunity?: string | null;
  lastPolled?: string | null;
  createdAt: string;
}

interface EnvironmentSensor {
  id: string;
  sensorType: "temperature" | "fan";
  name: string;
  label?: string | null;
  value?: number | null;
  unit?: string | null;
  status: "ok" | "warning" | "critical" | "unknown";
  source?: string | null;
  updatedAt: string;
}

interface EnvironmentResponse {
  nodeId: string;
  summary: {
    temperatureSensorCount: number;
    fanSensorCount: number;
    healthyFanCount: number;
  };
  sensors: EnvironmentSensor[];
  temperatureSensors: EnvironmentSensor[];
  fanSensors: EnvironmentSensor[];
}

interface HardwareComponent {
  id: string;
  entityIndex: number;
  parentIndex?: number | null;
  containedInIndex?: number | null;
  entityClass?: string | null;
  name: string;
  description?: string | null;
  vendor?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  assetTag?: string | null;
  hardwareRevision?: string | null;
  firmwareVersion?: string | null;
  softwareVersion?: string | null;
  isFieldReplaceable?: string | null;
  source?: string | null;
  updatedAt: string;
}

interface HardwareInventoryResponse {
  nodeId: string;
  summary: {
    totalComponents: number;
    chassisCount: number;
    moduleCount: number;
    powerSupplyCount: number;
    fanTrayCount: number;
  };
  components: HardwareComponent[];
}

interface SnmpDiagnosticAttempt {
  strategy: "scalar" | "table";
  oid: string;
  status: "ok" | "empty" | "error" | "ignored";
  value?: number | null;
  error?: string | null;
}

interface SnmpDiagnosticsResponse {
  nodeId: string;
  target: string;
  hasCredential: boolean;
  message?: string;
  credential?: {
    id: string;
    name: string;
    version: string;
    port: number;
    timeoutMs: number;
    retries: number;
  };
  diagnostics?: {
    resolvedVendor?: string | null;
    resolvedModel?: string | null;
    identity: {
      sysName?: string;
      sysDescr?: string;
      sysObjectId?: string;
      uptime?: number;
      interfaceCount?: number;
    } | null;
    profile: {
      id?: string;
      vendor?: string;
      family?: string;
      inventorySources: string[];
      environmentSources: string[];
    };
    cpu: {
      selectedValue?: number | null;
      vendorValue?: number | null;
      genericValue?: number | null;
      attempts: SnmpDiagnosticAttempt[];
    };
    memory: {
      selectedValue?: number | null;
      vendorValue?: number | null;
      genericValue?: number | null;
    };
  };
}

interface MetricSeriesResponse {
  nodeId: string;
  metric: string;
  bucket?: string;
  data: Array<{
    timestamp: string;
    value: number;
    min?: number;
    max?: number;
    avg?: number;
  }>;
}

interface ManagedNodesResponse {
  nodes: ManagedNodeSummary[];
  total: number;
  limit: number;
  offset: number;
}

interface InterfaceAddressEntry {
  id: string;
  ifIndex?: number | null;
  interfaceName?: string | null;
  ipAddress: string;
  subnetMask?: string | null;
  prefixLength?: number | null;
  addressType?: string | null;
  updatedAt: string;
}

interface InterfaceAddressesResponse {
  nodeId: string;
  entries: InterfaceAddressEntry[];
}

interface RouteEntry {
  id: string;
  destination: string;
  subnetMask?: string | null;
  prefixLength?: number | null;
  nextHop?: string | null;
  ifIndex?: number | null;
  interfaceName?: string | null;
  metric?: number | null;
  routeType?: string | null;
  protocol?: string | null;
  updatedAt: string;
}

interface RoutesResponse {
  nodeId: string;
  summary: {
    totalRoutes: number;
    defaultRoutes: number;
    connectedRoutes: number;
    staticRoutes: number;
  };
  entries: RouteEntry[];
}

const pollingProfileOptions = [
  { value: "critical", label: "Critico", summary: "Saude em 30s, detalhamento a cada 2 min." },
  { value: "standard", label: "Padrao", summary: "Saude em 60s, detalhamento a cada 5 min." },
  { value: "low_impact", label: "Baixo impacto", summary: "Saude em 5 min, detalhamento a cada 15 min." },
  {
    value: "inventory_scheduled",
    label: "Inventario agendado",
    summary: "Saude em 10 min, inventario pesado a cada 60 min.",
  },
] as const;

type PollingProfileValue = (typeof pollingProfileOptions)[number]["value"];

interface CorrelatedEndpoint {
  macAddress: string;
  vlanId?: number | null;
  ipAddresses: string[];
  kind: "managed-node" | "endpoint" | "unknown";
  confidence: "high" | "medium" | "low";
  managedNodeId?: string | null;
  managedNodeName?: string | null;
  managedNodeIp?: string | null;
}

interface PortRiskFlag {
  code:
    | "mac_flood"
    | "duplicate_mac"
    | "managed_node_on_access"
    | "multi_vlan_edge"
    | "rogue_switch_suspected"
    | "loop_suspected"
    | "uplink_high_utilization"
    | "learned_macs_while_down";
  severity: "critical" | "warning" | "info";
  message: string;
}

interface CorrelatedPort {
  ifIndex?: number | null;
  interfaceName: string;
  alias?: string | null;
  adminStatus?: string | null;
  operStatus?: string | null;
  speedBps?: number | null;
  lastInBps?: number | null;
  lastOutBps?: number | null;
  isUplink: boolean;
  role: "uplink" | "trunk" | "access" | "server-edge" | "unknown";
  utilizationPct?: number | null;
  learnedMacCount: number;
  vlanIds: number[];
  endpointCount: number;
  managedEndpointCount: number;
  riskFlags: PortRiskFlag[];
  endpoints: CorrelatedEndpoint[];
}

interface AccessPortView {
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

interface NodePortProfile {
  id: string;
  nodeId: string;
  ifIndex?: number | null;
  interfaceName: string;
  alias?: string | null;
  baselineRole?: string | null;
  baselineMacCount: number;
  baselineVlanCount: number;
  baselineEndpointCount: number;
  baselineVlanSignature?: string | null;
  lastRole?: string | null;
  lastMacCount: number;
  lastVlanCount: number;
  lastEndpointCount: number;
  lastRiskCount: number;
  lastVlanSignature?: string | null;
  lastChangeSummary?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastChangedAt: string;
  updatedAt: string;
}

interface NodePortObservation {
  id: string;
  profileId: string;
  nodeId: string;
  ifIndex?: number | null;
  interfaceName: string;
  role?: string | null;
  macCount: number;
  vlanCount: number;
  endpointCount: number;
  managedEndpointCount: number;
  riskCount: number;
  vlanSignature?: string | null;
  observedAt: string;
}

function formatRate(value?: number | null) {
  if (value == null) return "—";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB/s`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB/s`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)} KB/s`;
  return `${value.toFixed(0)} B/s`;
}

function formatSensorValue(value?: number | null, unit?: string | null) {
  if (value == null) return "—";
  if (unit === "C") return `${value.toFixed(1)} °C`;
  if (unit === "RPM") return `${value.toFixed(0)} RPM`;
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}

function sensorStatusClass(status: EnvironmentSensor["status"]) {
  if (status === "critical") return "bg-destructive/15 text-destructive border-destructive/30";
  if (status === "warning") return "bg-warning/15 text-warning border-warning/30";
  if (status === "ok") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  return "bg-muted text-muted-foreground border-border";
}

function formatField(value?: string | null) {
  return value && value.trim().length > 0 ? value : "N/A";
}

function formatHardwareClass(value?: string | null) {
  if (!value) return "unknown";
  return value.replace(/-/g, " ");
}

function describeEndpoint(endpoint: CorrelatedEndpoint) {
  if (endpoint.kind === "managed-node") {
    return endpoint.managedNodeName || endpoint.managedNodeIp || endpoint.macAddress;
  }
  if (endpoint.ipAddresses.length > 0) {
    return endpoint.ipAddresses.join(", ");
  }
  return endpoint.macAddress;
}

function roleLabel(role: CorrelatedPort["role"]) {
  switch (role) {
    case "uplink":
      return "Uplink";
    case "trunk":
      return "Trunk";
    case "access":
      return "Access";
    case "server-edge":
      return "Server edge";
    default:
      return "Unknown";
  }
}

function riskClass(severity: PortRiskFlag["severity"]) {
  if (severity === "critical") return "bg-destructive/15 text-destructive border-destructive/30";
  if (severity === "warning") return "bg-warning/15 text-warning border-warning/30";
  return "bg-primary/10 text-primary border-primary/20";
}

export default function NodeDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [snmpDialogOpen, setSnmpDialogOpen] = useState(false);
  const [snmpMode, setSnmpMode] = useState<"saved" | "inline">("inline");
  const [selectedCredentialId, setSelectedCredentialId] = useState("none");
  const [inlineVersion, setInlineVersion] = useState<"v1" | "v2c">("v2c");
  const [inlineCommunity, setInlineCommunity] = useState("public");
  const [savingSnmp, setSavingSnmp] = useState(false);
  const [testingSnmp, setTestingSnmp] = useState(false);
  const [snmpTestResult, setSnmpTestResult] = useState<SnmpDiagnosticsResponse | null>(null);
  const [pollingDialogOpen, setPollingDialogOpen] = useState(false);
  const [pollingProfile, setPollingProfile] = useState<PollingProfileValue>("standard");
  const [savingPollingProfile, setSavingPollingProfile] = useState(false);
  const { data: node, isLoading: loadingNode } = useQuery({
    queryKey: ["/api/nodes", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<NodeDetails> => {
      const response = await authFetch(`/api/nodes/${id}`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar dispositivo (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: cpuMetrics, isLoading: loadingCpu } = useGetNodeMetrics(id || "", { metric: "cpu", bucket: "5m" });
  const { data: memMetrics, isLoading: loadingMem } = useGetNodeMetrics(id || "", { metric: "memory", bucket: "5m" });
  const { data: tempMetrics, isLoading: loadingTemp } = useQuery({
    queryKey: ["/api/metrics", id, "cpu_temperature"],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<MetricSeriesResponse> => {
      const response = await authFetch(`/api/metrics/${id}?metric=cpu_temperature&bucket=5m`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar temperatura (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: environmentData, isLoading: loadingEnvironment } = useQuery({
    queryKey: ["/api/nodes/environment", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<EnvironmentResponse> => {
      const response = await authFetch(`/api/nodes/${id}/environment`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar sensores (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: hardwareData, isLoading: loadingHardware } = useQuery({
    queryKey: ["/api/nodes/hardware", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<HardwareInventoryResponse> => {
      const response = await authFetch(`/api/nodes/${id}/hardware`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar hardware (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: snmpDiagnostics, isLoading: loadingSnmpDiagnostics } = useQuery({
    queryKey: ["/api/nodes/snmp-diagnostics", id],
    enabled: Boolean(id),
    refetchInterval: 30000,
    queryFn: async (): Promise<SnmpDiagnosticsResponse> => {
      const response = await authFetch(`/api/nodes/${id}/snmp-diagnostics`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar diagnostico SNMP (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: credentialsData } = useQuery({
    queryKey: ["/api/discovery/credentials"],
    queryFn: (): Promise<{ credentials: SnmpCredential[] }> => listCredentials(),
    staleTime: 30000,
  });
  const { data: managedNodesData } = useQuery({
    queryKey: ["/api/nodes", "l3-neighbors"],
    queryFn: async (): Promise<ManagedNodesResponse> => {
      const response = await authFetch("/api/nodes?limit=500");
      if (!response.ok) {
        throw new Error(`Falha ao carregar inventario de nos (${response.status})`);
      }
      return response.json();
    },
    staleTime: 30000,
  });
  const { data: interfaceAddressesData, isLoading: loadingInterfaceAddresses } = useQuery({
    queryKey: ["/api/nodes/interface-addresses", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<InterfaceAddressesResponse> => {
      const response = await authFetch(`/api/nodes/${id}/interface-addresses`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar enderecos IP (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: routeData, isLoading: loadingRoutes } = useQuery({
    queryKey: ["/api/nodes/routes", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<RoutesResponse> => {
      const response = await authFetch(`/api/nodes/${id}/routes`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar rotas (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: interfaceData, isLoading: loadingInterfaces } = useQuery({
    queryKey: ["/api/nodes/interfaces", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<{ nodeId: string; interfaces: NodeInterface[] }> => {
      const response = await authFetch(`/api/nodes/${id}/interfaces`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar interfaces (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: arpData, isLoading: loadingArp } = useQuery({
    queryKey: ["/api/nodes/arp", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<{ nodeId: string; entries: NodeArpEntry[] }> => {
      const response = await authFetch(`/api/nodes/${id}/arp`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar ARP (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: macData, isLoading: loadingMac } = useQuery({
    queryKey: ["/api/nodes/mac-table", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<{ nodeId: string; entries: NodeMacEntry[] }> => {
      const response = await authFetch(`/api/nodes/${id}/mac-table`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar MAC table (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: vlanData, isLoading: loadingVlans } = useQuery({
    queryKey: ["/api/nodes/vlans", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<{ nodeId: string; entries: NodeVlanEntry[] }> => {
      const response = await authFetch(`/api/nodes/${id}/vlans`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar VLANs (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: accessData, isLoading: loadingAccess } = useQuery({
    queryKey: ["/api/nodes/access-ports", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<AccessPortView> => {
      const response = await authFetch(`/api/nodes/${id}/access-ports`);
      if (!response.ok) {
        throw new Error(`Falha ao correlacionar portas (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: baselineData, isLoading: loadingBaseline } = useQuery({
    queryKey: ["/api/nodes/access-baseline", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<{ nodeId: string; profiles: NodePortProfile[] }> => {
      const response = await authFetch(`/api/nodes/${id}/access-baseline`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar baseline L2 (${response.status})`);
      }
      return response.json();
    },
  });
  const { data: historyData, isLoading: loadingHistory } = useQuery({
    queryKey: ["/api/nodes/access-history", id],
    enabled: Boolean(id),
    refetchInterval: 15000,
    queryFn: async (): Promise<{ nodeId: string; history: NodePortObservation[] }> => {
      const response = await authFetch(`/api/nodes/${id}/access-history`);
      if (!response.ok) {
        throw new Error(`Falha ao carregar historico L2 (${response.status})`);
      }
      return response.json();
    },
  });

  if (loadingNode) {
    return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div></div>;
  }

  if (!node) {
    return <div className="p-8 text-center text-destructive">Node not found</div>;
  }

  const currentNode = node;
  const currentPollingProfile = (currentNode.pollingProfile ?? "standard") as PollingProfileValue;
  const currentPollingProfileMeta =
    pollingProfileOptions.find((option) => option.value === currentPollingProfile) ??
    pollingProfileOptions[1];

  function openPollingDialog() {
    setPollingProfile(currentPollingProfile);
    setPollingDialogOpen(true);
  }

  function openSnmpDialog() {
    setSnmpMode(currentNode.credentialId ? "saved" : "inline");
    setSelectedCredentialId(currentNode.credentialId ?? "none");
    setInlineVersion(currentNode.snmpVersion === "v1" ? "v1" : "v2c");
    setInlineCommunity(currentNode.snmpCommunity ?? "public");
    setSnmpTestResult(null);
    setSnmpDialogOpen(true);
  }

  async function handleSavePollingProfile() {
    try {
      setSavingPollingProfile(true);
      const response = await authFetch(`/api/nodes/${id}/polling-profile`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pollingProfile }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      await queryClient.invalidateQueries();
      setPollingDialogOpen(false);
      toast({
        title: "Perfil de coleta atualizado",
        description: "A nova estrategia de polling ja foi aplicada ao dispositivo.",
      });
    } catch (error) {
      toast({
        title: "Falha ao atualizar perfil",
        description:
          error instanceof Error ? error.message : "Nao foi possivel atualizar o perfil de coleta.",
        variant: "destructive",
      });
    } finally {
      setSavingPollingProfile(false);
    }
  }

  async function handleTestSnmp() {
    try {
      setTestingSnmp(true);
      setSnmpTestResult(null);

      const payload =
        snmpMode === "saved"
          ? { credentialId: selectedCredentialId }
          : {
              credentialId: null,
              snmpVersion: inlineVersion,
              snmpCommunity: inlineCommunity.trim(),
            };

      const response = await authFetch(`/api/nodes/${id}/snmp/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      const result = (await response.json()) as SnmpDiagnosticsResponse;
      setSnmpTestResult(result);
      toast({
        title: result.diagnostics ? "Teste SNMP concluido" : "Teste SNMP sem resposta valida",
        description: result.diagnostics
          ? "A credencial respondeu ao diagnostico SNMP."
          : (result.message ?? "A credencial nao retornou diagnostico SNMP valido."),
      });
    } catch (error) {
      toast({
        title: "Falha ao testar SNMP",
        description:
          error instanceof Error ? error.message : "Nao foi possivel testar a credencial SNMP.",
        variant: "destructive",
      });
    } finally {
      setTestingSnmp(false);
    }
  }

  async function handleSaveSnmp() {
    try {
      setSavingSnmp(true);

      const payload =
        snmpMode === "saved"
          ? { credentialId: selectedCredentialId }
          : {
              credentialId: null,
              snmpVersion: inlineVersion,
              snmpCommunity: inlineCommunity.trim(),
            };

      const response = await authFetch(`/api/nodes/${id}/snmp`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }

      await queryClient.invalidateQueries();
      setSnmpDialogOpen(false);
      toast({
        title: "Credencial SNMP atualizada",
        description: "A configuracao foi salva e uma nova coleta foi disparada.",
      });
    } catch (error) {
      toast({
        title: "Falha ao atualizar SNMP",
        description:
          error instanceof Error ? error.message : "Nao foi possivel salvar a credencial SNMP.",
        variant: "destructive",
      });
    } finally {
      setSavingSnmp(false);
    }
  }

  const hasArpData = (arpData?.entries?.length ?? 0) > 0;
  const hasMacData = (macData?.entries?.length ?? 0) > 0;
  const hasVlanData = (vlanData?.entries?.length ?? 0) > 0;
  const currentSnmpModeLabel = currentNode.credentialId ? "Credencial salva" : "Comunidade inline";
  const currentSnmpCredentialLabel = snmpDiagnostics?.credential
    ? `${snmpDiagnostics.credential.name} (${snmpDiagnostics.credential.version})`
    : currentNode.credentialId
      ? "Credencial associada"
      : `Inline ${currentNode.snmpVersion ?? "v2c"}`;
  const interfaceNameByIfIndex = new Map(
    (interfaceData?.interfaces ?? []).map((iface) => [iface.ifIndex, iface] as const),
  );
  const managedNodeByIp = new Map(
    (managedNodesData?.nodes ?? []).map((managedNode) => [managedNode.ipAddress, managedNode] as const),
  );
  const l3Adjacencies = (arpData?.entries ?? []).map((entry) => {
    const localInterface = entry.ifIndex != null ? interfaceNameByIfIndex.get(entry.ifIndex) : undefined;
    const managedNeighbor = managedNodeByIp.get(entry.ipAddress);
    return {
      ...entry,
      interfaceName: localInterface?.name ?? null,
      interfaceAlias: localInterface?.alias ?? localInterface?.description ?? null,
      interfaceStatus: localInterface?.operStatus ?? null,
      managedNeighbor,
    };
  });
  const uniqueNeighborIps = new Set(l3Adjacencies.map((entry) => entry.ipAddress));
  const l3ManagedNeighbors = l3Adjacencies.filter((entry) => entry.managedNeighbor);
  const l3Interfaces = Array.from(
    new Map(
      l3Adjacencies
        .filter((entry) => entry.ifIndex != null)
        .map((entry) => {
          const key = entry.ifIndex as number;
          const neighborCount = l3Adjacencies.filter((candidate) => candidate.ifIndex === key).length;
          const managedCount = l3Adjacencies.filter(
            (candidate) => candidate.ifIndex === key && candidate.managedNeighbor,
          ).length;
          return [
            key,
            {
              ifIndex: key,
              interfaceName: entry.interfaceName ?? `ifIndex ${key}`,
              interfaceAlias: entry.interfaceAlias,
              interfaceStatus: entry.interfaceStatus,
              neighborCount,
              managedCount,
            },
          ] as const;
        }),
    ).values(),
  ).sort((left, right) => left.ifIndex - right.ifIndex);
  const l2EmptyStateMessage =
    hasArpData && !hasMacData && !hasVlanData
      ? "Este equipamento respondeu ARP, mas nao expos MAC table nem inventario de VLAN por SNMP. Em firewalls e roteadores L3 isso e comum; consulte a ARP Table abaixo."
      : "Sem correlacao disponivel ainda. Requer MAC table e, idealmente, ARP/topologia.";

  return (
    <div className="space-y-6 pb-20">
      <Link href="/nodes" className="text-muted-foreground hover:text-foreground flex items-center text-sm font-medium w-fit transition-colors">
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Inventory
      </Link>

      {/* Header Profile */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-card/50 p-6 rounded-2xl border border-border/50 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold tracking-tight font-mono">{node.name}</h1>
            <StatusBadge status={node.status} className="text-sm px-3 py-1" />
          </div>
          <div className="flex gap-4 text-sm text-muted-foreground font-mono">
            <span className="flex items-center gap-1.5"><Activity className="h-4 w-4 text-primary" /> {node.ipAddress}</span>
            <span>•</span>
            <span className="capitalize">{node.vendor} {node.type}</span>
            {node.serialNumber ? (
              <>
                <span>•</span>
                <span>SN {node.serialNumber}</span>
              </>
            ) : null}
            {node.serviceTag ? (
              <>
                <span>•</span>
                <span>ST {node.serviceTag}</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex gap-6 text-sm">
          <div className="flex flex-col items-end gap-2">
            <span className="text-muted-foreground">
              Perfil de coleta: {currentPollingProfileMeta.label}
            </span>
            <span className="max-w-[18rem] text-right text-xs text-muted-foreground">
              {currentPollingProfileMeta.summary}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={openPollingDialog}>
              Ajustar coleta
            </Button>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-muted-foreground">
              SNMP ativo: {currentSnmpModeLabel}
            </span>
            <span className="max-w-[18rem] text-right text-xs text-muted-foreground">
              {currentSnmpCredentialLabel}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={openSnmpDialog}>
              Ajustar SNMP
            </Button>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground">Uptime</span>
            <span className="font-mono font-medium text-foreground">{node.uptime ? `${Math.floor(node.uptime/86400)}d ${Math.floor((node.uptime%86400)/3600)}h` : 'N/A'}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-muted-foreground">Last Polled</span>
            <span className="font-mono font-medium text-foreground">{node.lastPolled ? format(new Date(node.lastPolled), 'HH:mm:ss') : 'N/A'}</span>
          </div>
        </div>
      </div>

      <Dialog open={pollingDialogOpen} onOpenChange={setPollingDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajustar perfil de coleta</DialogTitle>
            <DialogDescription>
              Defina a criticidade deste no para equilibrar velocidade de deteccao e impacto na rede.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm">
              <div className="font-medium">Perfil atual</div>
              <div className="mt-1 text-muted-foreground">
                {currentPollingProfileMeta.label} | {currentPollingProfileMeta.summary}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Perfil de coleta</Label>
              <Select
                value={pollingProfile}
                onValueChange={(value: PollingProfileValue) => setPollingProfile(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pollingProfileOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border/50 bg-background/40 p-3 text-sm text-muted-foreground">
              {pollingProfileOptions.find((option) => option.value === pollingProfile)?.summary}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPollingDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSavePollingProfile}
              disabled={savingPollingProfile || pollingProfile === currentPollingProfile}
            >
              {savingPollingProfile ? "Salvando..." : "Salvar perfil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={snmpDialogOpen} onOpenChange={setSnmpDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Ajustar credencial SNMP</DialogTitle>
            <DialogDescription>
              Escolha uma credencial cadastrada ou informe a comunidade correta para este dispositivo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/50 bg-secondary/20 p-3 text-sm">
              <div className="font-medium">Configuracao atual</div>
              <div className="mt-1 text-muted-foreground">
                {currentSnmpModeLabel} | {currentSnmpCredentialLabel}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Modo</Label>
              <Select
                value={snmpMode}
                onValueChange={(value: "saved" | "inline") => {
                  setSnmpMode(value);
                  setSnmpTestResult(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saved">Credencial salva</SelectItem>
                  <SelectItem value="inline">Comunidade inline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {snmpMode === "saved" ? (
              <div className="space-y-2">
                <Label>Credencial SNMP</Label>
                <Select
                  value={selectedCredentialId}
                  onValueChange={(value) => {
                    setSelectedCredentialId(value);
                    setSnmpTestResult(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma credencial" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione uma credencial</SelectItem>
                    {(credentialsData?.credentials ?? []).map((credential) => (
                      <SelectItem key={credential.id} value={credential.id}>
                        {credential.name} ({credential.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Versao SNMP</Label>
                  <Select
                    value={inlineVersion}
                    onValueChange={(value: "v1" | "v2c") => {
                      setInlineVersion(value);
                      setSnmpTestResult(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="v1">v1</SelectItem>
                      <SelectItem value="v2c">v2c</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Comunidade</Label>
                  <Input
                    value={inlineCommunity}
                    onChange={(event) => {
                      setInlineCommunity(event.target.value);
                      setSnmpTestResult(null);
                    }}
                    placeholder="public"
                  />
                </div>
              </div>
            )}

            {snmpTestResult ? (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  snmpTestResult.diagnostics
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    : "border-warning/30 bg-warning/10 text-warning"
                }`}
              >
                <div className="font-medium">
                  {snmpTestResult.diagnostics ? "Teste SNMP bem-sucedido" : "Teste SNMP sem diagnostico valido"}
                </div>
                <div className="mt-1">
                  {snmpTestResult.diagnostics
                    ? `${snmpTestResult.diagnostics.identity?.sysName ?? snmpTestResult.target} | CPU ${
                        snmpTestResult.diagnostics.cpu.selectedValue != null
                          ? `${snmpTestResult.diagnostics.cpu.selectedValue.toFixed(2)}%`
                          : "N/A"
                      } | Mem ${
                        snmpTestResult.diagnostics.memory.selectedValue != null
                          ? `${snmpTestResult.diagnostics.memory.selectedValue.toFixed(2)}%`
                          : "N/A"
                      }`
                    : (snmpTestResult.message ?? "Sem resposta SNMP valida com a credencial informada.")}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSnmpDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleTestSnmp}
              disabled={
                testingSnmp ||
                savingSnmp ||
                (snmpMode === "saved" && selectedCredentialId === "none") ||
                (snmpMode === "inline" && inlineCommunity.trim().length === 0)
              }
            >
              {testingSnmp ? "Testando..." : "Testar credencial"}
            </Button>
            <Button
              type="button"
              onClick={handleSaveSnmp}
              disabled={
                savingSnmp ||
                (snmpMode === "saved" && selectedCredentialId === "none") ||
                (snmpMode === "inline" && inlineCommunity.trim().length === 0)
              }
            >
              {savingSnmp ? "Salvando..." : "Salvar e coletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="bg-secondary/50 border border-border/50 mb-6">
          <TabsTrigger value="performance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Performance</TabsTrigger>
          <TabsTrigger value="interfaces" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Interfaces</TabsTrigger>
          <TabsTrigger value="l2" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Layer 2</TabsTrigger>
          <TabsTrigger value="l3" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Layer 3</TabsTrigger>
          <TabsTrigger value="details" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">System Details</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-primary" /> CPU atual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-mono font-bold">
                  {node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : "—"}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-warning" /> Memoria atual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-mono font-bold">
                  {node.memUsage != null ? `${node.memUsage.toFixed(1)}%` : "—"}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Thermometer className="h-4 w-4 text-orange-400" /> Temp. CPU
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-mono font-bold">
                  {formatSensorValue(node.cpuTemperatureC, "C")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Inlet: {formatSensorValue(node.inletTemperatureC, "C")}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-mono flex items-center gap-2">
                  <Fan className="h-4 w-4 text-sky-400" /> Saude dos FANs
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-mono font-bold">
                  {node.fanCount ? `${node.fanHealthyCount ?? 0}/${node.fanCount}` : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {node.fanCount ? "operacionais / totais" : "sem sensores expostos"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* CPU Chart */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" /> CPU Utilization
              </CardTitle>
              <div className="text-2xl font-mono font-bold text-foreground">
                {node.cpuUsage != null ? `${node.cpuUsage.toFixed(1)}%` : "—"}
              </div>
            </CardHeader>
            <CardContent className="h-[300px] mt-4">
              {loadingCpu ? (
                 <div className="w-full h-full flex items-center justify-center animate-pulse bg-secondary/20 rounded-lg"></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cpuMetrics?.data || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="timestamp" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickFormatter={(val) => format(new Date(val), 'HH:mm')}
                      tickLine={false}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      labelFormatter={(val) => format(new Date(val), 'MMM d, HH:mm:ss')}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Memory Chart */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-warning" /> Memory Utilization
              </CardTitle>
              <div className="text-2xl font-mono font-bold text-foreground">
                {node.memUsage != null ? `${node.memUsage.toFixed(1)}%` : "—"}
              </div>
            </CardHeader>
            <CardContent className="h-[300px] mt-4">
              {loadingMem ? (
                <div className="w-full h-full flex items-center justify-center animate-pulse bg-secondary/20 rounded-lg"></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={memMetrics?.data || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--warning))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--warning))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis 
                      dataKey="timestamp" 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickFormatter={(val) => format(new Date(val), 'HH:mm')}
                      tickLine={false}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      labelFormatter={(val) => format(new Date(val), 'MMM d, HH:mm:ss')}
                    />
                    <Area type="monotone" dataKey="value" stroke="hsl(var(--warning))" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Thermometer className="h-5 w-5 text-orange-400" /> Temperatura da CPU
              </CardTitle>
              <div className="text-2xl font-mono font-bold text-foreground">
                {formatSensorValue(node.cpuTemperatureC, "C")}
              </div>
            </CardHeader>
            <CardContent className="h-[300px] mt-4">
              {loadingTemp ? (
                <div className="w-full h-full flex items-center justify-center animate-pulse bg-secondary/20 rounded-lg"></div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tempMetrics?.data || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#fb923c" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(val) => format(new Date(val), "HH:mm")}
                      tickLine={false}
                    />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                      labelFormatter={(val) => format(new Date(val), "MMM d, HH:mm:ss")}
                      formatter={(value: number) => [`${value.toFixed(1)} °C`, "Temperatura"]}
                    />
                    <Area type="monotone" dataKey="value" stroke="#fb923c" strokeWidth={2} fillOpacity={1} fill="url(#colorTemp)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interfaces">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Interface Inventory</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingInterfaces ? (
                <div className="p-6 text-muted-foreground">Carregando interfaces...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IfIndex</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Velocidade</TableHead>
                      <TableHead>Entrada</TableHead>
                      <TableHead>Saída</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(interfaceData?.interfaces ?? []).map((iface) => (
                      <TableRow key={iface.id}>
                        <TableCell className="font-mono">{iface.ifIndex}</TableCell>
                        <TableCell>
                          <div className="font-medium">{iface.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {iface.alias || iface.description || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="capitalize">{iface.adminStatus}/{iface.operStatus}</span>
                        </TableCell>
                        <TableCell>{formatRate(iface.speedBps)}</TableCell>
                        <TableCell className="font-mono">{formatRate(iface.lastInBps)}</TableCell>
                        <TableCell className="font-mono">{formatRate(iface.lastOutBps)}</TableCell>
                      </TableRow>
                    ))}
                    {(interfaceData?.interfaces ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Nenhuma interface inventariada ainda. Execute discovery/polling com SNMP.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="l2" className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Correlated Access Ports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Portas</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.totalPorts ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Access</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.accessPorts ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Uplinks</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.uplinkPorts ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Endpoints</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.totalEndpoints ?? 0}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Trunks</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.trunkPorts ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Server edge</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.serverEdgePorts ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Portas suspeitas</div>
                  <div className="mt-1 text-2xl font-mono">{accessData?.summary.suspiciousPorts ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Riscos C/W</div>
                  <div className="mt-1 text-2xl font-mono">
                    {(accessData?.summary.criticalRisks ?? 0)}/{(accessData?.summary.warningRisks ?? 0)}
                  </div>
                </div>
              </div>

              {loadingAccess ? (
                <div className="p-2 text-muted-foreground">Correlacionando portas...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>MACs</TableHead>
                      <TableHead>VLANs</TableHead>
                      <TableHead>Utilização</TableHead>
                      <TableHead>Riscos</TableHead>
                      <TableHead>Endpoints inferidos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(accessData?.ports ?? []).map((port) => (
                      <TableRow key={`${port.ifIndex ?? "na"}:${port.interfaceName}`}>
                        <TableCell>
                          <div className="font-medium">{port.interfaceName}</div>
                          <div className="text-xs text-muted-foreground">
                            {port.alias || (port.ifIndex != null ? `ifIndex ${port.ifIndex}` : "—")}
                          </div>
                        </TableCell>
                        <TableCell>{roleLabel(port.role)}</TableCell>
                        <TableCell className="font-mono">{port.learnedMacCount}</TableCell>
                        <TableCell className="font-mono">
                          {port.vlanIds.length > 0 ? port.vlanIds.join(", ") : "—"}
                        </TableCell>
                        <TableCell className="font-mono">
                          {port.utilizationPct != null ? `${port.utilizationPct.toFixed(1)}%` : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {port.riskFlags.length > 0 ? (
                              port.riskFlags.slice(0, 2).map((risk) => (
                                <span
                                  key={`${port.interfaceName}:${risk.code}`}
                                  className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${riskClass(risk.severity)}`}
                                  title={risk.message}
                                >
                                  {risk.code}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[32rem] text-sm">
                            {port.endpoints.length > 0
                              ? port.endpoints.slice(0, 3).map(describeEndpoint).join(" | ")
                              : "—"}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(accessData?.ports ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          {l2EmptyStateMessage}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Port Baseline</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingBaseline ? (
                <div className="p-6 text-muted-foreground">Carregando baseline...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Interface</TableHead>
                      <TableHead>Baseline</TableHead>
                      <TableHead>Atual</TableHead>
                      <TableHead>Ultima mudanca</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(baselineData?.profiles ?? []).map((profile) => (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div className="font-medium">{profile.interfaceName}</div>
                          <div className="text-xs text-muted-foreground">
                            {profile.alias || (profile.ifIndex != null ? `ifIndex ${profile.ifIndex}` : "—")}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {profile.baselineRole || "—"} | MAC {profile.baselineMacCount} | VLAN {profile.baselineVlanCount}
                        </TableCell>
                        <TableCell className="text-sm">
                          {profile.lastRole || "—"} | MAC {profile.lastMacCount} | VLAN {profile.lastVlanCount}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{profile.lastChangeSummary || "Sem desvio recente"}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(profile.lastChangedAt), "dd/MM HH:mm:ss")}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(baselineData?.profiles ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                          Baseline ainda nao estabelecido para este no.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Recent L2 History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingHistory ? (
                <div className="p-6 text-muted-foreground">Carregando historico...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Horario</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>MACs</TableHead>
                      <TableHead>VLANs</TableHead>
                      <TableHead>Riscos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(historyData?.history ?? []).slice(0, 20).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono">
                          {format(new Date(item.observedAt), "dd/MM HH:mm:ss")}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{item.interfaceName}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.ifIndex != null ? `ifIndex ${item.ifIndex}` : "—"}
                          </div>
                        </TableCell>
                        <TableCell>{item.role || "—"}</TableCell>
                        <TableCell className="font-mono">{item.macCount}</TableCell>
                        <TableCell className="font-mono">{item.vlanCount}</TableCell>
                        <TableCell className="font-mono">{item.riskCount}</TableCell>
                      </TableRow>
                    ))}
                    {(historyData?.history ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Historico ainda indisponivel para este no.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>ARP Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingArp ? (
                <div className="p-6 text-muted-foreground">Carregando ARP...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IfIndex</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>MAC</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(arpData?.entries ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.ifIndex ?? "—"}</TableCell>
                        <TableCell className="font-mono">{entry.ipAddress}</TableCell>
                        <TableCell className="font-mono">{entry.macAddress}</TableCell>
                      </TableRow>
                    ))}
                    {(arpData?.entries ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                          Nenhuma entrada ARP coletada neste nó.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>MAC Forwarding Database</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingMac ? (
                <div className="p-6 text-muted-foreground">Carregando MAC table...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>VLAN</TableHead>
                      <TableHead>MAC</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead>Bridge Port</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(macData?.entries ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.vlanId ?? "—"}</TableCell>
                        <TableCell className="font-mono">{entry.macAddress}</TableCell>
                        <TableCell>{entry.interfaceName || entry.ifIndex || "—"}</TableCell>
                        <TableCell className="font-mono">{entry.bridgePort ?? "—"}</TableCell>
                        <TableCell className="capitalize">{entry.status || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(macData?.entries ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Nenhuma entrada de MAC table coletada neste nó.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>VLAN Inventory</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingVlans ? (
                <div className="p-6 text-muted-foreground">Carregando VLANs...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>VLAN ID</TableHead>
                      <TableHead>Nome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(vlanData?.entries ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.vlanId}</TableCell>
                        <TableCell>{entry.name || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(vlanData?.entries ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                          Nenhuma VLAN inventariada neste nó.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="l3" className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Layer 3 Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-border/50 bg-secondary/20 p-4 text-sm text-muted-foreground">
                Esta visao usa adjacencias IP observadas por ARP e correlacao com nos ja inventariados.
                Tabela de rotas SNMP dedicada ainda nao esta disponivel neste modulo.
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Adjacencias IP</div>
                  <div className="mt-1 text-2xl font-mono">{uniqueNeighborIps.size}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Vizinhos gerenciados</div>
                  <div className="mt-1 text-2xl font-mono">{l3ManagedNeighbors.length}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Interfaces com L3</div>
                  <div className="mt-1 text-2xl font-mono">{interfaceAddressesData?.entries.length ?? l3Interfaces.length}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Rotas</div>
                  <div className="mt-1 text-2xl font-mono">{routeData?.summary.totalRoutes ?? 0}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Default routes</div>
                  <div className="mt-1 text-2xl font-mono">{routeData?.summary.defaultRoutes ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Rotas conectadas</div>
                  <div className="mt-1 text-2xl font-mono">{routeData?.summary.connectedRoutes ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Rotas estaticas</div>
                  <div className="mt-1 text-2xl font-mono">{routeData?.summary.staticRoutes ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">NetPath</div>
                  <div className="mt-2">
                    <Link href="/netpath">
                      <Button type="button" variant="outline" size="sm">Abrir analise</Button>
                    </Link>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Interface IP Addresses</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingInterfaceAddresses ? (
                <div className="p-6 text-muted-foreground">Carregando enderecos IP...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IfIndex</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead>Endereco IP</TableHead>
                      <TableHead>Prefixo</TableHead>
                      <TableHead>Mask</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(interfaceAddressesData?.entries ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.ifIndex ?? "—"}</TableCell>
                        <TableCell>{entry.interfaceName || "—"}</TableCell>
                        <TableCell className="font-mono">{entry.ipAddress}</TableCell>
                        <TableCell className="font-mono">
                          {entry.prefixLength != null ? `/${entry.prefixLength}` : "—"}
                        </TableCell>
                        <TableCell className="font-mono">{entry.subnetMask || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(interfaceAddressesData?.entries ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          Nenhum endereco IP por interface foi coletado via SNMP neste no.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Routing Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingRoutes ? (
                <div className="p-6 text-muted-foreground">Carregando rotas...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destino</TableHead>
                      <TableHead>Prefixo</TableHead>
                      <TableHead>Next hop</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Protocolo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(routeData?.entries ?? []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono">{entry.destination}</TableCell>
                        <TableCell className="font-mono">
                          {entry.prefixLength != null ? `/${entry.prefixLength}` : (entry.subnetMask || "—")}
                        </TableCell>
                        <TableCell className="font-mono">{entry.nextHop || "—"}</TableCell>
                        <TableCell>{entry.interfaceName || (entry.ifIndex != null ? `ifIndex ${entry.ifIndex}` : "—")}</TableCell>
                        <TableCell className="capitalize">{entry.routeType || "—"}</TableCell>
                        <TableCell className="capitalize">{entry.protocol || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(routeData?.entries ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          Nenhuma rota Layer 3 foi coletada via SNMP neste no.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Managed L3 Neighbors</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface local</TableHead>
                    <TableHead>No remoto</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Perfil</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {l3ManagedNeighbors.map((entry) => (
                    <TableRow key={`${entry.id}:managed`}>
                      <TableCell>
                        <div className="font-medium">{entry.interfaceName || (entry.ifIndex != null ? `ifIndex ${entry.ifIndex}` : "—")}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.interfaceAlias || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.managedNeighbor?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.managedNeighbor?.vendor || "—"} {entry.managedNeighbor?.model || ""}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{entry.ipAddress}</TableCell>
                      <TableCell className="capitalize">{entry.managedNeighbor?.status || "—"}</TableCell>
                      <TableCell className="capitalize">{entry.managedNeighbor?.type || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {l3ManagedNeighbors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Nenhum vizinho Layer 3 gerenciado foi correlacionado ainda a partir da ARP Table.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Interfaces With IP Adjacency</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IfIndex</TableHead>
                    <TableHead>Interface</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Adjacencias</TableHead>
                    <TableHead>Nos gerenciados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {l3Interfaces.map((entry) => (
                    <TableRow key={`l3-if-${entry.ifIndex}`}>
                      <TableCell className="font-mono">{entry.ifIndex}</TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.interfaceName}</div>
                        <div className="text-xs text-muted-foreground">{entry.interfaceAlias || "—"}</div>
                      </TableCell>
                      <TableCell className="capitalize">{entry.interfaceStatus || "—"}</TableCell>
                      <TableCell className="font-mono">{entry.neighborCount}</TableCell>
                      <TableCell className="font-mono">{entry.managedCount}</TableCell>
                    </TableRow>
                  ))}
                  {l3Interfaces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        Nenhuma interface com adjacencia IP foi identificada ainda.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>L3 IP Adjacency Table</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Interface local</TableHead>
                    <TableHead>IP remoto</TableHead>
                    <TableHead>MAC</TableHead>
                    <TableHead>Inventariado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {l3Adjacencies.map((entry) => (
                    <TableRow key={`l3-adj-${entry.id}`}>
                      <TableCell>
                        <div className="font-medium">{entry.interfaceName || (entry.ifIndex != null ? `ifIndex ${entry.ifIndex}` : "—")}</div>
                        <div className="text-xs text-muted-foreground">{entry.interfaceAlias || "—"}</div>
                      </TableCell>
                      <TableCell className="font-mono">{entry.ipAddress}</TableCell>
                      <TableCell className="font-mono">{entry.macAddress}</TableCell>
                      <TableCell>
                        {entry.managedNeighbor ? `${entry.managedNeighbor.name} (${entry.managedNeighbor.type})` : "Nao"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {l3Adjacencies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                        Nenhuma adjacencia Layer 3 foi observada ainda para este no.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>Inventario tecnico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Fabricante</span>
                  <span className="text-sm mt-1">{formatField(node.vendor)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Modelo</span>
                  <span className="text-sm mt-1">{formatField(node.model)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Numero de serie</span>
                  <span className="text-sm mt-1 font-mono">{formatField(node.serialNumber)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Service tag</span>
                  <span className="text-sm mt-1 font-mono">{formatField(node.serviceTag)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Asset tag</span>
                  <span className="text-sm mt-1 font-mono">{formatField(node.assetTag)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Firmware</span>
                  <span className="text-sm mt-1 font-mono">{formatField(node.firmwareVersion)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Software</span>
                  <span className="text-sm mt-1 font-mono">{formatField(node.softwareVersion)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Hardware revision</span>
                  <span className="text-sm mt-1 font-mono">{formatField(node.hardwareRevision)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Data de fabricacao</span>
                  <span className="text-sm mt-1">{formatField(node.manufactureDate)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Location</span>
                  <span className="text-sm mt-1">{formatField(node.location)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">System description</span>
                  <span className="text-sm mt-1">{formatField(node.sysDescription)}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Adicionado em</span>
                  <span className="text-sm mt-1 font-mono">{node.createdAt ? format(new Date(node.createdAt), 'PPP') : 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 mt-6">
            <CardHeader>
              <CardTitle>Sensores ambientais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Sensores de temperatura</div>
                  <div className="mt-1 text-2xl font-mono">{environmentData?.summary.temperatureSensorCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">FANs monitorados</div>
                  <div className="mt-1 text-2xl font-mono">{environmentData?.summary.fanSensorCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">FANs saudaveis</div>
                  <div className="mt-1 text-2xl font-mono">{environmentData?.summary.healthyFanCount ?? 0}</div>
                </div>
              </div>

              {loadingEnvironment ? (
                <div className="p-2 text-muted-foreground">Carregando sensores...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Leitura</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(environmentData?.sensors ?? []).map((sensor) => (
                      <TableRow key={sensor.id}>
                        <TableCell className="capitalize">{sensor.sensorType}</TableCell>
                        <TableCell>
                          <div className="font-medium">{sensor.name}</div>
                          <div className="text-xs text-muted-foreground">{sensor.label || "—"}</div>
                        </TableCell>
                        <TableCell className="font-mono">{formatSensorValue(sensor.value, sensor.unit)}</TableCell>
                        <TableCell>
                          <span className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${sensorStatusClass(sensor.status)}`}>
                            {sensor.status}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sensor.source || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(environmentData?.sensors ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          O dispositivo ainda nao expôs sensores via SNMP/ENTITY-SENSOR-MIB.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 mt-6">
            <CardHeader>
              <CardTitle>Diagnostico SNMP da CPU</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingSnmpDiagnostics ? (
                <div className="p-2 text-muted-foreground">Carregando diagnostico SNMP...</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-border/50 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Vendor resolvido</div>
                      <div className="mt-1 font-mono">{formatField(snmpDiagnostics?.diagnostics?.resolvedVendor)}</div>
                    </div>
                    <div className="rounded-lg border border-border/50 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Perfil aplicado</div>
                      <div className="mt-1 font-mono">{formatField(snmpDiagnostics?.diagnostics?.profile.id)}</div>
                    </div>
                    <div className="rounded-lg border border-border/50 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Familia aplicada</div>
                      <div className="mt-1 font-mono">{formatField(snmpDiagnostics?.diagnostics?.profile.family)}</div>
                    </div>
                    <div className="rounded-lg border border-border/50 p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">CPU selecionada</div>
                      <div className="mt-1 font-mono">
                        {snmpDiagnostics?.diagnostics?.cpu.selectedValue != null
                          ? `${snmpDiagnostics.diagnostics.cpu.selectedValue.toFixed(2)}%`
                          : "N/A"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-lg border border-border/50 p-4 text-sm">
                      <div><span className="text-muted-foreground">sysName:</span> {formatField(snmpDiagnostics?.diagnostics?.identity?.sysName)}</div>
                      <div><span className="text-muted-foreground">sysObjectID:</span> <span className="font-mono">{formatField(snmpDiagnostics?.diagnostics?.identity?.sysObjectId)}</span></div>
                      <div><span className="text-muted-foreground">Credencial:</span> {snmpDiagnostics?.credential?.name || "N/A"} ({snmpDiagnostics?.credential?.version || "N/A"})</div>
                    </div>
                    <div className="rounded-lg border border-border/50 p-4 text-sm">
                      <div><span className="text-muted-foreground">CPU por vendor:</span> {snmpDiagnostics?.diagnostics?.cpu.vendorValue != null ? `${snmpDiagnostics.diagnostics.cpu.vendorValue.toFixed(2)}%` : "N/A"}</div>
                      <div><span className="text-muted-foreground">CPU generica:</span> {snmpDiagnostics?.diagnostics?.cpu.genericValue != null ? `${snmpDiagnostics.diagnostics.cpu.genericValue.toFixed(2)}%` : "N/A"}</div>
                      <div><span className="text-muted-foreground">Memoria selecionada:</span> {snmpDiagnostics?.diagnostics?.memory.selectedValue != null ? `${snmpDiagnostics.diagnostics.memory.selectedValue.toFixed(2)}%` : "N/A"}</div>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estrategia</TableHead>
                        <TableHead>OID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Observacao</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(snmpDiagnostics?.diagnostics?.cpu.attempts ?? []).map((attempt, index) => (
                        <TableRow key={`${attempt.oid}-${index}`}>
                          <TableCell className="capitalize">{attempt.strategy}</TableCell>
                          <TableCell className="font-mono text-xs">{attempt.oid}</TableCell>
                          <TableCell className="uppercase text-xs">{attempt.status}</TableCell>
                          <TableCell className="font-mono">
                            {attempt.value != null ? `${attempt.value.toFixed(2)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{attempt.error || "—"}</TableCell>
                        </TableRow>
                      ))}
                      {(snmpDiagnostics?.diagnostics?.cpu.attempts ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                            {snmpDiagnostics?.message || "Nenhum diagnostico SNMP disponivel para este no."}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 mt-6">
            <CardHeader>
              <CardTitle>Inventario fisico por componente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Componentes</div>
                  <div className="mt-1 text-2xl font-mono">{hardwareData?.summary.totalComponents ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Chassis</div>
                  <div className="mt-1 text-2xl font-mono">{hardwareData?.summary.chassisCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Modulos</div>
                  <div className="mt-1 text-2xl font-mono">{hardwareData?.summary.moduleCount ?? 0}</div>
                </div>
                <div className="rounded-lg border border-border/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Fontes/FANs</div>
                  <div className="mt-1 text-2xl font-mono">
                    {(hardwareData?.summary.powerSupplyCount ?? 0) + (hardwareData?.summary.fanTrayCount ?? 0)}
                  </div>
                </div>
              </div>

              {loadingHardware ? (
                <div className="p-2 text-muted-foreground">Carregando inventario fisico...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Classe</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Modelo / Serie</TableHead>
                      <TableHead>Revisoes</TableHead>
                      <TableHead>FRU</TableHead>
                      <TableHead>Origem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(hardwareData?.components ?? []).map((component) => (
                      <TableRow key={component.id}>
                        <TableCell className="capitalize">{formatHardwareClass(component.entityClass)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{component.name}</div>
                          <div className="text-xs text-muted-foreground">{component.description || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-sm">{component.model || "—"}</div>
                          <div className="text-xs text-muted-foreground font-mono">
                            SN: {component.serialNumber || "—"}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>HW: {component.hardwareRevision || "—"}</div>
                          <div>FW: {component.firmwareVersion || "—"}</div>
                          <div>SW: {component.softwareVersion || "—"}</div>
                        </TableCell>
                        <TableCell className="uppercase text-xs">
                          {component.isFieldReplaceable === "true"
                            ? "Yes"
                            : component.isFieldReplaceable === "false"
                              ? "No"
                              : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{component.source || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {(hardwareData?.components ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                          O dispositivo ainda nao expôs inventario fisico detalhado via ENTITY-MIB.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
