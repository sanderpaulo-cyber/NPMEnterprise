import { useGetNode, useGetNodeMetrics } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { ArrowLeft, Cpu, HardDrive, Clock, Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function NodeDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: node, isLoading: loadingNode } = useGetNode(id || "");
  const { data: cpuMetrics, isLoading: loadingCpu } = useGetNodeMetrics(id || "", { metric: "cpu", bucket: "5m" });
  const { data: memMetrics, isLoading: loadingMem } = useGetNodeMetrics(id || "", { metric: "memory", bucket: "5m" });

  if (loadingNode) {
    return <div className="p-8 flex justify-center"><div className="animate-spin h-8 w-8 border-b-2 border-primary rounded-full"></div></div>;
  }

  if (!node) {
    return <div className="p-8 text-center text-destructive">Node not found</div>;
  }

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
          </div>
        </div>
        <div className="flex gap-6 text-sm">
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

      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="bg-secondary/50 border border-border/50 mb-6">
          <TabsTrigger value="performance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Performance</TabsTrigger>
          <TabsTrigger value="interfaces" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Interfaces</TabsTrigger>
          <TabsTrigger value="details" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">System Details</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6">
          {/* CPU Chart */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <Cpu className="h-5 w-5 text-primary" /> CPU Utilization
              </CardTitle>
              <div className="text-2xl font-mono font-bold text-foreground">{node.cpuUsage?.toFixed(1) || 0}%</div>
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
              <div className="text-2xl font-mono font-bold text-foreground">{node.memUsage?.toFixed(1) || 0}%</div>
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
        </TabsContent>
        
        <TabsContent value="details">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle>System Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-8">
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">System Description</span>
                  <span className="text-sm mt-1">{node.sysDescription || 'N/A'}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Location</span>
                  <span className="text-sm mt-1">{node.location || 'N/A'}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Model</span>
                  <span className="text-sm mt-1">{node.model || 'N/A'}</span>
                </div>
                <div className="flex flex-col border-b border-border/50 pb-2">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Added On</span>
                  <span className="text-sm mt-1 font-mono">{node.createdAt ? format(new Date(node.createdAt), 'PPP') : 'N/A'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
