import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Procura `.env` subindo desde o ficheiro em execução e desde `process.cwd()`
 * (bundle em `artifacts/api-server/dist`, fonte em `lib/db/src`, ou cwd na raiz / em `artifacts/api-server`).
 */
export function resolveMonorepoEnvPath(importMetaUrl: string): string | null {
  const entryDir = path.dirname(fileURLToPath(importMetaUrl));

  function candidatesFromBase(base: string): string[] {
    const out: string[] = [];
    let dir = base;
    for (let i = 0; i < 6; i += 1) {
      out.push(path.join(dir, ".env"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return out;
  }

  const seen = new Set<string>();
  for (const p of [
    ...candidatesFromBase(entryDir),
    ...candidatesFromBase(path.resolve(process.cwd())),
  ]) {
    const norm = path.normalize(p);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
