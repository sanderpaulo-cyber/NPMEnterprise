/* eslint-disable no-console */
/**
 * Remove todos os registos de auth_users e cria um unico utilizador local admin.
 *
 * Uso (na raiz):
 *   npm run auth:reset
 *
 * Opcional no .env:
 *   AUTH_RESET_ADMIN_USERNAME=admin
 *   AUTH_RESET_ADMIN_PASSWORD=ChangeMeAdmin2026!
 *
 * Senha predefinida (se nao definir AUTH_RESET_ADMIN_PASSWORD): ChangeMeAdmin2026!
 * Requer: DATABASE_URL, tabela auth_users (npm run db:push).
 */
const { randomBytes, scryptSync } = require("node:crypto");
const path = require("node:path");
const { Pool } = require("pg");

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

const DEFAULT_ADMIN = "admin";
/** Predefinida: >=10 chars, 3 classes — altere no primeiro login ou via .env */
const DEFAULT_PASSWORD = "ChangeMeAdmin2026!";

function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

function validatePasswordStrength(p) {
  if (p.length < 10) return "Password: minimo 10 caracteres.";
  if (p.length > 128) return "Password: maximo 128 caracteres.";
  let classes = 0;
  if (/[a-z]/.test(p)) classes += 1;
  if (/[A-Z]/.test(p)) classes += 1;
  if (/[0-9]/.test(p)) classes += 1;
  if (/[^a-zA-Z0-9]/.test(p)) classes += 1;
  if (classes < 3) {
    return "Password: combine pelo menos 3 tipos (minusculas, maiusculas, numeros, simbolos).";
  }
  return null;
}

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  /* sem .env */
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Erro: DATABASE_URL em falta no .env");
    process.exit(1);
  }

  const username = (
    process.env.AUTH_RESET_ADMIN_USERNAME || DEFAULT_ADMIN
  )
    .trim()
    .toLowerCase();
  const password =
    process.env.AUTH_RESET_ADMIN_PASSWORD?.trim() || DEFAULT_PASSWORD;

  if (!username || username.length < 2) {
    console.error("Erro: AUTH_RESET_ADMIN_USERNAME invalido.");
    process.exit(1);
  }

  const pwErr = validatePasswordStrength(password);
  if (pwErr) {
    console.error("Erro:", pwErr);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: dbUrl });
  const hash = hashPassword(password);

  try {
    await pool.query("TRUNCATE TABLE auth_users");
    await pool.query(
      `INSERT INTO auth_users (username, display_name, password_hash, auth_source)
       VALUES ($1, $1, $2, 'local')`,
      [username, hash],
    );
    console.log("\nauth_users: tabela limpa.");
    console.log("Conta admin criada:");
    console.log("  Utilizador:", username);
    console.log("  Password:  ", password);
    console.log(
      "\nSugestao: no .env alinhe AUTH_BOOTSTRAP_USERNAME / AUTH_BOOTSTRAP_PASSWORD com estes valores",
    );
    console.log("(o bootstrap ignora-se se a tabela ja tiver utilizadores). Reinicie a API.");
    console.log("Altere a password no primeiro login em producao.\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") && msg.includes("auth_users")) {
      console.error(
        "\nA tabela auth_users nao existe. Na raiz execute:\n  npm run db:push\n",
      );
    } else {
      console.error("\nErro:", msg, "\n");
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
