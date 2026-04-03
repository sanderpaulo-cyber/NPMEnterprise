/* eslint-disable no-console */
const path = require("path");
const { spawn } = require("child_process");

try {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env"));
} catch {
  // optional local env file
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao definido.");
  process.exit(1);
}

const input = process.argv[2];
if (!input) {
  console.error("Informe o arquivo de backup: node ./scripts/db-restore.cjs <arquivo.dump>");
  process.exit(1);
}

const backupPath = path.resolve(input);
const child = spawn(
  "pg_restore",
  [
    "--clean",
    "--if-exists",
    "--no-owner",
    `--dbname=${process.env.DATABASE_URL}`,
    backupPath,
  ],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Restore concluido: ${backupPath}`);
    process.exit(0);
  }
  process.exit(code ?? 1);
});
