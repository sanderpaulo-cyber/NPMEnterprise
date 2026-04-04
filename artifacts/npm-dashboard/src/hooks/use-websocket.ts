import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type UseWebSocketOptions = {
  /** Se true e sem token na URL, exige sessão antes de ligar */
  authRequired?: boolean;
  /** Token na query (?token=) para ambientes sem cookie na ligacao WS */
  token?: string | null;
  /** Sessão HttpOnly: o browser envia o cookie no upgrade WS (recomendado no dashboard) */
  preferCookieAuth?: boolean;
};


type WsPayload = {
  type: string;
  [key: string]: unknown;
};

export function useWebSocket(options?: UseWebSocketOptions) {
  const authRequired = options?.authRequired ?? false;
  const sessionToken = options?.token ?? null;
  const preferCookieAuth = options?.preferCookieAuth ?? false;
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleMessage = useCallback(
    (msg: WsPayload) => {
      switch (msg.type) {
        case "connected":
          break;
        case "node_status":
          queryClient.invalidateQueries({ queryKey: ["/api/nodes"] });
          queryClient.invalidateQueries({
            queryKey: ["/api/nodes/stats/summary"],
          });
          break;
        case "alert":
          queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
          toast({
            title: "Novo alerta",
            description:
              typeof msg.message === "string"
                ? msg.message
                : "Foi detetada uma anomalia na rede.",
            variant: "destructive",
          });
          break;
        case "metric":
        case "metric_update":
          queryClient.invalidateQueries({ queryKey: ["/api/metrics/top-n"] });
          break;
        default:
          break;
      }
    },
    [queryClient, toast],
  );

  useEffect(() => {
    let stopped = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (stopped) return;
      if (authRequired && !preferCookieAuth && !sessionToken) {
        setIsConnected(false);
        return;
      }
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const qs =
        !preferCookieAuth && sessionToken
          ? `?token=${encodeURIComponent(sessionToken)}`
          : "";
      const url = `${proto}//${window.location.host}/api/ws${qs}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setIsConnected(true);

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        if (!stopped) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as WsPayload;
          handleMessage(msg);
        } catch {
          /* ignore */
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
      setIsConnected(false);
    };
  }, [handleMessage, authRequired, sessionToken, preferCookieAuth]);

  return { isConnected };
}
