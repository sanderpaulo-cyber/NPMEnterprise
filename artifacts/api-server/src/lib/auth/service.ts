import { and, asc, count, eq, ne } from "drizzle-orm";
import { db } from "@workspace/db";
import { authUsersTable, type AuthUser } from "@workspace/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { signAuthToken } from "./jwt";
import { logger } from "../logger";
import { isLdapConfigured } from "./config";
import { tryLdapBind } from "./ldap";
import {
  validatePasswordStrength,
  validateUsernameForRegister,
} from "./validation";
import {
  emptyProfile,
  type ComplementaryProfile,
} from "./profile-fields";

export type SessionUserPayload = {
  id: string;
  username: string;
  displayName: string | null;
  authSource: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  notes: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
};

export function rowToSessionUser(row: AuthUser): SessionUserPayload {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    authSource: row.authSource,
    email: row.email,
    phone: row.phone,
    department: row.department,
    jobTitle: row.jobTitle,
    notes: row.notes,
    avatarEmoji: row.avatarEmoji ?? null,
    avatarImageUrl: row.avatarImageUrl ?? null,
  };
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function findUserByUsername(username: string) {
  const u = normalizeUsername(username);
  const rows = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.username, u))
    .limit(1);
  return rows[0] ?? null;
}

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<{ token: string; user: SessionUserPayload }> {
  const u = normalizeUsername(username);
  if (!u || password.length === 0) {
    const err = new Error("Credenciais invalidas");
    (err as NodeJS.ErrnoException).code = "AUTH_INVALID";
    throw err;
  }

  const row = await findUserByUsername(u);

  if (
    row &&
    !row.disabled &&
    row.passwordHash &&
    verifyPassword(password, row.passwordHash)
  ) {
    const token = await signAuthToken({
      userId: row.id,
      username: row.username,
      authSource: row.authSource,
    });
    return {
      token,
      user: rowToSessionUser(row),
    };
  }

  if (isLdapConfigured()) {
    const ldap = await tryLdapBind(u, password);
    if (ldap) {
      let userRow = await findUserByUsername(u);
      if (!userRow) {
        await db.insert(authUsersTable).values({
          username: u,
          displayName: u,
          passwordHash: null,
          authSource: "ldap",
          externalSubject: ldap.dn,
        });
        userRow = await findUserByUsername(u);
      } else if (userRow.disabled) {
        const err = new Error("Conta desativada");
        (err as NodeJS.ErrnoException).code = "AUTH_DISABLED";
        throw err;
      } else {
        await db
          .update(authUsersTable)
          .set({
            externalSubject: ldap.dn,
            authSource: "ldap",
            updatedAt: new Date(),
          })
          .where(eq(authUsersTable.id, userRow.id));
        userRow = await findUserByUsername(u);
      }

      if (!userRow || userRow.disabled) {
        const err = new Error("Credenciais invalidas");
        (err as NodeJS.ErrnoException).code = "AUTH_INVALID";
        throw err;
      }

      const token = await signAuthToken({
        userId: userRow.id,
        username: userRow.username,
        authSource: userRow.authSource,
      });
      return {
        token,
        user: rowToSessionUser(userRow),
      };
    }
  }

  if (!row) {
    logger.warn({ username: u }, "Login falhou: utilizador inexistente nesta base de dados");
  } else if (row.disabled) {
    logger.warn({ username: u }, "Login falhou: conta desactivada");
  } else if (!row.passwordHash || row.passwordHash.length === 0) {
    logger.warn(
      { username: u, authSource: row.authSource },
      "Login falhou: conta sem password local (LDAP/OAuth ou hash em falta); use LDAP ou npm run auth:create-user",
    );
  } else if (!row.passwordHash.startsWith("scrypt$")) {
    logger.warn(
      { username: u, hashPrefix: row.passwordHash.slice(0, 16) },
      "Login falhou: formato de hash desconhecido (esperado scrypt$); redefina a password com npm run auth:create-user ou auth:reset",
    );
  } else {
    logger.warn({ username: u }, "Login falhou: password incorrecta");
  }

  const err = new Error("Credenciais invalidas");
  (err as NodeJS.ErrnoException).code = "AUTH_INVALID";
  throw err;
}

