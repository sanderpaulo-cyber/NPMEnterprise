"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Aplica chaves do .env da raiz sobre process.env (substitui existentes).
 * O `process.loadEnvFile` do Node não sobrescreve variáveis já definidas; no Windows
 * um DATABASE_URL global fazia a API ligar a outra base que `auth:reset` / Drizzle.
 */
function applyRootEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  let raw;
  try {
    raw = fs.readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  raw = raw.replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

module.exports = { applyRootEnv };
