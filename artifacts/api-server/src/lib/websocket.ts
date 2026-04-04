import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger";
import { isAuthEnabled } from "./auth/config";
import { AUTH_SESSION_COOKIE } from "./auth/cookies";
import { verifyAuthToken } from "./auth/jwt";

function readTokenFromWsUpgrade(urlToken: string | null, cookieHeader: string | undefined): string | null {
  if (urlToken?.trim()) return urlToken.trim();
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    if (name !== AUTH_SESSION_COOKIE) continue;
    const value = part.slice(idx + 1).trim();
    try {
      const decoded = decodeURIComponent(value);
      return decoded || null;
    } catch {
      return value || null;
    }
  }
  return null;
}

let wss: WebSocketServer | null = null;
const clients = new Set<WebSocket>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({
    server,
    path: "/api/ws",
    verifyClient: (info, cb) => {
      if (!isAuthEnabled()) {
        cb(true);
        return;
      }
      void (async () => {
        try {
          const rawUrl = info.req.url ?? "";
          const host = info.req.headers.host ?? "localhost";
          const u = new URL(rawUrl, `http://${host}`);
          const token = readTokenFromWsUpgrade(
            u.searchParams.get("token"),
            info.req.headers.cookie,
          );
          if (!token) {
            cb(false, 401, "Unauthorized");
            return;
          }
          await verifyAuthToken(token);
          cb(true);
        } catch {
          cb(false, 401, "Unauthorized");
        }
      })();
    },
  });

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
