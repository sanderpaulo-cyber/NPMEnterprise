import { useGetPollerStatus, useTriggerPoll } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, Play, CheckCircle2, Activity, HardDrive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Poller() {
  const { data: status, isLoading } = useGetPollerStatus();
  const triggerMutation = useTriggerPoll();
  const { toast } = useToast();

  const handleManualPoll = () => {
    triggerMutation.mutate({ data: { allNodes: true } }, {
      onSuccess: (res) => {
        toast({ title: "Poll Triggered", description: `Cycle started for ${res.triggered} nodes.` });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
            <Zap className="h-8 w-8 text-warning" /> Poller Engine
          </h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-xl">
            Por predefinição o motor faz ping ICMP aos IPs dos nós (alcance e latência reais). CPU, memória e tráfego de
            interfaces só seriam possíveis com SNMP — ainda não ligado a equipamentos reais. Para dados de demonstração
            aleatórios, defina{" "}
            <code className="text-xs bg-secondary/80 px-1 rounded">NETWORK_POLLING_MODE=simulated</code> na API.
          </p>
        </div>
        <Button 
          onClick={handleManualPoll} 
          disabled={triggerMutation.isPending || status?.running === false}
          className="bg-primary text-primary-foreground font-bold font-mono"
        >
          <Play className="h-4 w-4 mr-2" /> Force Global Poll
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-6 flex flex-col items-center justify-center text-center h-full space-y-2">
            <div className={`p-4 rounded-full ${status?.running ? 'bg-success/20 text-success tech-glow' : 'bg-destructive/20 text-destructive'}`}>
               <Activity className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold mt-2">Engine Status</h3>
            <p className={`font-mono text-xl ${status?.running ? 'text-success' : 'text-destructive'}`}>
              {isLoading ? '...' : status?.running ? 'ONLINE' : 'OFFLINE'}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider text-center">Polls / Sec</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-end pb-6 h-[120px]">
            <div className="text-5xl font-mono font-bold text-primary">
              {isLoading ? '-' : status?.pollsPerSecond}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider text-center">Success Rate</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-end pb-6 h-[120px]">
             <div className="text-5xl font-mono font-bold text-success flex items-baseline">
              {isLoading ? '-' : status?.successRate}<span className="text-2xl ml-1">%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground uppercase tracking-wider text-center">Queue Depth</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-end pb-6 h-[120px]">
             <div className={`text-5xl font-mono font-bold ${status && status.queueDepth > 1000 ? 'text-destructive' : 'text-foreground'}`}>
              {isLoading ? '-' : status?.queueDepth}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader>
          <CardTitle>Worker Details</CardTitle>
        </CardHeader>
        <CardContent>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
             <div className="flex flex-col space-y-1">
               <span className="text-muted-foreground text-sm flex items-center gap-2"><HardDrive className="h-4 w-4"/> Active Go Routines</span>
               <span className="text-2xl font-mono text-foreground">{isLoading ? '-' : status?.activeWorkers}</span>
             </div>
             <div className="flex flex-col space-y-1">
               <span className="text-muted-foreground text-sm flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/> Total Polled (Session)</span>
               <span className="text-2xl font-mono text-foreground">{isLoading ? '-' : status?.totalPolled.toLocaleString()}</span>
             </div>
             <div className="flex flex-col space-y-1">
               <span className="text-muted-foreground text-sm flex items-center gap-2"><Activity className="h-4 w-4"/> Avg Cycle Time</span>
               <span className="text-2xl font-mono text-foreground">{isLoading ? '-' : `${status?.lastCycleMs} ms`}</span>
             </div>
           </div>
        </CardContent>
      </Card>
    </div>
  );
}
