import { useListNodes } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, Plus, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function Nodes() {
  const [searchTerm, setSearchTerm] = useState("");
  const { data, isLoading } = useListNodes({ limit: 100 });

  const filteredNodes = data?.nodes.filter(n => 
    n.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    n.ipAddress.includes(searchTerm)
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono">Network Inventory</h1>
          <p className="text-muted-foreground text-sm">Manage and monitor {data?.total || 0} discovered devices</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-mono">
          <Plus className="h-4 w-4 mr-2" /> Add Node
        </Button>
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
          <Button variant="outline" className="w-full sm:w-auto border-border bg-background/50 hover:bg-secondary">
            <Filter className="h-4 w-4 mr-2 text-muted-foreground" /> Filters
          </Button>
        </div>

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
                        <span className={node.cpuUsage && node.cpuUsage > 80 ? 'text-destructive' : ''}>
                          {node.cpuUsage?.toFixed(1) || 0}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                         <span className={node.memUsage && node.memUsage > 80 ? 'text-destructive' : ''}>
                          {node.memUsage?.toFixed(1) || 0}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/nodes/${node.id}`}>
                          <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity h-8 border-border">
                            Details <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
