import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initWebSocket, broadcast } from "./lib/websocket";
import { startPoller, setWsBroadcast } from "./lib/poller";
import { seedDatabase } from "./lib/seed";

const rawPort = process.env["PORT"];

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

server.listen(port, async (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "NPM Server listening");

  try {
    await seedDatabase();
  } catch (seedErr) {
    logger.error({ err: seedErr }, "Seeding failed (non-fatal)");
  }

  startPoller();
});
