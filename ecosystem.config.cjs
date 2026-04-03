module.exports = {
  apps: [
    {
      name: "networksentinel-api",
      cwd: __dirname,
      script: "corepack",
      args: "pnpm start:api",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: "15s",
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
    },
    {
      name: "networksentinel-web",
      cwd: __dirname,
      script: "corepack",
      args: "pnpm start:web",
      env: {
        NODE_ENV: "production",
      },
      autorestart: true,
      max_restarts: 10,
      min_uptime: "15s",
      exp_backoff_restart_delay: 200,
      kill_timeout: 10000,
    },
  ],
};
