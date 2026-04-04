/* eslint-disable no-console */
const { execFileSync, spawn } = require("child_process");
const { applyRootEnv } = require("./apply-root-env.cjs");

applyRootEnv();

const API_PORT = Number(process.env.API_PORT || 8080);
const WEB_PORT = Number(process.env.WEB_PORT || 443);
const isWindows = process.platform === "win32";
const childProcesses = [];

function canExec(file, argv) {
  try {
    execFileSync(file, argv, { stdio: "ignore", windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

/** No Windows, corepack e invocado como corepack.cmd via cmd; execFileSync("corepack") falha. */
function canRunCorepackPnpm() {
  if (isWindows) {
    try {
      execFileSync("cmd.exe", ["/d", "/s", "/c", "corepack pnpm --version"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }
  return canExec("corepack", ["pnpm", "--version"]);
}

function canRunPnpmCli() {
  if (isWindows) {
    try {
      execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm --version"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }
  return canExec("pnpm", ["--version"]);
}

/**
 * Muitos PCs Windows nao tem `pnpm` no PATH; Node traz `corepack pnpm`.
 * Ordem: corepack pnpm -> pnpm -> npx --yes pnpm
 */
function getPnpmSpawnConfig(pnpmArgs) {
  const tail = pnpmArgs.join(" ");
  if (canRunCorepackPnpm()) {
    if (isWindows) {
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", `corepack pnpm ${tail}`],
      };
    }
    return { command: "corepack", args: ["pnpm", ...pnpmArgs] };
  }
  if (canRunPnpmCli()) {
    if (isWindows) {
      return { command: "cmd.exe", args: ["/d", "/s", "/c", `pnpm ${tail}`] };
    }
    return { command: "pnpm", args: pnpmArgs };
  }
  console.warn(
    "[dev] Nem corepack nem pnpm encontrados no PATH; a usar npx pnpm (mais lento na primeira vez).\n" +
      "  Sugestao:  corepack enable   e reinicie o terminal, ou instale pnpm globalmente.\n",
  );
  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `npx --yes pnpm ${tail}`],
    };
  }
  return { command: "npx", args: ["--yes", "pnpm", ...pnpmArgs] };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePowerShellJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  return [parsed];
}

function getListeningPids(port) {
  if (!isWindows) {
    return [];
  }

  try {
    const stdout = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ConvertTo-Json -Compress`,
      ],
      { encoding: "utf8" },
    );
    return parsePowerShellJson(stdout)
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value));
  } catch {
    return [];
  }
}

function stopPid(pid, port) {
  if (!isWindows || !Number.isFinite(pid)) return;
  if (pid === process.pid || pid === process.ppid) return;

  console.log(`[dev] liberando porta ${port} (PID ${pid})`);
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Stop-Process -Id ${pid} -Force`],
    { stdio: "ignore" },
  );
}

async function freePorts() {
  const ports = [API_PORT, WEB_PORT];
  for (const port of ports) {
    const pids = getListeningPids(port);
    for (const pid of pids) {
      stopPid(pid, port);
    }
  }
  await sleep(500);
}

function processNameWindows(pid) {
  try {
    const n = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Name`,
      ],
      { encoding: "utf8" },
    ).trim();
    return n || "?";
  } catch {
    return "?";
  }
}

function formatPortLine(port) {
  const pids = getListeningPids(port);
  if (pids.length === 0) {
    return `${port}: livre`;
  }
  return pids
    .map((pid) => `${port}: em uso — PID ${pid} (${processNameWindows(pid)})`)
    .join("; ");
}

function logPortStatus(title) {
  if (!isWindows) {
    console.log(`[dev] ${title} (API ${API_PORT}, WEB ${WEB_PORT}) — use netstat/lsof se necessario`);
    return;
  }
  console.log(`[dev] ${title}`);
  console.log(`[dev]   ${formatPortLine(API_PORT)}`);
  console.log(`[dev]   ${formatPortLine(WEB_PORT)}`);
}

function startProcess(name, pnpmArgs) {
  console.log(`[dev] iniciando ${name}...`);
  const { command, args } = getPnpmSpawnConfig(pnpmArgs);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  childProcesses.push(child);
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `codigo ${code ?? 0}`;
    console.log(`[dev] ${name} finalizado (${reason})`);
    if (name === "API" && code && code !== 0) {
      console.error(
        "\n[dev] A API saiu com erro — o dashboard tambem sera encerrado.\n" +
          "  Causa mais comum: PostgreSQL inacessivel (DATABASE_URL no .env).\n" +
          "  Suba o Postgres:  npm run docker:postgres   (ou pnpm docker:postgres)\n" +
          "  Schema:           npm run db:push\n" +
          "  So o front:       npm run dev:web\n",
      );
    }
    shutdown(code ?? 0);
  });
}

let shuttingDown = false;
function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of childProcesses) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore shutdown errors
      }
    }
  }

  setTimeout(() => process.exit(exitCode), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function main() {
  if (isWindows && WEB_PORT < 1024) {
    console.warn(
      "[dev] Porta privilegiada (<1024). No Windows, execute o terminal como Administrador ou use WEB_PORT>=1024.\n",
    );
  }
  logPortStatus("Estado das portas (antes de libertar)");
  await freePorts();
  logPortStatus("Estado das portas (depois de libertar)");
  startProcess("API", ["--filter", "@workspace/api-server", "run", "dev"]);
  startProcess("Dashboard", ["--filter", "@workspace/npm-dashboard", "run", "dev"]);
}

main().catch((error) => {
  console.error("[dev] falha ao iniciar ambiente:", error);
  process.exit(1);
});
