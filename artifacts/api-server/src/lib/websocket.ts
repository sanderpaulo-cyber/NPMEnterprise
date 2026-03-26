import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger";

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/api/ws" });

  wss.on("connection", (ws) => {
    clients.add(ws);
    logger.info({ clientCount: clients.size }, "WebSocket client connected");

    ws.send(JSON.stringify({ type: "connected", message: "NPM WebSocket connected", timestamp: new Date().toISOString() }));

    ws.on("close", () => {
      clients.delete(ws);
      logger.info({ clientCount: clients.size }, "WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket error");
      clients.delete(ws);
    });
  });

  logger.info("WebSocket server initialized at /api/ws");
}

export function broadcast(message: object) {
  const payload = JSON.stringify(message);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
