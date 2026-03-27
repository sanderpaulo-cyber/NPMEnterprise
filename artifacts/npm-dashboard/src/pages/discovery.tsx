import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  KeyRound,
  Loader2,
  Network,
  Play,
  Plus,
  Radar,
  Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  createCredential,
  createScope,
  deleteCredential,
  deleteScope,
  listCredentials,
  listRuns,
  listScopes,
  queueDiscoveryRuns,
  type DiscoveryRun,
} from "@/lib/discovery-api";

const credentialVersions = ["v1", "v2c", "v3"] as const;
const authProtocols = ["none", "md5", "sha", "sha224", "sha256", "sha384", "sha512"] as const;
const privProtocols = ["none", "des", "aes"] as const;

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function renderStatus(run: DiscoveryRun) {
  const palette: Record<DiscoveryRun["status"], string> = {
    queued: "text-warning",
    running: "text-primary",
    completed: "text-success",
    failed: "text-destructive",
    cancelled: "text-muted-foreground",
  };
  return <span className={`font-medium capitalize ${palette[run.status]}`}>{run.status}</span>;
}

export default function DiscoveryPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false);
  const [adhocCidr, setAdhocCidr] = useState("");
  const [adhocCredentialId, setAdhocCredentialId] = useState("none");
  const [scopeForm, setScopeForm] = useState({
    name: "",
    cidr: "",
    site: "",
    description: "",
    priority: "100",
    defaultCredentialId: "none",
  });
  const [credentialForm, setCredentialForm] = useState({
    name: "",
    version: "v2c",
    community: "public",
    username: "",
    authProtocol: "none",
    authPassword: "",
    privProtocol: "none",
    privPassword: "",
    port: "161",
    timeoutMs: "2000",
    retries: "1",
  });

  const scopesQuery = useQuery({
    queryKey: ["/api/discovery/scopes"],
    queryFn: listScopes,
    refetchInterval: 15_000,
  });
  const credentialsQuery = useQuery({
    queryKey: ["/api/discovery/credentials"],
    queryFn: listCredentials,
    refetchInterval: 20_000,
  });
  const runsQuery = useQuery({
    queryKey: ["/api/discovery/runs"],
    queryFn: listRuns,
    refetchInterval: 4_000,
  });

  const refreshAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/scopes"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/credentials"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/discovery/runs"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/nodes"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/nodes/stats/summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/topology"] }),
    ]);
  };

  const createScopeMutation = useMutation({
    mutationFn: createScope,
    onSuccess: async () => {
      await refreshAll();
      setScopeDialogOpen(false);
      setScopeForm({
        name: "",
        cidr: "",
        site: "",
        description: "",
        priority: "100",
        defaultCredentialId: "none",
      });
      toast({ title: "Escopo criado", description: "O novo escopo já pode ser usado em discovery." });
    },
    onError: (error) => {
      toast({
        title: "Falha ao criar escopo",
        description: error instanceof Error ? error.message : "Erro ao criar escopo.",
        variant: "destructive",
      });
    },
  });

  const createCredentialMutation = useMutation({
    mutationFn: createCredential,
    onSuccess: async () => {
      await refreshAll();
      setCredentialDialogOpen(false);
      setCredentialForm({
        name: "",
        version: "v2c",
        community: "public",
        username: "",
        authProtocol: "none",
        authPassword: "",
        privProtocol: "none",
        privPassword: "",
        port: "161",
        timeoutMs: "2000",
        retries: "1",
      });
      toast({
        title: "Credencial criada",
        description: "A credencial SNMP já pode ser associada a um escopo.",
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao criar credencial",
        description: error instanceof Error ? error.message : "Erro ao criar credencial.",
        variant: "destructive",
      });
    },
  });

  const deleteScopeMutation = useMutation({
    mutationFn: deleteScope,
    onSuccess: async () => {
      await refreshAll();
      toast({ title: "Escopo removido", description: "O escopo foi excluído." });
    },
    onError: (error) => {
      toast({
        title: "Falha ao remover escopo",
        description: error instanceof Error ? error.message : "Erro ao remover escopo.",
        variant: "destructive",
      });
    },
  });

  const deleteCredentialMutation = useMutation({
    mutationFn: deleteCredential,
    onSuccess: async () => {
      await refreshAll();
      toast({ title: "Credencial removida", description: "A credencial foi excluída." });
    },
    onError: (error) => {
      toast({
        title: "Falha ao remover credencial",
        description: error instanceof Error ? error.message : "Erro ao remover credencial.",
        variant: "destructive",
      });
    },
  });

  const queueRunsMutation = useMutation({
    mutationFn: queueDiscoveryRuns,
    onSuccess: async (result) => {
      await refreshAll();
      toast({
        title: "Discovery enfileirado",
        description: `${result.queued} execução(ões) iniciadas.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Falha ao iniciar discovery",
        description: error instanceof Error ? error.message : "Erro ao iniciar discovery.",
        variant: "destructive",
      });
    },
  });

  const enabledScopeIds = useMemo(
    () => (scopesQuery.data?.scopes ?? []).filter((scope) => scope.enabled).map((scope) => scope.id),
    [scopesQuery.data?.scopes],
  );

  const summary = useMemo(() => {
    const runs = runsQuery.data?.runs ?? [];
    return {
      scopes: scopesQuery.data?.scopes.length ?? 0,
      credentials: credentialsQuery.data?.credentials.length ?? 0,
      running: runsQuery.data?.running ?? 0,
      discovered: runs.reduce((acc, run) => acc + run.hostsDiscovered, 0),
    };
  }, [credentialsQuery.data?.credentials.length, runsQuery.data?.running, runsQuery.data?.runs, scopesQuery.data?.scopes.length]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
            <Radar className="h-8 w-8 text-primary" /> Discovery Corporativo
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-3xl">
            Consola operacional para cadastrar escopos, credenciais SNMP e executar descobertas reais por CIDR.
            Esta base já faz varredura ICMP real e tenta enriquecimento SNMP em hosts responsivos ou acessíveis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="border-border" onClick={() => setCredentialDialogOpen(true)}>
            <KeyRound className="h-4 w-4 mr-2" /> Nova credencial
          </Button>
          <Button variant="outline" className="border-border" onClick={() => setScopeDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Novo escopo
          </Button>
          <Button
            onClick={() => queueRunsMutation.mutate({ scopeIds: enabledScopeIds })}
            disabled={enabledScopeIds.length === 0 || queueRunsMutation.isPending}
          >
            {queueRunsMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Executar todos os escopos
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Escopos</p>
                <p className="text-3xl font-bold font-mono">{summary.scopes}</p>
              </div>
              <Network className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Credenciais</p>
                <p className="text-3xl font-bold font-mono">{summary.credentials}</p>
              </div>
              <KeyRound className="h-6 w-6 text-warning" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Execuções ativas</p>
                <p className="text-3xl font-bold font-mono">{summary.running}</p>
              </div>
              <Activity className="h-6 w-6 text-success" />
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hosts descobertos</p>
                <p className="text-3xl font-bold font-mono">{summary.discovered}</p>
              </div>
              <Radar className="h-6 w-6 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-mono">Execução avulsa por CIDR</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[2fr_1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="adhoc-cidr">CIDR</Label>
            <Input
              id="adhoc-cidr"
              value={adhocCidr}
              onChange={(event) => setAdhocCidr(event.target.value)}
              placeholder="10.10.20.0/24"
            />
          </div>
          <div className="space-y-2">
            <Label>Credencial SNMP</Label>
            <Select value={adhocCredentialId} onValueChange={setAdhocCredentialId}>
              <SelectTrigger>
                <SelectValue placeholder="Sem SNMP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem credencial</SelectItem>
                {(credentialsQuery.data?.credentials ?? []).map((credential) => (
                  <SelectItem key={credential.id} value={credential.id}>
                    {credential.name} ({credential.version})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!adhocCidr.trim() || queueRunsMutation.isPending}
              onClick={() =>
                queueRunsMutation.mutate({
                  cidrs: [adhocCidr.trim()],
                  credentialId: adhocCredentialId === "none" ? null : adhocCredentialId,
                })
              }
            >
              <Play className="h-4 w-4 mr-2" /> Rodar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-mono">Escopos de rede</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CIDR</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Última execução</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(scopesQuery.data?.scopes ?? []).map((scope) => (
                <TableRow key={scope.id}>
                  <TableCell className="font-medium">{scope.name}</TableCell>
                  <TableCell className="font-mono">{scope.cidr}</TableCell>
                  <TableCell>{scope.site || "—"}</TableCell>
                  <TableCell>{scope.priority}</TableCell>
                  <TableCell>{formatDate(scope.lastRunAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => queueRunsMutation.mutate({ scopeIds: [scope.id] })}
                      >
                        <Play className="h-4 w-4 mr-1" /> Rodar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={deleteScopeMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Excluir o escopo ${scope.name}?`)) {
                            deleteScopeMutation.mutate(scope.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(scopesQuery.data?.scopes ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Nenhum escopo cadastrado.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-mono">Credenciais SNMP</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Porta</TableHead>
                  <TableHead>Timeout</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(credentialsQuery.data?.credentials ?? []).map((credential) => (
                  <TableRow key={credential.id}>
                    <TableCell className="font-medium">{credential.name}</TableCell>
                    <TableCell>{credential.version}</TableCell>
                    <TableCell>{credential.port}</TableCell>
                    <TableCell>{credential.timeoutMs} ms</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={deleteCredentialMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Excluir a credencial ${credential.name}?`)) {
                            deleteCredentialMutation.mutate(credential.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(credentialsQuery.data?.credentials ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nenhuma credencial cadastrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-mono">Histórico de discovery</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Escopo / CIDR</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progresso</TableHead>
                  <TableHead>Descobertos</TableHead>
                  <TableHead>Mensagem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(runsQuery.data?.runs ?? []).map((run) => (
                  <TableRow key={run.id}>
                    <TableCell>
                      <div className="font-medium">{run.scopeName || "Ad-hoc"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{run.cidr}</div>
                    </TableCell>
                    <TableCell>{renderStatus(run)}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {run.hostsScanned}/{run.hostsTotal}
                    </TableCell>
                    <TableCell className="font-mono">{run.hostsDiscovered}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{run.message || "—"}</div>
                      <div>{formatDate(run.startedAt)}</div>
                    </TableCell>
                  </TableRow>
                ))}
                {(runsQuery.data?.runs ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Nenhuma execução registrada.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo escopo</DialogTitle>
            <DialogDescription>
              Defina a sub-rede a ser descoberta e, opcionalmente, a credencial padrão SNMP.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createScopeMutation.mutate({
                name: scopeForm.name.trim(),
                cidr: scopeForm.cidr.trim(),
                site: scopeForm.site.trim() || undefined,
                description: scopeForm.description.trim() || undefined,
                priority: Number(scopeForm.priority) || 100,
                defaultCredentialId:
                  scopeForm.defaultCredentialId === "none"
                    ? null
                    : scopeForm.defaultCredentialId,
              });
            }}
          >
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={scopeForm.name} onChange={(event) => setScopeForm((prev) => ({ ...prev, name: event.target.value }))} required />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>CIDR</Label>
                <Input value={scopeForm.cidr} onChange={(event) => setScopeForm((prev) => ({ ...prev, cidr: event.target.value }))} placeholder="10.0.10.0/24" required />
              </div>
              <div className="space-y-2">
                <Label>Site</Label>
                <Input value={scopeForm.site} onChange={(event) => setScopeForm((prev) => ({ ...prev, site: event.target.value }))} placeholder="DC-SP" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Prioridade</Label>
                <Input value={scopeForm.priority} onChange={(event) => setScopeForm((prev) => ({ ...prev, priority: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Credencial padrão</Label>
                <Select
                  value={scopeForm.defaultCredentialId}
                  onValueChange={(value) =>
                    setScopeForm((prev) => ({ ...prev, defaultCredentialId: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem credencial</SelectItem>
                    {(credentialsQuery.data?.credentials ?? []).map((credential) => (
                      <SelectItem key={credential.id} value={credential.id}>
                        {credential.name} ({credential.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={scopeForm.description} onChange={(event) => setScopeForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Core do campus, acesso administrativo, etc." />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScopeDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createScopeMutation.isPending}>
                {createScopeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Criar escopo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={credentialDialogOpen} onOpenChange={setCredentialDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova credencial SNMP</DialogTitle>
            <DialogDescription>
              Cadastre credenciais operacionais para enriquecimento e inventário SNMP.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createCredentialMutation.mutate({
                name: credentialForm.name.trim(),
                version: credentialForm.version as "v1" | "v2c" | "v3",
                community:
                  credentialForm.version === "v1" || credentialForm.version === "v2c"
                    ? credentialForm.community.trim()
                    : undefined,
                username:
                  credentialForm.version === "v3"
                    ? credentialForm.username.trim()
                    : undefined,
                authProtocol: credentialForm.authProtocol as typeof authProtocols[number],
                authPassword: credentialForm.authPassword.trim() || undefined,
                privProtocol: credentialForm.privProtocol as typeof privProtocols[number],
                privPassword: credentialForm.privPassword.trim() || undefined,
                port: Number(credentialForm.port) || 161,
                timeoutMs: Number(credentialForm.timeoutMs) || 2000,
                retries: Number(credentialForm.retries) || 1,
              });
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={credentialForm.name} onChange={(event) => setCredentialForm((prev) => ({ ...prev, name: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>Versão</Label>
                <Select
                  value={credentialForm.version}
                  onValueChange={(value) =>
                    setCredentialForm((prev) => ({ ...prev, version: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {credentialVersions.map((version) => (
                      <SelectItem key={version} value={version}>
                        {version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {credentialForm.version === "v1" || credentialForm.version === "v2c" ? (
              <div className="space-y-2">
                <Label>Community</Label>
                <Input value={credentialForm.community} onChange={(event) => setCredentialForm((prev) => ({ ...prev, community: event.target.value }))} />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usuário</Label>
                  <Input value={credentialForm.username} onChange={(event) => setCredentialForm((prev) => ({ ...prev, username: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Auth Protocol</Label>
                  <Select
                    value={credentialForm.authProtocol}
                    onValueChange={(value) =>
                      setCredentialForm((prev) => ({ ...prev, authProtocol: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {authProtocols.map((protocol) => (
                        <SelectItem key={protocol} value={protocol}>
                          {protocol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Auth Password</Label>
                  <Input type="password" value={credentialForm.authPassword} onChange={(event) => setCredentialForm((prev) => ({ ...prev, authPassword: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Priv Protocol</Label>
                  <Select
                    value={credentialForm.privProtocol}
                    onValueChange={(value) =>
                      setCredentialForm((prev) => ({ ...prev, privProtocol: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {privProtocols.map((protocol) => (
                        <SelectItem key={protocol} value={protocol}>
                          {protocol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Priv Password</Label>
                  <Input type="password" value={credentialForm.privPassword} onChange={(event) => setCredentialForm((prev) => ({ ...prev, privPassword: event.target.value }))} />
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Porta</Label>
                <Input value={credentialForm.port} onChange={(event) => setCredentialForm((prev) => ({ ...prev, port: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Timeout (ms)</Label>
                <Input value={credentialForm.timeoutMs} onChange={(event) => setCredentialForm((prev) => ({ ...prev, timeoutMs: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Retries</Label>
                <Input value={credentialForm.retries} onChange={(event) => setCredentialForm((prev) => ({ ...prev, retries: event.target.value }))} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCredentialDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createCredentialMutation.isPending}>
                {createCredentialMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Criar credencial
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
