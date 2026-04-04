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

/**
 * Cria o primeiro utilizador local se AUTH_BOOTSTRAP_* estiver definido e a tabela estiver vazia.
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  if (!isAuthEnabled()) return;

  const username = process.env.AUTH_BOOTSTRAP_USERNAME?.trim().toLowerCase();
  const password = process.env.AUTH_BOOTSTRAP_PASSWORD ?? "";

  const uErr = username ? validateUsernameForRegister(username) : "Utilizador em falta";
  const pwErr = validatePasswordStrength(password);
  if (!username || uErr || pwErr) {
    logger.warn(
      {
        usernameIssue: uErr,
        passwordIssue: pwErr,
      },
      "AUTH_BOOTSTRAP_* invalido: ver regras de utilizador/password em .env.example, ou use npm run auth:create-user",
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

  logger.info({ username }, "Utilizador inicial criado a partir de AUTH_BOOTSTRAP_*");
}
