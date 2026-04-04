import { Router, type IRouter, type Request, type Response } from "express";
import { appSettingsTable, db } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getPublicServerConfig } from "../lib/public-server-config";

const router: IRouter = Router();

const MAX_KEYS = 80;
const MAX_KEY_LENGTH = 128;

function isValidKey(key: string): boolean {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  return /^[a-zA-Z0-9_.-]+$/.test(key);
}

function isMissingAppSettingsRelation(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("42P01") ||
    (msg.includes("does not exist") && msg.includes("app_settings")) ||
    (msg.includes("relation") && msg.includes("app_settings"))
  );
}

router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.select().from(appSettingsTable);
    const persisted: Record<string, unknown> = {};
    for (const row of rows) {
      persisted[row.key] = row.value;
    }

    res.json({
      version: 1,
      server: getPublicServerConfig(),
      persisted,
      persistedReady: true,
    });
    return;
  } catch (err) {
    if (isMissingAppSettingsRelation(err)) {
      req.log.warn(
        { err },
        "app_settings table missing; returning read-only server config",
      );
      res.json({
        version: 1,
        server: getPublicServerConfig(),
        persisted: {},
        persistedReady: false,
        persistedWarning:
          "Tabela app_settings inexistente. Execute `pnpm db:push` na raiz do repositório.",
      });
      return;
    }
    req.log.error({ err }, "Failed to read settings");
    res.status(500).json({ error: "Falha ao ler configurações persistidas." });
    return;
  }
});

router.patch("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as { values?: unknown };
    const values = body?.values;

    if (!values || typeof values !== "object" || Array.isArray(values)) {
      res.status(400).json({
        error: 'Corpo inválido: esperado { "values": { "chave": ... } }.',
      });
      return;
    }

    const entries = Object.entries(values as Record<string, unknown>);
    if (entries.length > MAX_KEYS) {
      res.status(400).json({
        error: `No máximo ${MAX_KEYS} chaves por pedido.`,
      });
      return;
    }

    for (const [key] of entries) {
      if (!isValidKey(key)) {
        res.status(400).json({
          error: `Chave inválida: "${key}". Use letras, números, ponto, hífen ou underscore.`,
        });
        return;
      }
    }

    for (const [key, value] of entries) {
      await db
        .insert(appSettingsTable)
        .values({ key, value })
        .onConflictDoUpdate({
          target: appSettingsTable.key,
          set: {
            value,
            updatedAt: sql`now()`,
          },
        });
    }

    const rows = await db.select().from(appSettingsTable);
    const persisted: Record<string, unknown> = {};
    for (const row of rows) {
      persisted[row.key] = row.value;
    }

    res.json({ ok: true, persisted });
    return;
  } catch (err) {
    if (isMissingAppSettingsRelation(err)) {
      res.status(503).json({
        error:
          "Armazenamento persistido indisponível (tabela app_settings). Execute `pnpm db:push`.",
      });
      return;
    }
    req.log.error({ err }, "Failed to patch settings");
    res.status(500).json({ error: "Falha ao gravar configurações." });
    return;
  }
});

router.delete("/:key", async (req: Request, res: Response): Promise<void> => {
  try {
    const rawKey = req.params.key;
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!isValidKey(key)) {
      res.status(400).json({ error: "Chave inválida." });
      return;
    }

    await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));

    res.json({ ok: true, removed: key });
    return;
  } catch (err) {
    if (isMissingAppSettingsRelation(err)) {
      res.status(503).json({
        error:
          "Armazenamento persistido indisponível (tabela app_settings). Execute `pnpm db:push`.",
      });
      return;
    }
    req.log.error({ err }, "Failed to delete setting");
    res.status(500).json({ error: "Falha ao remover chave." });
    return;
  }
});

export default router;