export async function registerLocalUser(
  username: string,
  password: string,
  displayName?: string,
  profile: ComplementaryProfile = emptyProfile(),
): Promise<{ id: string; username: string }> {
  const u = normalizeUsername(username);
  const uErr = validateUsernameForRegister(username);
  if (uErr) {
    const err = new Error(uErr);
    (err as NodeJS.ErrnoException).code = "AUTH_VALIDATION";
    throw err;
  }
  const pErr = validatePasswordStrength(password);
  if (pErr) {
    const err = new Error(pErr);
    (err as NodeJS.ErrnoException).code = "AUTH_VALIDATION";
    throw err;
  }

  const existing = await findUserByUsername(u);
  if (existing) {
    const err = new Error("Username ja existe");
    (err as NodeJS.ErrnoException).code = "AUTH_DUPLICATE";
    throw err;
  }

  if (profile.email) {
    const taken = await db
      .select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(eq(authUsersTable.email, profile.email))
      .limit(1);
    if (taken[0]) {
      const err = new Error("Email ja associado a outro utilizador");
      (err as NodeJS.ErrnoException).code = "AUTH_EMAIL_TAKEN";
      throw err;
    }
  }

  const [inserted] = await db
    .insert(authUsersTable)
    .values({
      username: u,
      displayName: displayName?.trim() || u,
      email: profile.email,
      phone: profile.phone,
      department: profile.department,
      jobTitle: profile.jobTitle,
      notes: profile.notes,
      avatarEmoji: profile.avatarEmoji,
      avatarImageUrl: profile.avatarImageUrl,
      passwordHash: hashPassword(password),
      authSource: "local",
    })
    .returning({ id: authUsersTable.id, username: authUsersTable.username });

  return inserted!;
}

export async function getUserById(id: string) {
  const rows = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export type AuthUserListRow = {
  id: string;
  username: string;
  displayName: string | null;
  authSource: string;
  disabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  hasLocalPassword: boolean;
  /** DN LDAP ou identificador externo (OAuth/SAML futuro). */
  externalSubject: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  jobTitle: string | null;
  notes: string | null;
  avatarEmoji: string | null;
  avatarImageUrl: string | null;
};

export async function listAuthUsersForAdmin(): Promise<AuthUserListRow[]> {
  const rows = await db
    .select({
      id: authUsersTable.id,
      username: authUsersTable.username,
      displayName: authUsersTable.displayName,
      authSource: authUsersTable.authSource,
      disabled: authUsersTable.disabled,
      createdAt: authUsersTable.createdAt,
      updatedAt: authUsersTable.updatedAt,
      passwordHash: authUsersTable.passwordHash,
      externalSubject: authUsersTable.externalSubject,
      email: authUsersTable.email,
      phone: authUsersTable.phone,
      department: authUsersTable.department,
      jobTitle: authUsersTable.jobTitle,
      notes: authUsersTable.notes,
      avatarEmoji: authUsersTable.avatarEmoji,
      avatarImageUrl: authUsersTable.avatarImageUrl,
    })
    .from(authUsersTable)
    .orderBy(asc(authUsersTable.username));

  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    authSource: r.authSource,
    disabled: r.disabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    hasLocalPassword: r.passwordHash != null && r.passwordHash.length > 0,
    externalSubject: r.externalSubject,
    email: r.email,
    phone: r.phone,
    department: r.department,
    jobTitle: r.jobTitle,
    notes: r.notes,
    avatarEmoji: r.avatarEmoji,
    avatarImageUrl: r.avatarImageUrl,
  }));
}

