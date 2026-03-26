import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface WSMessage {
  type: 'node_status' | 'alert' | 'metric_update';
  data: any;
}

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    // In a real environment, this would be wss://${window.location.host}/api/ws
    // We use a mock connection here that simulates occasional events for the UI
    const connect = () => {
      console.log("[WebSocket] Connecting...");
      setIsConnected(true);

      // Simulate incoming real-time events
      const interval = setInterval(() => {
        const events: WSMessage['type'][] = ['node_status', 'alert', 'metric_update'];
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        
        handleMessage({ type: randomEvent, data: { mock: true, timestamp: new Date().toISOString() } });
      }, 15000); // Fire a mock event every 15s

      return () => {
        clearInterval(interval);
        console.log("[WebSocket] Disconnected");
        setIsConnected(false);
      };
    };

    const handleMessage = (msg: WSMessage) => {
      switch (msg.type) {
        case 'node_status':
          // Invalidate nodes to trigger refetch
          queryClient.invalidateQueries({ queryKey: ['/api/nodes'] });
          queryClient.invalidateQueries({ queryKey: ['/api/nodes/stats/summary'] });
          break;
        case 'alert':
          queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
          toast({
            title: "New Alert Received",
            description: "A network anomaly has been detected.",
            variant: "destructive",
          });
          break;
        case 'metric_update':
          // Softly invalidate top-n so charts update
          queryClient.invalidateQueries({ queryKey: ['/api/metrics/top-n'] });
          break;
      }
    };

    const cleanup = connect();
    return cleanup;
  }, [queryClient, toast]);

  return { isConnected };
}
