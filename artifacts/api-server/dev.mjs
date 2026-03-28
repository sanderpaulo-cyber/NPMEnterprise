import path from "node:path";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { context as createEsbuildContext } from "esbuild";
import { artifactDir, createBuildOptions } from "./build-config.mjs";

const distEntry = path.resolve(artifactDir, "dist/index.mjs");
let serverProcess = null;
let shuttingDown = false;

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    const current = serverProcess;
    serverProcess = null;

    current.once("exit", () => resolve());
    current.kill("SIGTERM");
  });
}

function startServer() {
  serverProcess = spawn(process.execPath, ["--enable-source-maps", distEntry], {
    cwd: artifactDir,
    stdio: "inherit",
    env: process.env,
  });

  serverProcess.once("exit", (code, signal) => {
    if (!shuttingDown && code !== 0 && signal == null) {
      console.error(`[api-server] process exited with code ${code}`);
    }
  });
}

async function restartServer() {
  await stopServer();
  if (!shuttingDown) {
    startServer();
  }
}

async function main() {
  await rm(path.resolve(artifactDir, "dist"), { recursive: true, force: true });

  const restartPlugin = {
    name: "restart-server-on-build",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length > 0) return;
        await restartServer();
      });
    },
  };

  const ctx = await createEsbuildContext(
    createBuildOptions({
      plugins: [...createBuildOptions().plugins, restartPlugin],
    }),
  );

  const shutdown = async () => {
    shuttingDown = true;
    await ctx.dispose();
    await stopServer();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await ctx.watch();
  console.log("[api-server] watch mode enabled");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
