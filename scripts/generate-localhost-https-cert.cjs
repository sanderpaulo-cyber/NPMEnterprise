/* eslint-disable no-console */
/**
 * Gera par key/cert PEM para localhost (OpenSSL no PATH).
 * Saida em .local/certs/ (gitignored). Depois defina no .env:
 *   WEB_SSL_KEY=.local/certs/localhost-key.pem
 *   WEB_SSL_CERT=.local/certs/localhost-cert.pem
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".local", "certs");
const keyFile = path.join(outDir, "localhost-key.pem");
const certFile = path.join(outDir, "localhost-cert.pem");

fs.mkdirSync(outDir, { recursive: true });

try {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyFile,
      "-out",
      certFile,
      "-days",
      "825",
      "-nodes",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "inherit", cwd: root },
  );
} catch {
  console.error(
    "\nFalha ao executar openssl. Instale OpenSSL (ex.: Git for Windows inclui openssl.exe no PATH)\n" +
      "ou use HTTPS sem ficheiros: mantenha WEB_HTTPS=1 sem WEB_SSL_* (Vite usa @vitejs/plugin-basic-ssl).\n",
  );
  process.exit(1);
}

console.log("\nCertificados gerados:");
console.log(" ", keyFile);
console.log(" ", certFile);
console.log("\nAdicione ao .env na raiz do repositorio:\n");
console.log("WEB_SSL_KEY=.local/certs/localhost-key.pem");
console.log("WEB_SSL_CERT=.local/certs/localhost-cert.pem");
console.log("WEB_PORT=443");
console.log("WEB_HTTPS=1\n");
