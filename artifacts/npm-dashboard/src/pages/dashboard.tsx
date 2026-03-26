import { 
  useGetNodesSummary, 
  useGetTopNMetrics, 
  useListAlerts 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Server, Activity, AlertTriangle, ArrowUpRight, Cpu } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetNodesSummary();
  const { data: topCpu, isLoading: loadingCpu } = useGetTopNMetrics({ metric: "cpu", n: 5 });
  const { data: alerts, isLoading: loadingAlerts } = useListAlerts({ limit: 5, acknowledged: false });

  const kpis = [
    { 
      title: "Total Monitored Nodes", 
      value: summary?.total || 0, 
      icon: Server,
      color: "text-primary",
      bg: "bg-primary/10"
    },
    { 
      title: "Nodes Up", 
      value: summary?.up || 0, 
      icon: Activity,
      color: "text-success",
      bg: "bg-success/10"
    },
    { 
      title: "Critical Alerts", 
      value: summary?.criticalAlerts || 0, 
      icon: AlertTriangle,
      color: "text-destructive",
      bg: "bg-destructive/10"
    },
    { 
      title: "Avg Global CPU", 
      value: `${summary?.avgCpu?.toFixed(1) || 0}%`, 
      icon: Cpu,
      color: "text-warning",
      bg: "bg-warning/10"
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight font-mono text-foreground">Global Overview</h1>
        <p className="text-muted-foreground text-sm">Real-time network performance and health metrics.</p>
      </div>

      {/* KPI Grid */}
      <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      >
        {kpis.map((kpi, i) => (
          <motion.div key={i} variants={item}>
            <Card className="glass-panel overflow-hidden relative group border-border/50 hover:border-border transition-all duration-300">
              <div className={`absolute right-0 top-0 w-24 h-24 rounded-bl-full opacity-20 transition-transform duration-500 group-hover:scale-110 ${kpi.bg}`} />
              <CardContent className="p-6 relative z-10">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">{kpi.title}</p>
                    {loadingSummary ? (
                      <div className="h-8 w-16 bg-muted animate-pulse rounded" />
                    ) : (
                      <p className="text-3xl font-bold tracking-tight text-foreground font-mono">{kpi.value}</p>
                    )}
                  </div>
                  <div className={`p-3 rounded-xl ${kpi.bg}`}>
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top N CPU */}
        <motion.div variants={item} initial="hidden" animate="show" className="lg:col-span-2">
          <Card className="glass-panel h-full flex flex-col border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle className="text-lg font-mono">Top Node CPU Utilization</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Nodes with highest processing load</p>
              </div>
              <Link href="/nodes" className="text-xs text-primary flex items-center hover:underline">
                View All <ArrowUpRight className="h-3 w-3 ml-1" />
              </Link>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              {loadingCpu ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCpu?.items || []} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <XAxis type="number" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis dataKey="nodeName" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} width={100} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--foreground))' }}
                      itemStyle={{ color: 'hsl(var(--primary))' }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                      {
                        (topCpu?.items || []).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.value > 80 ? 'hsl(var(--destructive))' : entry.value > 60 ? 'hsl(var(--warning))' : 'hsl(var(--primary))'} />
                        ))
                      }
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Alerts */}
        <motion.div variants={item} initial="hidden" animate="show">
          <Card className="glass-panel h-full border-border/50">
            <CardHeader className="pb-4 border-b border-border/50">
              <CardTitle className="text-lg font-mono flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" /> 
                Recent Alerts
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingAlerts ? (
                <div className="p-6 space-y-4">
                  {[1,2,3].map(i => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
                </div>
              ) : alerts?.alerts && alerts.alerts.length > 0 ? (
                <div className="divide-y divide-border/50">
                  {alerts.alerts.map((alert) => (
                    <div key={alert.id} className="p-4 hover:bg-secondary/30 transition-colors">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-sm text-foreground">{alert.nodeName}</span>
                        <StatusBadge status={alert.severity} />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                      <div className="mt-2 text-[10px] text-muted-foreground font-mono">
                        {new Date(alert.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
                  <Activity className="h-12 w-12 opacity-20 mb-3" />
                  <p>No active alerts. System healthy.</p>
                </div>
              )}
              <div className="p-3 border-t border-border/50 bg-secondary/20 text-center">
                <Link href="/alerts" className="text-xs font-medium text-primary hover:underline">
                  View Alert Center
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
