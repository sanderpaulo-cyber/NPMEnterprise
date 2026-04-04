/* eslint-disable no-console */
/**
 * Lista utilizadores em auth_users (sem revelar hash completo).
 * Uso: node ./scripts/auth-debug-list-users.cjs
 */
const { Pool } = require("pg");
const { scryptSync, timingSafeEqual } = require("node:crypto");

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function verifyPassword(plain, stored) {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, saltB64, keyB64] = parts;
  if (!saltB64 || !keyB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const key = scryptSync(plain, salt, expected.length, SCRYPT_PARAMS);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

const { applyRootEnv } = require("./apply-root-env.cjs");
applyRootEnv();

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL em falta no .env");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const r = await pool.query(
      `SELECT username, disabled, auth_source,
              (password_hash IS NOT NULL AND length(password_hash) > 0) AS has_password,
              substring(password_hash from 1 for 12) AS hash_prefix
       FROM auth_users ORDER BY username`,
    );
    if (r.rows.length === 0) {
      console.log("auth_users: (vazio) — a API com AUTH_ENABLED=true deveria criar admin no arranque se a tabela estiver vazia.");
      console.log("Execute: npm run db:push   e reinicie a API, ou: npm run auth:reset");
      return;
    }
    console.log("Utilizadores:\n");
    for (const row of r.rows) {
      console.log(
        `  ${row.username} | disabled=${row.disabled} | source=${row.auth_source} | has_password=${row.has_password} | hash_prefix=${row.hash_prefix ?? "null"}`,
      );
    }
    const full = await pool.query(
      "SELECT username, password_hash FROM auth_users WHERE username = $1",
      ["admin"],
    );
    if (full.rows[0]?.password_hash) {
      const ok = verifyPassword("ChangeMeAdmin2026!", full.rows[0].password_hash);
      console.log(
        `\nTeste password predefinida ChangeMeAdmin2026! para 'admin': ${ok ? "OK" : "FALHA (hash na BD nao corresponde)"}`,
      );
    } else if (full.rows.length) {
      console.log("\nConta 'admin' existe mas password_hash esta vazio (ex.: conta LDAP). Login local falha.");
    } else {
      console.log("\nNao existe utilizador 'admin'.");
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
