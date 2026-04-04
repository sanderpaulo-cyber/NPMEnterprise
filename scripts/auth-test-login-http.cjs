/* eslint-disable no-console */
/**
 * Testa POST /api/auth/login contra a API em execução (mesmo fluxo que o browser).
 * Uso: node ./scripts/auth-test-login-http.cjs [baseUrl]
 *   baseUrl omisso: http://127.0.0.1:${API_PORT||8080}
 */
const { applyRootEnv } = require("./apply-root-env.cjs");
applyRootEnv();

const port = process.env.API_PORT || "8080";
const defaultBase = `http://127.0.0.1:${port}`;
const base = (process.argv[2] || defaultBase).replace(/\/+$/, "");
const user = process.env.AUTH_TEST_USER || "admin";
const pass = process.env.AUTH_TEST_PASS || "ChangeMeAdmin2026!";

async function main() {
  const url = `${base}/api/auth/login`;
  console.log("POST", url);
  console.log("Body:", { username: user, password: "[redacted]", passLength: pass.length });
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    console.log("Status:", r.status);
    console.log("Response:", typeof json === "object" ? JSON.stringify(json, null, 2) : json);
    if (r.status === 200) {
      console.log("\nOK: a API aceita estas credenciais. Se o browser falha, o problema é proxy/CORS/cookie ou URL diferente.");
    } else {
      console.log(
        "\nFalhou contra esta base URL. Confirme que a API em execução usa o mesmo DATABASE_URL que npm run auth:debug-users.",
      );
    }
  } catch (e) {
    console.error("Erro de rede:", e.message);
    console.log("A API está a correr neste host/porta?");
    process.exit(1);
  }
}

main();
