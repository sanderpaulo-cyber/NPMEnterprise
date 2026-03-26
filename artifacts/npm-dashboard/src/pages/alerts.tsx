import { useListAlerts, useAcknowledgeAlert } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function Alerts() {
  const { data: alerts, isLoading } = useListAlerts({ limit: 100 });
  const ackMutation = useAcknowledgeAlert();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleAck = (id: string) => {
    ackMutation.mutate({ alertId: id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
        toast({ title: "Alert Acknowledged", description: "The alert has been marked as handled." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to acknowledge alert.", variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-destructive" /> Alert Center
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Network anomalies, threshold breaches, and down events</p>
        </div>
      </div>

      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
             <div className="p-8 space-y-4">
               {[1,2,3,4].map(i => <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-lg" />)}
             </div>
          ) : alerts?.alerts?.length === 0 ? (
             <div className="p-16 text-center flex flex-col items-center">
               <CheckCircle2 className="h-16 w-16 text-success opacity-50 mb-4" />
               <h3 className="text-xl font-medium text-foreground">All Clear</h3>
               <p className="text-muted-foreground mt-2">No active alerts requiring attention.</p>
             </div>
          ) : (
            <div className="divide-y divide-border/50">
              {alerts?.alerts?.map((alert) => (
                <div key={alert.id} className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${alert.acknowledged ? 'bg-background/20 opacity-60' : 'hover:bg-secondary/30 bg-card/40'}`}>
                  <div className="flex-1 flex gap-4">
                    <div className="mt-1">
                       <StatusBadge status={alert.severity} className="px-3 py-1 text-xs" />
                    </div>
                    <div>
                      <h4 className="text-base font-semibold text-foreground">{alert.nodeName} <span className="text-muted-foreground font-normal text-sm">({alert.type})</span></h4>
                      <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground font-mono">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {format(new Date(alert.createdAt), 'MMM d, HH:mm:ss')}</span>
                        {alert.acknowledged && alert.acknowledgedAt && (
                           <span className="text-success flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Ack'd at {format(new Date(alert.acknowledgedAt), 'HH:mm')}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!alert.acknowledged && (
                    <Button 
                      variant="outline" 
                      onClick={() => handleAck(alert.id)}
                      disabled={ackMutation.isPending}
                      className="shrink-0 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      Acknowledge
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
