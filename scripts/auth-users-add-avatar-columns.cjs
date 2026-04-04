/* eslint-disable no-console */
"use strict";
/**
 * Adiciona colunas de perfil em auth_users se faltarem (evita erro Drizzle no login).
 * Uso: node ./scripts/auth-users-add-avatar-columns.cjs
 */
const { applyRootEnv } = require("./apply-root-env.cjs");
const { Client } = require("pg");

applyRootEnv();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL em falta");
    process.exit(1);
  }
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar_emoji text`,
    );
    await c.query(
      `ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS avatar_image_url text`,
    );
    console.log("Colunas avatar_emoji / avatar_image_url verificadas.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
