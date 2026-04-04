import { defineConfig } from "drizzle-kit";
import { applyRootEnvOverride } from "./src/apply-root-env-override";
import { resolveMonorepoEnvPath } from "./src/resolve-monorepo-env-path";

const envPath = resolveMonorepoEnvPath(import.meta.url);
if (envPath) {
  applyRootEnvOverride(envPath);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: "./src/schema/*.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
