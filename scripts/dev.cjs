/* eslint-disable no-console */
const { execFileSync, spawn } = require("child_process");

const API_PORT = Number(process.env.API_PORT || 8080);
const WEB_PORT = Number(process.env.WEB_PORT || 20112);
const isWindows = process.platform === "win32";
const corepackBin = "corepack";
const childProcesses = [];

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

function startProcess(name, args) {
  console.log(`[dev] iniciando ${name}...`);
  const child = isWindows
    ? spawn(
        "cmd.exe",
        ["/d", "/s", "/c", `${corepackBin} ${args.join(" ")}`],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: "inherit",
        },
      )
    : spawn(corepackBin, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      });

  childProcesses.push(child);
  child.on("exit", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `codigo ${code ?? 0}`;
    console.log(`[dev] ${name} finalizado (${reason})`);
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
  await freePorts();
  startProcess("API", ["pnpm", "--filter", "@workspace/api-server", "run", "dev"]);
  startProcess("Dashboard", ["pnpm", "--filter", "@workspace/npm-dashboard", "run", "dev"]);
}

main().catch((error) => {
  console.error("[dev] falha ao iniciar ambiente:", error);
  process.exit(1);
});
