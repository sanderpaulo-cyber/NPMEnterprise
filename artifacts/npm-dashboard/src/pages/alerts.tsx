import { useAcknowledgeAlert } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, Clock, Filter, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useMemo, useState } from "react";

interface EnrichedAlert {
  id: string;
  nodeId: string;
  nodeName: string;
  severity: "critical" | "warning" | "info";
  type: string;
  typeLabel: string;
  category: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  acknowledgedAt?: string;
  isHeuristic: boolean;
  recommendedAction: string;
  quickChecks: string[];
}

interface AlertListResponse {
  alerts: EnrichedAlert[];
  total: number;
}

export default function Alerts() {
  const [severityFilter, setSeverityFilter] = useState<"all" | "critical" | "warning" | "info">("all");
  const [ackFilter, setAckFilter] = useState<"all" | "open" | "ack">("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const { data: alerts, isLoading } = useQuery({
    queryKey: ["/api/alerts/enriched", 500],
    queryFn: async (): Promise<AlertListResponse> => {
      const response = await fetch("/api/alerts?limit=500");
      if (!response.ok) {
        throw new Error(`Falha ao carregar alertas (${response.status})`);
      }
      return response.json();
    },
    refetchInterval: 10000,
  });
  const ackMutation = useAcknowledgeAlert();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const visibleAlerts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (alerts?.alerts ?? []).filter((alert) => {
      if (severityFilter !== "all" && alert.severity !== severityFilter) return false;
      if (ackFilter === "open" && alert.acknowledged) return false;
      if (ackFilter === "ack" && !alert.acknowledged) return false;
      if (typeFilter !== "all" && alert.type !== typeFilter) return false;
      if (!normalizedSearch) return true;
      return (
        alert.nodeName.toLowerCase().includes(normalizedSearch) ||
        alert.message.toLowerCase().includes(normalizedSearch) ||
        alert.type.toLowerCase().includes(normalizedSearch) ||
        alert.category.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [ackFilter, alerts?.alerts, search, severityFilter, typeFilter]);

  const groupedAlerts = useMemo(() => {
    const groups = new Map<string, EnrichedAlert[]>();
    for (const alert of visibleAlerts) {
      const key = `${alert.type}__${alert.severity}`;
      const list = groups.get(key) ?? [];
      list.push(alert);
      groups.set(key, list);
    }
    return Array.from(groups.entries())
      .map(([key, items]) => ({
        key,
        type: items[0].type,
        typeLabel: items[0].typeLabel,
        severity: items[0].severity,
        category: items[0].category,
        isHeuristic: items[0].isHeuristic,
        recommendedAction: items[0].recommendedAction,
        quickChecks: items[0].quickChecks,
        items,
        openCount: items.filter((item) => !item.acknowledged).length,
      }))
      .sort((a, b) => b.openCount - a.openCount || a.typeLabel.localeCompare(b.typeLabel));
  }, [visibleAlerts]);

  const availableTypes = useMemo(() => {
    return Array.from(new Map((alerts?.alerts ?? []).map((alert) => [alert.type, alert.typeLabel])).entries())
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [alerts?.alerts]);

  const handleAck = (id: string) => {
    ackMutation.mutate({ alertId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
        queryClient.invalidateQueries({ queryKey: ['/api/alerts/enriched'] });
        toast({ title: "Alerta reconhecido", description: "O alerta foi marcado como tratado." });
      },
      onError: () => {
        toast({ title: "Erro", description: "Falha ao reconhecer o alerta.", variant: "destructive" });
      }
    });
  };

  const handleAckGroup = async (ids: string[]) => {
    try {
      const response = await fetch("/api/alerts/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!response.ok) {
        throw new Error("Falha ao reconhecer alertas do grupo");
      }
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts/enriched"] });
      toast({
        title: "Grupo reconhecido",
        description: `${ids.length} alerta(s) marcados como tratados.`,
      });
    } catch {
      toast({
        title: "Erro",
        description: "Falha ao reconhecer o grupo de alertas.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" /> Alert Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Organize por tipo, reconheca em lote e aja com tratativa recomendada.</p>
        </div>
      </div>

      <Card className="glass-panel border-border/50">
        <CardContent className="p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por no, mensagem ou tipo..."
            />
            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value as typeof severityFilter)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="all">Todas severidades</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select
              value={ackFilter}
              onChange={(event) => setAckFilter(event.target.value as typeof ackFilter)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="open">Somente abertos</option>
              <option value="ack">Somente reconhecidos</option>
              <option value="all">Todos</option>
            </select>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              <option value="all">Todos os tipos</option>
              {availableTypes.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
             <div className="p-8 space-y-4">
               {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-lg" />)}
             </div>
          ) : groupedAlerts.length === 0 ? (
             <div className="p-16 text-center flex flex-col items-center">
               <CheckCircle2 className="h-16 w-16 text-success opacity-50 mb-4" />
               <h3 className="text-xl font-medium text-foreground">Nenhum alerta no filtro atual</h3>
               <p className="text-muted-foreground mt-2">Ajuste os filtros para visualizar outros alertas.</p>
             </div>
          ) : (
            <div className="divide-y divide-border/50">
              {groupedAlerts.map((group) => (
                <div key={group.key} className="p-4 space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={group.severity} className="px-3 py-1 text-xs" />
                        <span className="text-lg font-semibold text-foreground">{group.typeLabel}</span>
                        <span className="rounded border border-border px-2 py-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                          {group.category}
                        </span>
                        {group.isHeuristic ? (
                          <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs uppercase tracking-wider text-warning">
                            Heuristico
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {group.items.length} alerta(s), {group.openCount} em aberto.
                      </p>
                    </div>
                    {group.openCount > 0 ? (
                      <Button
                        variant="outline"
                        onClick={() => handleAckGroup(group.items.filter((item) => !item.acknowledged).map((item) => item.id))}
                        className="shrink-0 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                      >
                        Reconhecer grupo
                      </Button>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {group.items.map((alert) => (
                      <div key={alert.id} className={`rounded-lg border border-border/50 p-4 transition-colors ${alert.acknowledged ? 'bg-background/20 opacity-60' : 'hover:bg-secondary/30 bg-card/40'}`}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="flex-1">
                            <h4 className="text-base font-semibold text-foreground">{alert.nodeName}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                            <div className="mt-3 rounded-lg border border-border/50 bg-background/40 p-3 text-sm">
                              <div className="mb-1 flex items-center gap-2 font-medium text-foreground">
                                <Wrench className="h-4 w-4" /> Tratativa recomendada
                              </div>
                              <p className="text-muted-foreground">{alert.recommendedAction}</p>
                              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                                {alert.quickChecks.map((item) => (
                                  <div key={`${alert.id}:${item}`}>- {item}</div>
                                ))}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground font-mono">
                              <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {format(new Date(alert.createdAt), 'MMM d, HH:mm:ss')}</span>
                              {alert.acknowledged && alert.acknowledgedAt ? (
                                <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Ack'd at {format(new Date(alert.acknowledgedAt), 'HH:mm')}</span>
                              ) : null}
                            </div>
                          </div>
                          {!alert.acknowledged ? (
                            <Button
                              variant="outline"
                              onClick={() => handleAck(alert.id)}
                              disabled={ackMutation.isPending}
                              className="shrink-0 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                            >
                              Acknowledge
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
