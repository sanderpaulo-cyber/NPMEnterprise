import { useListFlows, useGetTopTalkers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Wifi, ArrowRightLeft } from "lucide-react";
import { format } from "date-fns";

export default function Flows() {
  const { data: flows, isLoading: loadingFlows } = useListFlows({ limit: 50 });
  const { data: talkers, isLoading: loadingTalkers } = useGetTopTalkers({ n: 10 });

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight font-mono flex items-center gap-3">
          <Wifi className="h-8 w-8 text-primary" /> Traffic Flows (NetFlow/IPFIX)
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Real-time bandwidth utilization and conversation tracking</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-mono">Top Sources (Tx)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loadingTalkers ? (
              <div className="w-full h-full bg-muted/20 animate-pulse rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={talkers?.talkers?.filter(t => t.direction === 'source') || []} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatBytes} />
                  <YAxis dataKey="ip" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(val: number) => formatBytes(val)}
                  />
                  <Bar dataKey="totalBytes" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader>
            <CardTitle className="text-lg font-mono">Top Destinations (Rx)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
             {loadingTalkers ? (
              <div className="w-full h-full bg-muted/20 animate-pulse rounded-lg" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={talkers?.talkers?.filter(t => t.direction === 'destination') || []} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={formatBytes} />
                  <YAxis dataKey="ip" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={120} />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(val: number) => formatBytes(val)}
                  />
                  <Bar dataKey="totalBytes" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader className="border-b border-border/50 bg-secondary/10">
          <CardTitle className="text-lg font-mono flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" /> Raw Flow Records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow className="border-border/50">
                <TableHead className="font-mono text-xs uppercase tracking-wider">Time</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Source IP</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Dest IP</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider">Protocol</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Bytes</TableHead>
                <TableHead className="font-mono text-xs uppercase tracking-wider text-right">Packets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingFlows ? (
                 Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i} className="border-border/50">
                    <TableCell><div className="h-4 w-24 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-32 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded" /></TableCell>
                    <TableCell><div className="h-4 w-16 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                    <TableCell><div className="h-4 w-12 bg-muted animate-pulse rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : flows?.flows?.map((flow) => (
                <TableRow key={flow.id} className="border-border/50 font-mono text-sm hover:bg-secondary/30 transition-colors">
                  <TableCell className="text-muted-foreground">{format(new Date(flow.timestamp), 'HH:mm:ss')}</TableCell>
                  <TableCell className="text-primary">{flow.srcIp}:{flow.srcPort || '*'}</TableCell>
                  <TableCell className="text-warning">{flow.dstIp}:{flow.dstPort || '*'}</TableCell>
                  <TableCell className="text-muted-foreground">{flow.protocol === 6 ? 'TCP' : flow.protocol === 17 ? 'UDP' : flow.protocol}</TableCell>
                  <TableCell className="text-right text-foreground">{formatBytes(flow.bytes)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{flow.packets}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
