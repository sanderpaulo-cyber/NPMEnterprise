import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { applyRootEnvOverride } from "./apply-root-env-override";
import { resolveMonorepoEnvPath } from "./resolve-monorepo-env-path";
import * as schema from "./schema";

const { Pool } = pg;

const envPath = resolveMonorepoEnvPath(import.meta.url);
if (envPath) {
  applyRootEnvOverride(envPath);
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function readEnvInt(name: string, fallback: number, min: number) {
  const raw = process.env[name];
  const parsed = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, parsed);
}

const poolMax = readEnvInt("PGPOOL_MAX", 20, 1);
const idleTimeoutMillis = readEnvInt("PGPOOL_IDLE_TIMEOUT_MS", 30_000, 1_000);
const connectionTimeoutMillis = readEnvInt("PGPOOL_CONNECT_TIMEOUT_MS", 10_000, 1_000);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  idleTimeoutMillis,
  connectionTimeoutMillis,
  allowExitOnIdle: process.env.PGPOOL_ALLOW_EXIT_ON_IDLE === "true",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
