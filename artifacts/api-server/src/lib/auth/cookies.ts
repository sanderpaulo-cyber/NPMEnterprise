import type { CookieOptions, Request, Response } from "express";
import { getTokenExpiryHours } from "./config";

export const AUTH_SESSION_COOKIE = "ns_session";

export function sessionCookieOptions(req: Request): CookieOptions {
  const hours = getTokenExpiryHours();
  const maxAgeMs = hours * 3600 * 1000;
  const secure = shouldCookieBeSecure(req);
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeMs,
  };
}

function shouldCookieBeSecure(req: Request): boolean {
  if (process.env.AUTH_COOKIE_SECURE === "false") return false;
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (req.secure) return true;
  const xf = req.get("x-forwarded-proto");
  return xf === "https";
}

export function attachSessionCookie(
  res: Response,
  req: Request,
  token: string,
): void {
  res.cookie(AUTH_SESSION_COOKIE, token, sessionCookieOptions(req));
}

export function clearSessionCookie(res: Response, req: Request): void {
  res.clearCookie(AUTH_SESSION_COOKIE, {
    httpOnly: true,
    secure: shouldCookieBeSecure(req),
    sameSite: "lax",
    path: "/",
  });
}

export function readSessionCookie(req: Request): string | null {
  const raw = req.cookies?.[AUTH_SESSION_COOKIE];
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t || null;
}
