import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app";
import { pool } from "@workspace/db";
import { logger } from "./lib/logger";
import { initializeDiscoveryEngine } from "./lib/discovery-engine";
import { initWebSocket, broadcast } from "./lib/websocket";
import { startPoller, stopPoller, setWsBroadcast } from "./lib/poller";
import { seedDatabase } from "./lib/seed";
import { isAuthEnabled, getJwtSecret } from "./lib/auth/config";
import { ensureBootstrapAdmin } from "./lib/auth/bootstrap";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(path.resolve(currentDir, "../../..", ".env"));
} catch {
  // Optional local env file.
}

const rawPort = process.env["API_PORT"] ?? process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);

initWebSocket(server);

setWsBroadcast(broadcast);

function shouldSeedDemoData() {
  return process.env.ENABLE_DEMO_SEED === "true";
}

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down API server");

  stopPoller();

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  await pool.end().catch((err) => {
    logger.error({ err }, "Failed to close database pool cleanly");
  });

  process.exit(0);
}

server.on("error", (err) => {
  logger.error({ err, port }, "HTTP server failed");
  process.exit(1);
});

async function bootstrap() {
  await pool.query("select 1");
  const dbInfo = await pool.query<{ name: string; user: string }>(
    "select current_database() as name, current_user as user",
  );
  logger.info(
    {
      database: dbInfo.rows[0]?.name,
      dbUser: dbInfo.rows[0]?.user,
    },
    "PostgreSQL ligado",
  );

  if (isAuthEnabled()) {
    getJwtSecret();
    try {
      await ensureBootstrapAdmin();
    } catch (bootErr) {
      logger.error(
        { err: bootErr },
        "ensureBootstrapAdmin falhou — confirme que correu db:push (tabela auth_users)",
      );
      throw bootErr;
    }
  }

  await initializeDiscoveryEngine();

  if (shouldSeedDemoData()) {
    try {
      await seedDatabase();
    } catch (seedErr) {
      logger.error({ err: seedErr }, "Seeding failed (non-fatal)");
    }
  } else {
    logger.info("Demo seed disabled");
  }

  startPoller();

  server.listen(port, () => {
    logger.info({ port }, "NPM Server listening");
  });
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

function bootstrapFailureHint(err: unknown): string | undefined {
  const e = err as NodeJS.ErrnoException & { code?: string };
  if (e?.code === "ECONNREFUSED") {
    return (
      "PostgreSQL inacessivel (ligacao recusada). Suba o servico e confirme DATABASE_URL no .env " +
      "(ex.: pnpm docker:postgres na raiz do repositorio)."
    );
  }
  const msg = e instanceof Error ? e.message : String(err);
  if (msg.includes("password authentication failed")) {
    return "PostgreSQL rejeitou as credenciais — corrija DATABASE_URL no .env.";
  }
  if (msg.includes("does not exist") && msg.toLowerCase().includes("database")) {
    return "A base de dados indicada nao existe — crie-a ou ajuste DATABASE_URL; depois execute pnpm db:push.";
  }
  return undefined;
}

bootstrap().catch((err) => {
  logger.error({ err }, "API bootstrap failed");
  const hint = bootstrapFailureHint(err);
  if (hint) {
    // eslint-disable-next-line no-console
    console.error(`\n[api-server] ${hint}\n`);
  }
  process.exit(1);
});
