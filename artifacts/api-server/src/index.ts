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

bootstrap().catch((err) => {
  logger.error({ err }, "API bootstrap failed");
  process.exit(1);
});
