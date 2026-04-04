import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { setBaseUrl, useHealthCheck } from "@workspace/api-client-react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useDashboardSettings } from "@/context/dashboard-settings-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { authFetch } from "@/lib/auth-fetch";
import { useAuth } from "@/context/auth-context";
import { SettingsUsersPanel } from "@/components/settings-users-panel";
import {
  sanitizeApiBaseUrl,
} from "@/lib/dashboard-local-settings";
import type { DashboardLocalSettings } from "@/context/dashboard-settings-types";

type AppSettingsResponse = {
  version: number;
  server: Record<string, unknown>;
  persisted: Record<string, unknown>;
  persistedReady?: boolean;
  persistedWarning?: string;
};

async function fetchSettings(): Promise<AppSettingsResponse> {
  const res = await authFetch("/api/settings");
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as AppSettingsResponse;
}

async function patchSettings(values: Record<string, unknown>) {
  const res = await authFetch("/api/settings", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { ok: boolean; persisted: Record<string, unknown> };
}

async function deleteSettingKey(key: string) {
  const res = await authFetch(`/api/settings/${encodeURIComponent(key)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

export default function SettingsPage() {
  const { authRequired } = useAuth();
  const { local, patchLocal } = useDashboardSettings();
  const { isConnected } = useWebSocket();
  const { data: health } = useHealthCheck();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ["/api/settings"],
    queryFn: fetchSettings,
    staleTime: 15_000,
  });

  const [persistJson, setPersistJson] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValueJson, setNewValueJson] = useState("null");

  const [ifaceDraft, setIfaceDraft] = useState<DashboardLocalSettings["interface"]>(
    () => ({ ...local.interface }),
  );
  const [connDraft, setConnDraft] = useState(local.connection.apiBaseUrl);

  useEffect(() => {
    setIfaceDraft({ ...local.interface });
  }, [local.interface.theme, local.interface.locale, local.interface.dataRefreshIntervalMs]);

  useEffect(() => {
    setConnDraft(local.connection.apiBaseUrl);
  }, [local.connection.apiBaseUrl]);

  const ifaceDirty = useMemo(
    () =>
      ifaceDraft.theme !== local.interface.theme ||
      ifaceDraft.locale !== local.interface.locale ||
      ifaceDraft.dataRefreshIntervalMs !== local.interface.dataRefreshIntervalMs,
    [ifaceDraft, local.interface],
  );

  const connDirty = useMemo(
    () =>
      sanitizeApiBaseUrl(connDraft) !== sanitizeApiBaseUrl(local.connection.apiBaseUrl),
    [connDraft, local.connection.apiBaseUrl],
  );

  function saveInterfacePreferences() {
    patchLocal({ interface: { ...ifaceDraft } });
    toast({
      title: "Preferências guardadas",
      description: "Guardado em localStorage neste browser.",
    });
  }

  function resetInterfaceDraft() {
    setIfaceDraft({ ...local.interface });
  }

  function saveConnectionLocalOnly() {
    const cleaned = sanitizeApiBaseUrl(connDraft);
    patchLocal({ connection: { ...local.connection, apiBaseUrl: cleaned } });
    setConnDraft(cleaned);
    toast({
      title: "URL guardada localmente",
      description: "Recarregue a página ou use «Aplicar e recarregar» para o cliente HTTP usar já este URL.",
    });
  }

  function resetConnectionDraft() {
    setConnDraft(local.connection.apiBaseUrl);
  }

  function applyConnectionUrlAndReload() {
    const cleaned = sanitizeApiBaseUrl(connDraft);
    patchLocal({ connection: { ...local.connection, apiBaseUrl: cleaned } });
    setBaseUrl(cleaned.length > 0 ? cleaned : null);
    window.location.reload();
  }

  const persistedEntries = useMemo(
    () =>
      Object.entries(settingsQuery.data?.persisted ?? {}).sort(([a], [b]) =>
        a.localeCompare(b),
      ),
    [settingsQuery.data?.persisted],
  );

  const persistedReady = settingsQuery.data?.persistedReady !== false;

  const patchMutation = useMutation({
    mutationFn: patchSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Configuração gravada", description: "Valores persistidos na base de dados." });
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao gravar",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSettingKey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Chave removida" });
    },
    onError: () => {
      toast({
        title: "Erro ao remover",
        variant: "destructive",
      });
    },
  });

  function handleMergeJson() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(persistJson.trim() || "{}");
    } catch {
      toast({
        title: "JSON inválido",
        description: "Corrija o texto antes de aplicar.",
        variant: "destructive",
      });
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast({
        title: "Formato inválido",
        description: "O JSON tem de ser um objeto com chaves.",
        variant: "destructive",
      });
      return;
    }
    patchMutation.mutate(parsed as Record<string, unknown>);
    setPersistJson("");
  }

  function handleAddPair() {
    const key = newKey.trim();
    if (!key) return;
    let value: unknown;
    try {
      value = JSON.parse(newValueJson.trim() || "null");
    } catch {
      toast({
        title: "Valor JSON inválido",
        variant: "destructive",
      });
      return;
    }
    patchMutation.mutate({ [key]: value });
    setNewKey("");
    setNewValueJson("null");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="-ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-muted-foreground text-sm">
            Preferências do browser, ligação à API, utilizadores (com autenticação activa), servidor e
            valores persistidos. Amplie o registo em{" "}
            <code className="text-xs bg-secondary px-1 rounded">src/config/settings-registry.ts</code>.
          </p>
        </div>
      </div>

      <Tabs defaultValue="interface" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="interface">Interface</TabsTrigger>
          <TabsTrigger value="connection">Conexão</TabsTrigger>
          <TabsTrigger value="users">Utilizadores</TabsTrigger>
          <TabsTrigger value="server">Servidor</TabsTrigger>
          <TabsTrigger value="persisted">Armazenamento</TabsTrigger>
          <TabsTrigger value="shortcuts">Atalhos</TabsTrigger>
        </TabsList>

        <TabsContent value="interface" className="mt-4">
          <Card className="border-border bg-card/40">
            <CardHeader>
              <CardTitle>Interface (este browser)</CardTitle>
              <CardDescription>
                Guardado em <code className="text-xs">localStorage</code>. Edite os valores e clique
                em <strong className="font-medium">Guardar preferências</strong> para aplicar. O
                intervalo define o <em>stale time</em> global do React Query (dados considerados
                frescos). O idioma define o atributo <code className="text-xs">lang</code> do
                documento (base para acessibilidade e futura tradução da UI).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <Label>Tema</Label>
                <Select
                  value={ifaceDraft.theme}
                  onValueChange={(v) =>
                    setIfaceDraft((d) => ({
                      ...d,
                      theme: v as "system" | "light" | "dark",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema</SelectItem>
                    <SelectItem value="light">Claro</SelectItem>
                    <SelectItem value="dark">Escuro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Claro</strong> — mesmos matizes do escuro, com
                  saturação cerca de 70% da do escuro (HSL) e superfícies claras.{" "}
                  <strong className="text-foreground">Sistema</strong> — em modo claro do SO, fundo
                  branco neutro (sem matiz ardósia), distinto do Claro e do Escuro; com SO escuro,
                  tema escuro.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Idioma (documento / preferência)</Label>
                <Select
                  value={ifaceDraft.locale}
                  onValueChange={(v) =>
                    setIfaceDraft((d) => ({
                      ...d,
                      locale: v as "pt" | "en",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt">Português</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="refresh-ms">Intervalo de atualização (ms)</Label>
                <Input
                  id="refresh-ms"
                  type="number"
                  min={0}
                  step={1000}
                  value={ifaceDraft.dataRefreshIntervalMs}
                  onChange={(e) =>
                    setIfaceDraft((d) => ({
                      ...d,
                      dataRefreshIntervalMs: Number.parseInt(e.target.value, 10) || 0,
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Valores &gt; 0: milissegundos até os dados serem considerados obsoletos e
                  revalidados em segundo plano. Use 0 para manter 30s por omissão. Alguns ecrãs
                  definem intervalo próprio e não seguem este valor.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button
                  type="button"
                  onClick={saveInterfacePreferences}
                  disabled={!ifaceDirty}
                >
                  Guardar preferências
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetInterfaceDraft}
                  disabled={!ifaceDirty}
                >
                  Repor
                </Button>
                {ifaceDirty && (
                  <span className="text-xs text-amber-600 dark:text-amber-500">
                    Alterações por guardar
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connection" className="mt-4">
          <Card className="border-border bg-card/40">
            <CardHeader>
              <CardTitle>Conexão com a API</CardTitle>
              <CardDescription>
                URL base para o cliente OpenAPI gerado (pedidos relativos <code className="text-xs">
                  /api/…
                </code>
                ). Ao <strong className="font-medium">guardar</strong>, o URL passa a ser usado de
                imediato por esse cliente. O login e alguns pedidos manuais continuam no mesmo
                sítio que a página (cookie de sessão). Vazio = host actual com proxy{" "}
                <code className="text-xs">/api</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-2xl">
              <div className="space-y-2">
                <Label htmlFor="api-base">URL base da API</Label>
                <Input
                  id="api-base"
                  placeholder="ex.: https://api.exemplo.com"
                  value={connDraft}
                  onChange={(e) => setConnDraft(e.target.value)}
                />
              </div>
              <div className="rounded-md border border-border bg-secondary/20 p-3 text-sm space-y-1">
                <p>
                  <span className="text-muted-foreground">Origem atual: </span>
                  <code className="text-xs">{window.location.origin}</code>
                </p>
                <p>
                  <span className="text-muted-foreground">Vite env: </span>
                  <code className="text-xs">
                    {import.meta.env.VITE_API_BASE_URL ?? "— (proxy /api)"}
                  </code>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={saveConnectionLocalOnly}
                  disabled={!connDirty}
                >
                  Guardar na memória local
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetConnectionDraft}
                  disabled={!connDirty}
                >
                  Repor
                </Button>
                <Button type="button" onClick={applyConnectionUrlAndReload}>
                  Aplicar e recarregar
                </Button>
                {connDirty && (
                  <span className="text-xs text-amber-600 dark:text-amber-500">
                    URL por guardar
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="mt-4 space-y-4">
          {!authRequired ? (
            <Alert>
              <AlertTitle>Gestão de utilizadores indisponível</AlertTitle>
              <AlertDescription>
                Esta área exige <code className="text-xs">AUTH_ENABLED=true</code> na API. Sem
                autenticação, não há contas locais para administrar aqui.
              </AlertDescription>
            </Alert>
          ) : (
            <SettingsUsersPanel />
          )}
        </TabsContent>

        <TabsContent value="server" className="mt-4 space-y-4">
          <Card className="border-border bg-card/40">
            <CardHeader>
              <CardTitle>Estado em tempo real</CardTitle>
              <CardDescription>WebSocket e health check.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                WebSocket:{" "}
                <span className={isConnected ? "text-success" : "text-destructive"}>
                  {isConnected ? "conectado" : "desconectado"}
                </span>
              </p>
              <p>
                API:{" "}
                <span
                  className={
                    health?.status === "ok" ? "text-success" : "text-muted-foreground"
                  }
                >
                  {health?.status === "ok" ? "saudável" : "sem resposta"}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-border bg-card/40">
            <CardHeader>
              <CardTitle>Ambiente do servidor (leitura)</CardTitle>
              <CardDescription>
                Valores efectivos a partir das variáveis de ambiente do processo da API. Alterações
                requerem deploy ou ficheiro <code className="text-xs">.env</code> e reinício.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {settingsQuery.isLoading && (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              )}
              {settingsQuery.isError && (
                <p className="text-sm text-destructive">
                  Não foi possível ler /api/settings. Execute{" "}
                  <code className="text-xs">pnpm db:push</code> para criar a tabela{" "}
                  <code className="text-xs">app_settings</code> se ainda não existir.
                </p>
              )}
              {settingsQuery.data?.server && (
                <pre className="text-xs bg-secondary/40 border border-border rounded-lg p-4 overflow-x-auto max-h-[420px]">
                  {JSON.stringify(settingsQuery.data.server, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="persisted" className="mt-4 space-y-4">
          <Card className="border-border bg-card/40">
            <CardHeader>
              <CardTitle>Valores persistidos (PostgreSQL)</CardTitle>
              <CardDescription>
                Chave/valor JSON na base de dados, via API. Só alteram o comportamento do dashboard
                se alguma funcionalidade estiver programada para ler essas chaves (não são mapeadas
                automaticamente para a UI). Não coloque segredos sem autenticação na API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!persistedReady && settingsQuery.data?.persistedWarning && (
                <Alert variant="destructive">
                  <AlertTitle>Armazenamento persistido indisponível</AlertTitle>
                  <AlertDescription>{settingsQuery.data.persistedWarning}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label>Fusão em lote (JSON objeto)</Label>
                <Textarea
                  placeholder='{"minha_chave": true, "outro": 42}'
                  rows={5}
                  value={persistJson}
                  onChange={(e) => setPersistJson(e.target.value)}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleMergeJson}
                  disabled={patchMutation.isPending || !persistedReady}
                >
                  Aplicar fusão
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nk">Nova chave</Label>
                  <Input
                    id="nk"
                    placeholder="ex.: feature.netpath.beta"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nv">Valor (JSON)</Label>
                  <Input
                    id="nv"
                    className="font-mono text-xs"
                    value={newValueJson}
                    onChange={(e) => setNewValueJson(e.target.value)}
                  />
                </div>
              </div>
              <Button
                type="button"
                onClick={handleAddPair}
                disabled={patchMutation.isPending || !newKey.trim() || !persistedReady}
              >
                Adicionar ou atualizar par
              </Button>

              <div className="space-y-2">
                <Label>Chaves actuais</Label>
                {persistedEntries.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma chave guardada.</p>
                )}
                <ul className="space-y-2">
                  {persistedEntries.map(([key, value]) => (
                    <li
                      key={key}
                      className="flex items-start justify-between gap-2 rounded-lg border border-border bg-secondary/10 p-3"
                    >
                      <div className="min-w-0">
                        <code className="text-xs font-semibold break-all">{key}</code>
                        <pre className="text-[11px] mt-1 text-muted-foreground whitespace-pre-wrap break-all">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-destructive"
                        onClick={() => deleteMutation.mutate(key)}
                        disabled={deleteMutation.isPending || !persistedReady}
                        aria-label={`Remover ${key}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="shortcuts" className="mt-4">
          <Card className="border-border bg-card/40">
            <CardHeader>
              <CardTitle>Atalhos operacionais</CardTitle>
              <CardDescription>Navegação rápida para áreas frequentes.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Link href="/nodes">
                <Button variant="outline">Inventário de nós</Button>
              </Link>
              <Link href="/poller">
                <Button variant="outline">Motor de polling</Button>
              </Link>
              <Link href="/discovery">
                <Button variant="outline">Descoberta</Button>
              </Link>
              <Link href="/alerts">
                <Button variant="outline">Alertas</Button>
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
