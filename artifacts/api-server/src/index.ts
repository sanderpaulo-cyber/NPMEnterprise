import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocket, broadcast } from "./lib/websocket";
import { startPoller, setWsBroadcast } from "./lib/poller";
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

server.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "NPM Server listening");

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
});
