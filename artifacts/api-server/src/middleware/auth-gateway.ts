import type { NextFunction, Request, Response } from "express";
import { isAuthEnabled } from "../lib/auth/config";
import { readSessionCookie } from "../lib/auth/cookies";
import { verifyAuthToken } from "../lib/auth/jwt";

function isPublicAuthPath(originalUrl: string): boolean {
  const path = originalUrl.split("?")[0];
  return (
    path.includes("/healthz") ||
    path.includes("/readyz") ||
    path.includes("/auth/status") ||
    path.includes("/auth/login") ||
    path.includes("/auth/register") ||
    path.includes("/auth/logout") ||
    path.includes("/auth/providers")
  );
}

export function parseBearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  const t = h.slice(7).trim();
  return t || null;
}

/** Bearer (APIs / legado) ou cookie HttpOnly `ns_session` (dashboard). */
export function getRequestAuthToken(req: Request): string | null {
  return parseBearer(req) ?? readSessionCookie(req);
}

export async function authGateway(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!isAuthEnabled()) {
    next();
    return;
  }

  if (isPublicAuthPath(req.originalUrl)) {
    next();
    return;
  }

  const token = getRequestAuthToken(req);
  if (!token) {
    res.status(401).json({
      error: "Nao autenticado",
      code: "AUTH_REQUIRED",
    });
    return;
  }

  try {
    const a = await verifyAuthToken(token);
    req.auth = {
      userId: a.userId,
      username: a.username,
      authSource: a.authSource,
    };
    next();
  } catch {
    res.status(401).json({
      error: "Token invalido ou expirado",
      code: "AUTH_INVALID_TOKEN",
    });
  }
}
