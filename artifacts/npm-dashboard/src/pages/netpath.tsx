import {
  getGetNetPathQueryKey,
  useGetNetPath,
  useListNodes,
} from "@workspace/api-client-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Activity, Route as RouteIcon, Search } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";

export default function NetPath() {
  const [sourceId, setSourceId] = useState<string>("");
  const [targetIp, setTargetIp] = useState<string>("8.8.8.8");
  const [isTraced, setIsTraced] = useState(false);

  const { data: nodes } = useListNodes({ limit: 50, type: "router" });
  
  // Only fetch if triggered
  const { data: pathData, isLoading, refetch } = useGetNetPath(
    sourceId || "_",
    { target: targetIp },
    {
      query: {
        enabled: isTraced && Boolean(sourceId),
        queryKey: getGetNetPathQueryKey(sourceId || "_", { target: targetIp }),
      },
    },
  );

  const handleTrace = () => {
    if (sourceId && targetIp) {
      setIsTraced(true);
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
          <RouteIcon className="h-8 w-8 text-primary" /> NetPath Analysis
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Hop-by-hop latency and packet loss visualization</p>
      </div>

      <Card className="glass-panel border-border/50">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="space-y-2 w-full md:w-1/3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Source Node (Probe)</label>
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger className="bg-secondary/30 border-border h-11">
                  <SelectValue placeholder="Select a router..." />
                </SelectTrigger>
                <SelectContent>
                  {nodes?.nodes.map(n => (
                    <SelectItem key={n.id} value={n.id}>{n.name} ({n.ipAddress})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2 w-full md:w-1/3">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target IP/Domain</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  value={targetIp} 
                  onChange={(e) => setTargetIp(e.target.value)}
                  className="pl-9 bg-secondary/30 border-border h-11 font-mono"
                  placeholder="e.g. 8.8.8.8"
                />
              </div>
            </div>

            <Button 
              onClick={handleTrace} 
              disabled={!sourceId || !targetIp || isLoading}
              className="h-11 px-8 bg-primary hover:bg-primary/90 font-bold"
            >
              {isLoading ? 'Tracing...' : 'Start Trace'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isTraced && (
        <Card className="glass-panel border-border/50">
          <CardHeader className="border-b border-border/50 bg-secondary/10 pb-4">
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="font-mono">Path Latency Profile</span>
              {pathData && (
                <span className="text-sm font-normal text-muted-foreground">
                  Total Latency: <strong className="text-foreground font-mono">{pathData.totalLatency}ms</strong>
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 h-[400px]">
            {isLoading ? (
               <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
                 <Activity className="h-8 w-8 animate-pulse text-primary" />
                 <p className="font-mono text-sm animate-pulse">Computing synthetic path...</p>
               </div>
            ) : pathData?.hops ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pathData.hops} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis 
                    dataKey="hop" 
                    stroke="hsl(var(--muted-foreground))" 
                    tickFormatter={(v) => `Hop ${v}`}
                    tickLine={false}
                    axisLine={false}
                    dy={10}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))" 
                    tickFormatter={(v) => `${v}ms`}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.2)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    labelFormatter={(label) => `Hop ${label}`}
                    formatter={(value: number, name: string, props: any) => {
                      if (name === "avgLatency") return [`${value}ms`, "Avg Latency"];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="avgLatency" name="avgLatency" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {pathData.hops.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.packetLoss > 0 ? 'hsl(var(--destructive))' : entry.avgLatency > 100 ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Trace failed or no data available.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
