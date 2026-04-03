/* eslint-disable no-console */
const { mkdirSync } = require("fs");
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

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, "..", "backups", `networksentinel-${timestamp}.dump`);

mkdirSync(path.dirname(outputPath), { recursive: true });

const child = spawn(
  "pg_dump",
  ["--format=custom", "--file", outputPath, `--dbname=${process.env.DATABASE_URL}`],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(`Backup concluido: ${outputPath}`);
    process.exit(0);
  }
  process.exit(code ?? 1);
});
