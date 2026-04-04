import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function takeSlot(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  if (b.count >= max) return false;
  b.count += 1;
  return true;
}

/** Limita pedidos por IP (memória; reinicia com o processo). */
export function createRateLimiter(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = clientKey(req);
    if (takeSlot(`${req.path}:${key}`, max, windowMs)) {
      next();
      return;
    }
    res.status(429).json({
      error: "Demasiadas tentativas. Aguarde e tente novamente.",
      code: "AUTH_RATE_LIMIT",
    });
  };
}
