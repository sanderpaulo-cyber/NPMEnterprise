import { useGetTopology } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, MarkerType } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo } from "react";
import { Server, Share2, Shield } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";

// Custom node component for xyflow
const CustomNode = ({ data }: any) => {
  const Icon = data.type === 'router' ? Share2 : data.type === 'firewall' ? Shield : Server;
  const statusColor = data.status === 'up' ? 'text-success border-success/30' : 
                      data.status === 'down' ? 'text-destructive border-destructive/30' : 
                      'text-warning border-warning/30';
                      
  const bgColor = data.status === 'up' ? 'bg-success/10' : 
                  data.status === 'down' ? 'bg-destructive/10' : 
                  'bg-warning/10';

  return (
    <div className={`px-4 py-2 shadow-lg rounded-xl border bg-card/90 backdrop-blur-sm min-w-[150px] ${statusColor}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-mono text-sm font-bold text-foreground">{data.name}</span>
          <span className="text-[10px] text-muted-foreground">{data.ipAddress}</span>
        </div>
      </div>
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

export default function Topology() {
  const { data: topologyData, isLoading } = useGetTopology();
  
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (topologyData) {
      // Very basic circular layout logic since we don't have a layout engine dep
      const radius = Math.min(window.innerWidth / 3, 400);
      const center = { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 };
      
      const newNodes = topologyData.nodes.map((node, i) => {
        const angle = (i / topologyData.nodes.length) * 2 * Math.PI;
        // Centralize a core switch/router if it exists, else arrange in circle
        const isCore = node.name.toLowerCase().includes('core');
        
        return {
          id: node.id,
          type: 'custom',
          position: isCore ? center : {
            x: center.x + radius * Math.cos(angle),
            y: center.y + radius * Math.sin(angle)
          },
          data: { ...node },
        };
      });

      const newEdges = topologyData.edges.map(edge => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        animated: edge.utilization ? edge.utilization > 50 : false,
        style: { stroke: 'hsl(var(--primary)/0.5)', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: 'hsl(var(--primary)/0.5)' },
      }));

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [topologyData, setNodes, setEdges]);

  if (isLoading) {
    return (
      <div className="w-full h-[80vh] flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-muted-foreground font-mono">Discovering network topology...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-mono">Topology Map</h1>
          <p className="text-muted-foreground text-sm">L2/L3 Physical and logical connections (LLDP/CDP)</p>
        </div>
        <div className="flex gap-4">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-success"></span><span className="text-xs">Online</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-warning"></span><span className="text-xs">Warning</span></div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-destructive"></span><span className="text-xs">Offline</span></div>
        </div>
      </div>

      <Card className="flex-1 glass-panel border-border/50 overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          className="bg-transparent"
        >
          <Background color="hsl(var(--muted-foreground)/0.2)" gap={24} size={2} />
          <Controls className="bg-card border-border fill-foreground" />
        </ReactFlow>
      </Card>
    </div>
  );
}
