import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // Optional local env file.
}

/** Alinhado com o servidor Vite: cookie Secure na API quando o dashboard é HTTPS. */
const httpsEnabled =
  process.env.WEB_HTTPS !== "0" && process.env.WEB_HTTPS !== "false";

const apiProxy = {
  "/api": {
    target:
      process.env.API_PROXY_TARGET ??
      `http://127.0.0.1:${process.env.API_PORT ?? "8080"}`,
    changeOrigin: true,
    ws: true,
    configure(proxy) {
      if (httpsEnabled) {
        proxy.on("proxyReq", (proxyReq) => {
          proxyReq.setHeader("X-Forwarded-Proto", "https");
        });
      }
    },
  },
} as const;

/** 443: no Windows costuma exigir terminal como Administrador. */
const rawPort = process.env.WEB_PORT ?? process.env.PORT ?? "443";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

function resolveSslPath(p: string): string {
  return path.isAbsolute(p) ? p : path.join(repoRoot, p);
}

function loadCustomHttpsCerts():
  | { key: Buffer; cert: Buffer }
  | undefined {
  const keyEnv = process.env.WEB_SSL_KEY?.trim();
  const certEnv = process.env.WEB_SSL_CERT?.trim();
  if (!keyEnv || !certEnv) return undefined;
  const keyPath = resolveSslPath(keyEnv);
  const certPath = resolveSslPath(certEnv);
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    return undefined;
  }
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

const customHttps = httpsEnabled ? loadCustomHttpsCerts() : undefined;
/** Cert gerado em memoria pelo plugin; use WEB_SSL_KEY/WEB_SSL_CERT para PEM persistentes (ex. pnpm cert:localhost). */
const useBasicSslPlugin = Boolean(httpsEnabled && !customHttps);

export default defineConfig({
  base: basePath,
  plugins: [
    ...(useBasicSslPlugin ? [basicSsl()] : []),
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          runtimeErrorOverlay(),
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    ...(customHttps ? { https: customHttps } : {}),
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: { ...apiProxy },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    ...(customHttps ? { https: customHttps } : {}),
    proxy: { ...apiProxy },
  },
});
