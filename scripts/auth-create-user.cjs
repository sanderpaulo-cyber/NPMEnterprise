/* eslint-disable no-console */
/**
 * Cria ou actualiza um utilizador local na tabela auth_users (mesmo hash scrypt que a API).
 *
 * Uso (na raiz do repositório):
 *   npm run auth:create-user -- admin MinhaPasswordForte
 *
 * Requer: DATABASE_URL no .env e tabela auth_users (npm run db:push).
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

function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, 64, SCRYPT_PARAMS);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

const root = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // sem .env
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("Erro: DATABASE_URL em falta no .env");
    process.exit(1);
  }

  const username = (process.argv[2] || "").trim().toLowerCase();
  const password = process.argv[3] || "";

  if (!username || username.length < 2) {
    console.error(
      "Uso: npm run auth:create-user -- <utilizador> <password>\n" +
        "  Exemplo: npm run auth:create-user -- admin AlterarEstaPassword123\n" +
        "  Password: minimo 10 caracteres, 3 classes (minusculas, maiusculas, numeros, simbolos).",
    );
    process.exit(1);
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

  const pwErr = validatePasswordStrength(password);
  if (pwErr) {
    console.error("Erro:", pwErr);
    process.exit(1);
  }

  const hash = hashPassword(password);
  const pool = new Pool({ connectionString: dbUrl });

  try {
    await pool.query(
      `INSERT INTO auth_users (username, display_name, password_hash, auth_source)
       VALUES ($1, $1, $2, 'local')
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         display_name = EXCLUDED.display_name,
         updated_at = NOW()`,
      [username, hash],
    );
    console.log("\nUtilizador criado ou actualizado:", username);
    console.log(
      "1) No .env defina AUTH_ENABLED=true e AUTH_JWT_SECRET (minimo 16 caracteres).",
    );
    console.log("2) Reinicie a API (npm run dev).");
    console.log("3) Abra o dashboard e entre com este utilizador e password.\n");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") && msg.includes("auth_users")) {
      console.error(
        "\nA tabela auth_users nao existe. Execute na raiz:\n  npm run db:push\n",
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
