import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { authUsersTable } from "@workspace/db/schema";
import { logger } from "../logger";
import { isAuthEnabled } from "./config";
import { hashPassword } from "./password";
import {
  validatePasswordStrength,
  validateUsernameForRegister,
} from "./validation";

/** Igual a `scripts/reset-auth-users.cjs` — primeiro acesso quando AUTH_BOOTSTRAP_* omisso. */
export const DEFAULT_FIRST_ACCESS_USERNAME = "admin";
export const DEFAULT_FIRST_ACCESS_PASSWORD = "ChangeMeAdmin2026!";

/**
 * Cria o primeiro utilizador local se `auth_users` estiver vazia.
 * Usa AUTH_BOOTSTRAP_USERNAME / AUTH_BOOTSTRAP_PASSWORD quando validos;
 * caso contrario aplica admin + senha predefinida (com aviso nos logs).
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  if (!isAuthEnabled()) return;

  const envUserRaw = process.env.AUTH_BOOTSTRAP_USERNAME?.trim().toLowerCase();
  const envPassRaw = process.env.AUTH_BOOTSTRAP_PASSWORD;

  const username = envUserRaw || DEFAULT_FIRST_ACCESS_USERNAME;
  const password =
    envPassRaw !== undefined && envPassRaw !== ""
      ? envPassRaw
      : DEFAULT_FIRST_ACCESS_PASSWORD;

  const uErr = validateUsernameForRegister(username);
  const pwErr = validatePasswordStrength(password);
  if (uErr || pwErr) {
    logger.warn(
      {
        usernameIssue: uErr,
        passwordIssue: pwErr,
        username,
      },
      "AUTH_BOOTSTRAP_* invalido: ver regras em .env.example ou npm run auth:create-user",
    );
    return;
  }

  const rows = await db
    .select({ count: sql<string>`count(*)::text` })
    .from(authUsersTable);
  const count = Number(rows[0]?.count ?? 0);

  if (count > 0) return;

  await db.insert(authUsersTable).values({
    username,
    displayName: username,
    passwordHash: hashPassword(password),
    authSource: "local",
  });

  const usedDefaultUser = !envUserRaw;
  const usedDefaultPass = envPassRaw === undefined || envPassRaw === "";
  if (usedDefaultUser || usedDefaultPass) {
    logger.warn(
      {
        username,
        usedDefaultUser,
        usedDefaultPass,
      },
      "Primeiro acesso: utilizador criado com credenciais predefinidas (admin / ChangeMeAdmin2026!). Altere a password apos login.",
    );
  } else {
    logger.info({ username }, "Utilizador inicial criado a partir de AUTH_BOOTSTRAP_*");
  }
}
