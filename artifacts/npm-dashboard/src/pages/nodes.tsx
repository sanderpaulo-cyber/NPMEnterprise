import {
  useCreateNode,
  useDeleteNode,
  useListNodes,
  useTriggerDiscovery,
} from "@workspace/api-client-react";
import { useMemo, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  Radar,
  Search,
  Trash2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
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

const nodeTypes = ["router", "switch", "firewall", "server", "unknown"] as const;
const statusTypes = ["up", "down", "warning", "unknown"] as const;
const snmpVersions = ["v1", "v2c", "v3"] as const;

function readSearchFromUrl() {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export default function Nodes() {
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState(() => readSearchFromUrl());
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    ipAddress: "",
    type: "router",
    vendor: "",
    location: "",
    snmpVersion: "v2c",
    snmpCommunity: "public",
  });
  const [discoveryForm, setDiscoveryForm] = useState({
    subnet: "192.168.1.0/24",
    snmpVersion: "v2c",
    snmpCommunity: "public",
  });

  const { data, isLoading } = useListNodes({
    limit: 100,
    ...(typeFilter !== "all"
      ? { type: typeFilter as (typeof nodeTypes)[number] }
      : {}),
    ...(statusFilter !== "all"
      ? { status: statusFilter as (typeof statusTypes)[number] }
      : {}),
  });
  const createNode = useCreateNode();
  const deleteNode = useDeleteNode();
  const triggerDiscovery = useTriggerDiscovery();

  useEffect(() => {
    setSearchTerm(readSearchFromUrl());
  }, [location]);

  const filteredNodes = useMemo(
    () =>
      data?.nodes.filter(
        (n) =>
          n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          n.ipAddress.includes(searchTerm),
      ) || [],
    [data?.nodes, searchTerm],
  );

  async function refreshQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/stats/summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/topology"] }),
    ]);
  }

  function resetCreateForm() {
    setCreateForm({
      name: "",
      ipAddress: "",
      type: "router",
      vendor: "",
      location: "",
      snmpVersion: "v2c",
      snmpCommunity: "public",
    });
  }

  function handleCreateNode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createNode.mutate(
      {
        data: {
          name: createForm.name.trim(),
          ipAddress: createForm.ipAddress.trim(),
          type: createForm.type as (typeof nodeTypes)[number],
          vendor: createForm.vendor.trim() || undefined,
          location: createForm.location.trim() || undefined,
          snmpVersion: createForm.snmpVersion as (typeof snmpVersions)[number],
          snmpCommunity: createForm.snmpCommunity.trim() || undefined,
        },
      },
      {
        onSuccess: async () => {
          await refreshQueries();
          resetCreateForm();
          setAddOpen(false);
          toast({
            title: "Dispositivo adicionado",
            description: "O novo nó já está na lista de monitorização.",
          });
        },
        onError: (error) => {
          toast({
            title: "Falha ao adicionar dispositivo",
            description:
              error instanceof Error ? error.message : "Não foi possível criar o nó.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleDeleteNode(nodeId: string, nodeName: string) {
    if (!window.confirm(`Remover o dispositivo "${nodeName}" da monitorização?`)) {
      return;
    }

    deleteNode.mutate(
      { nodeId },
      {
        onSuccess: async () => {
          await refreshQueries();
          toast({
            title: "Dispositivo removido",
            description: `${nodeName} foi removido da lista.`,
          });
        },
        onError: (error) => {
          toast({
            title: "Falha ao remover dispositivo",
            description:
              error instanceof Error ? error.message : "A remoção não foi concluída.",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleDiscovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    triggerDiscovery.mutate(
      {
        data: {
          subnet: discoveryForm.subnet.trim(),
          snmpVersion: discoveryForm.snmpVersion as (typeof snmpVersions)[number],
          snmpCommunity: discoveryForm.snmpCommunity.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setDiscoveryOpen(false);
          toast({
            title: "Descoberta iniciada",
            description: "A lista será atualizada automaticamente em alguns segundos.",
          });
          window.setTimeout(() => {
            void refreshQueries();
          }, 6000);
        },
        onError: (error) => {
          toast({
            title: "Falha ao iniciar descoberta",
            description:
              error instanceof Error ? error.message : "Não foi possível iniciar o scan.",
            variant: "destructive",
          });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono">Network Inventory</h1>
          <p className="text-muted-foreground text-sm">Manage and monitor {data?.total || 0} discovered devices</p>
        </div>
        <div className="flex w-full sm:w-auto gap-2">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none border-border bg-background/50"
            onClick={() => setDiscoveryOpen(true)}
          >
            <Radar className="h-4 w-4 mr-2" /> Descobrir
          </Button>
          <Button
            className="flex-1 sm:flex-none bg-primary text-primary-foreground hover:bg-primary/90 font-mono"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" /> Add Node
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border/50">
        <div className="p-4 border-b border-border/50 flex flex-col sm:flex-row gap-4 items-center justify-between bg-secondary/20">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search by hostname or IP..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background/50 border-border font-mono text-sm"
            />
          </div>
          <Button
            variant="outline"
            className="w-full sm:w-auto border-border bg-background/50 hover:bg-secondary"
            onClick={() => setShowFilters((value) => !value)}
          >
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" /> Filters
          </Button>
        </div>

        {showFilters ? (
          <div className="grid gap-4 border-b border-border/50 bg-background/40 p-4 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="bg-background/50 border-border">
                  <SelectValue placeholder="Todos os tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {nodeTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-background/50 border-border">
                  <SelectValue placeholder="Todos os estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {statusTypes.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                className="w-full border-border"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                }}
              >
                Limpar filtros
              </Button>
            </div>
          </div>
        ) : null}

        <CardContent className="p-0">
          <div className="rounded-md">
            <Table>
              <TableHeader className="bg-secondary/40">
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="font-mono uppercase text-xs tracking-wider">Status</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider">Hostname</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider">IP Address</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider">Type</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider">Vendor</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider text-right">CPU</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider text-right">Memory</TableHead>
                  <TableHead className="font-mono uppercase text-xs tracking-wider text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell><div className="h-6 w-16 bg-muted animate-pulse rounded" /></TableCell>
                      <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                      <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                      <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded" /></TableCell>
                      <TableCell><div className="h-4 w-20 bg-muted animate-pulse rounded" /></TableCell>
                      <TableCell><div className="h-4 w-10 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                      <TableCell><div className="h-4 w-10 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : filteredNodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                      No nodes found matching your criteria.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredNodes.map((node) => (
                    <TableRow key={node.id} className="border-border/50 hover:bg-secondary/30 transition-colors group">
                      <TableCell><StatusBadge status={node.status} /></TableCell>
                      <TableCell className="font-medium text-foreground">{node.name}</TableCell>
                      <TableCell className="font-mono text-muted-foreground text-sm">{node.ipAddress}</TableCell>
                      <TableCell className="capitalize text-muted-foreground">{node.type}</TableCell>
                      <TableCell className="text-muted-foreground">{node.vendor || '-'}</TableCell>
                      <TableCell className="text-right font-mono">
                        {node.cpuUsage != null ? (
                          <span className={node.cpuUsage > 80 ? "text-destructive" : ""}>
                            {node.cpuUsage.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {node.memUsage != null ? (
                          <span className={node.memUsage > 80 ? "text-destructive" : ""}>
                            {node.memUsage.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 border-border text-destructive"
                            disabled={deleteNode.isPending}
                            onClick={() => handleDeleteNode(node.id, node.name)}
                          >
                            {deleteNode.isPending &&
                            deleteNode.variables?.nodeId === node.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                          <Link href={`/nodes/${node.id}`}>
                            <Button variant="ghost" size="sm" className="h-8 border-border">
                              Details <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar dispositivo</DialogTitle>
            <DialogDescription>
              Cria um novo nó para monitorização pelo poller.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleCreateNode}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="node-name">Nome</Label>
                <Input
                  id="node-name"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="RTR-SP-01"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-ip">IP</Label>
                <Input
                  id="node-ip"
                  value={createForm.ipAddress}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, ipAddress: e.target.value }))
                  }
                  placeholder="192.168.1.1"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={createForm.type}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {nodeTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-vendor">Fabricante</Label>
                <Input
                  id="node-vendor"
                  value={createForm.vendor}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, vendor: e.target.value }))
                  }
                  placeholder="Cisco"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="node-location">Localização</Label>
                <Input
                  id="node-location"
                  value={createForm.location}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, location: e.target.value }))
                  }
                  placeholder="DC-SP"
                />
              </div>
              <div className="space-y-2">
                <Label>SNMP Version</Label>
                <Select
                  value={createForm.snmpVersion}
                  onValueChange={(value) =>
                    setCreateForm((prev) => ({ ...prev, snmpVersion: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snmpVersions.map((version) => (
                      <SelectItem key={version} value={version}>
                        {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="node-community">SNMP Community</Label>
              <Input
                id="node-community"
                value={createForm.snmpCommunity}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    snmpCommunity: e.target.value,
                  }))
                }
                placeholder="public"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createNode.isPending}>
                {createNode.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> A gravar
                  </>
                ) : (
                  "Adicionar"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={discoveryOpen} onOpenChange={setDiscoveryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descoberta de rede</DialogTitle>
            <DialogDescription>
              Inicia uma varredura com base na sub-rede e parâmetros SNMP informados.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleDiscovery}>
            <div className="space-y-2">
              <Label htmlFor="discovery-subnet">Sub-rede</Label>
              <Input
                id="discovery-subnet"
                value={discoveryForm.subnet}
                onChange={(e) =>
                  setDiscoveryForm((prev) => ({ ...prev, subnet: e.target.value }))
                }
                placeholder="192.168.1.0/24"
                required
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>SNMP Version</Label>
                <Select
                  value={discoveryForm.snmpVersion}
                  onValueChange={(value) =>
                    setDiscoveryForm((prev) => ({ ...prev, snmpVersion: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {snmpVersions.map((version) => (
                      <SelectItem key={version} value={version}>
                        {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="discovery-community">SNMP Community</Label>
                <Input
                  id="discovery-community"
                  value={discoveryForm.snmpCommunity}
                  onChange={(e) =>
                    setDiscoveryForm((prev) => ({
                      ...prev,
                      snmpCommunity: e.target.value,
                    }))
                  }
                  placeholder="public"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDiscoveryOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={triggerDiscovery.isPending}>
                {triggerDiscovery.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> A iniciar
                  </>
                ) : (
                  "Executar descoberta"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
