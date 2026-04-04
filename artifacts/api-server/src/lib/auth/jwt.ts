import { randomUUID } from "node:crypto";
import * as jose from "jose";
import {
  getJwtAudience,
  getJwtIssuer,
  getJwtSecret,
  getTokenExpiryHours,
} from "./config";

export type AuthJwtPayload = {
  userId: string;
  username: string;
  authSource: string;
};

export async function signAuthToken(payload: AuthJwtPayload): Promise<string> {
  const secret = new TextEncoder().encode(getJwtSecret());
  const hours = getTokenExpiryHours();
  const jti = randomUUID();
  return new jose.SignJWT({
    username: payload.username,
    authSource: payload.authSource,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuer(getJwtIssuer())
    .setAudience(getJwtAudience())
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret);
}

export async function verifyAuthToken(token: string): Promise<AuthJwtPayload> {
  const secret = new TextEncoder().encode(getJwtSecret());
  const issuer = getJwtIssuer();
  const audience = getJwtAudience();
  const { payload } = await jose.jwtVerify(token, secret, {
    issuer,
    audience,
    algorithms: ["HS256"],
  });
  const sub = payload.sub;
  if (!sub) {
    throw new Error("Token sem subject");
  }
  return {
    userId: sub,
    username: String(payload.username ?? ""),
    authSource: String(payload.authSource ?? "local"),
  };
}