export async function adminUpdateUser(
  id: string,
  patch: {
    username?: string;
    displayName?: string | null;
    disabled?: boolean;
    password?: string;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    jobTitle?: string | null;
    notes?: string | null;
    avatarEmoji?: string | null;
    avatarImageUrl?: string | null;
  },
  actorUserId: string,
) {
  const row = await getUserById(id);
  if (!row) {
    const err = new Error("Utilizador inexistente");
    (err as NodeJS.ErrnoException).code = "AUTH_NOT_FOUND";
    throw err;
  }

  if (patch.disabled === true && id === actorUserId) {
    const err = new Error("Nao pode desativar a sua propria sessao");
    (err as NodeJS.ErrnoException).code = "AUTH_SELF";
    throw err;
  }

  type PatchCols = {
    username?: string;
    displayName?: string | null;
    disabled?: boolean;
    passwordHash?: string;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    jobTitle?: string | null;
    notes?: string | null;
    avatarEmoji?: string | null;
    avatarImageUrl?: string | null;
    updatedAt: Date;
  };

  const updates: PatchCols = { updatedAt: new Date() };

  if (patch.username !== undefined) {
    if (row.authSource !== "local") {
      const err = new Error(
        "O login (nome de utilizador) so pode ser alterado em contas locais. Contas LDAP usam o directório.",
      );
      (err as NodeJS.ErrnoException).code = "AUTH_VALIDATION";
      throw err;
    }
    const uErr = validateUsernameForRegister(patch.username);
    if (uErr) {
      const err = new Error(uErr);
      (err as NodeJS.ErrnoException).code = "AUTH_VALIDATION";
      throw err;
    }
    const u = normalizeUsername(patch.username);
    if (u !== row.username) {
      const other = await findUserByUsername(u);
      if (other && other.id !== id) {
        const err = new Error("Este nome de utilizador (login) ja esta em uso");
        (err as NodeJS.ErrnoException).code = "AUTH_DUPLICATE";
        throw err;
      }
      updates.username = u;
    }
  }

  if (patch.displayName !== undefined) {
    const raw =
      patch.displayName === null ? "" : patch.displayName.trim();
    updates.displayName = raw === "" ? row.username : raw;
  }

  if (typeof patch.disabled === "boolean") {
    updates.disabled = patch.disabled;
  }

  if (patch.password != null && patch.password !== "") {
    if (row.authSource !== "local") {
      const err = new Error(
        "So contas de origem local permitem definir password aqui (utilize LDAP ou auth:create-user se aplicavel).",
      );
      (err as NodeJS.ErrnoException).code = "AUTH_VALIDATION";
      throw err;
    }
    const pErr = validatePasswordStrength(patch.password);
    if (pErr) {
      const err = new Error(pErr);
      (err as NodeJS.ErrnoException).code = "AUTH_VALIDATION";
      throw err;
    }
    updates.passwordHash = hashPassword(patch.password);
  }

  if (patch.email !== undefined) {
    if (patch.email) {
      const taken = await db
        .select({ id: authUsersTable.id })
        .from(authUsersTable)
        .where(
          and(
            eq(authUsersTable.email, patch.email),
            ne(authUsersTable.id, id),
          ),
        )
        .limit(1);
      if (taken[0]) {
        const err = new Error("Email ja associado a outro utilizador");
        (err as NodeJS.ErrnoException).code = "AUTH_EMAIL_TAKEN";
        throw err;
      }
    }
    updates.email = patch.email;
  }

  if (patch.phone !== undefined) {
    updates.phone = patch.phone;
  }
  if (patch.department !== undefined) {
    updates.department = patch.department;
  }
  if (patch.jobTitle !== undefined) {
    updates.jobTitle = patch.jobTitle;
  }
  if (patch.notes !== undefined) {
    updates.notes = patch.notes;
  }
  if (patch.avatarEmoji !== undefined) {
    updates.avatarEmoji = patch.avatarEmoji;
  }
  if (patch.avatarImageUrl !== undefined) {
    updates.avatarImageUrl = patch.avatarImageUrl;
  }

  if (Object.keys(updates).length === 1) {
    return row;
  }

  await db.update(authUsersTable).set(updates).where(eq(authUsersTable.id, id));

  return (await getUserById(id))!;
}

export async function adminDeleteUser(id: string, actorUserId: string): Promise<void> {
  if (id === actorUserId) {
    const err = new Error("Nao pode remover a sua propria conta");
    (err as NodeJS.ErrnoException).code = "AUTH_SELF";
    throw err;
  }

  const [c] = await db.select({ n: count() }).from(authUsersTable);
  const n = Number(c?.n ?? 0);
  if (n <= 1) {
    const err = new Error("Nao pode remover o ultimo utilizador");
    (err as NodeJS.ErrnoException).code = "AUTH_LAST_USER";
    throw err;
  }

  const row = await getUserById(id);
  if (!row) {
    const err = new Error("Utilizador inexistente");
    (err as NodeJS.ErrnoException).code = "AUTH_NOT_FOUND";
    throw err;
  }

  await db.delete(authUsersTable).where(eq(authUsersTable.id, id));
}
