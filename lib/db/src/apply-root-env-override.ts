import fs from "node:fs";

/**
 * Aplica um ficheiro .env sobre process.env, substituindo chaves existentes.
 * Necessário porque `process.loadEnvFile` do Node não sobrescreve variáveis já definidas
 * (ex.: DATABASE_URL no ambiente do sistema no Windows).
 */
export function applyRootEnvOverride(envFilePath: string): void {
  let raw: string;
  try {
    raw = fs.readFileSync(envFilePath, "utf8");
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
