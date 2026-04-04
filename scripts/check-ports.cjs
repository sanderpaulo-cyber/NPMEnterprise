/* eslint-disable no-console */
/**
 * Mostra se API_PORT e WEB_PORT (do .env ou padrao) estao em escuta no Windows.
 * Uso: pnpm ports:check
 */
const { execFileSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // sem .env
}

const API_PORT = Number(process.env.API_PORT || 8080);
const WEB_PORT = Number(process.env.WEB_PORT || 443);
const isWindows = process.platform === "win32";

function parsePowerShellJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function getListeningPids(port) {
  if (!isWindows) {
    console.log("Este script detalha portas no Windows. Em Linux/macOS use: lsof -i :" + port);
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

function processName(pid) {
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

function lineForPort(port) {
  const pids = getListeningPids(port);
  if (pids.length === 0) {
    return `  ${port}  ->  LIVRE (nenhum Listen)`;
  }
  return pids
    .map((pid) => `  ${port}  ->  EM USO  PID ${pid} (${processName(pid)})`)
    .join("\n");
}

console.log("\nVerificacao de portas (WEB_PORT / API_PORT):\n");
console.log(`WEB_PORT=${WEB_PORT}`);
console.log(lineForPort(WEB_PORT));
console.log("");
console.log(`API_PORT=${API_PORT}`);
console.log(lineForPort(API_PORT));

if (isWindows && WEB_PORT < 1024) {
  console.log(
    "\nNota: WEB_PORT < 1024 no Windows exige normalmente terminal como Administrador para o Vite conseguir escutar.\n",
  );
}

console.log("");
