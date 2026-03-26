# NPM Enterprise Dashboard — Network Performance Management

## Overview

Enterprise-grade Network Performance Management (NPM) platform, optimized for LATAM (São Paulo), capable of monitoring 10k+ network nodes (switches, routers, firewalls). Inspired by SolarWinds NPM and PRTG.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + WebSockets (ws)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild
- **Frontend**: React + Vite + Recharts + @xyflow/react + framer-motion

## Architecture

```
artifacts/
├── api-server/          # Express 5 + WebSocket server + SNMP Poller engine
│   └── src/
│       ├── lib/
│       │   ├── poller.ts     # Async poller engine (100 parallel goroutine-like workers)
│       │   ├── websocket.ts  # WebSocket server (real-time push)
│       │   ├── seed.ts       # Database seeder (50 nodes, metrics, flows, alerts)
│       │   └── logger.ts
│       └── routes/
│           ├── nodes.ts      # CRUD nodes + summary stats
│           ├── metrics.ts    # Time-series metrics + top-N
│           ├── topology.ts   # LLDP/CDP topology + NetPath traceroute
│           ├── flows.ts      # NetFlow/IPFIX records + top talkers
│           ├── alerts.ts     # Alert management + acknowledge
│           ├── poller.ts     # Poller status + manual trigger
│           └── discovery.ts  # Network discovery scan
└── npm-dashboard/       # React + Vite frontend
    └── src/
        ├── pages/
        │   ├── dashboard.tsx   # KPI overview, charts, alerts
        │   ├── topology.tsx    # Network topology map (SVG/Canvas)
        │   ├── nodes.tsx       # Node inventory table
        │   ├── node-detail.tsx # Per-node metrics + charts
        │   ├── netpath.tsx     # Stacked latency chart per hop
        │   ├── flows.tsx       # NetFlow table + top talkers
        │   ├── alerts.tsx      # Alert list + acknowledge
        │   └── poller.tsx      # Poller engine status
        └── hooks/
            └── use-websocket.ts # Real-time WebSocket hook

lib/
├── api-spec/openapi.yaml    # Complete NPM OpenAPI spec (24 endpoints)
├── api-client-react/        # Generated React Query hooks
├── api-zod/                 # Generated Zod validators
└── db/src/schema/
    ├── nodes.ts      # nodes table (inventory, status, SNMP config)
    ├── metrics.ts    # metrics table (time-series: cpu, mem, latency, flows)
    ├── topology.ts   # topology_edges table (LLDP/CDP links)
    ├── flows.ts      # flows table (NetFlow/IPFIX records)
    └── alerts.ts     # alerts table (severity-based alerting)
```

## Key Features

- **Real-time monitoring**: WebSocket push for node status, metrics, alerts
- **Async polling engine**: 100 concurrent polls per batch, 30s cycles
- **SNMPv3 simulation**: Poller simulates realistic metrics (CPU, mem, interface, latency, packet loss)
- **Network topology**: LLDP/CDP edge discovery, SVG/Canvas visualization
- **NetPath (traceroute)**: Stacked bar chart with avg/min/max latency per hop
- **NetFlow/IPFIX**: Top talkers chart, per-IP traffic analysis
- **Alerting**: Critical/warning/info alerts with acknowledge workflow
- **Top-N reports**: Top CPU, memory, interface utilization nodes
- **Discovery**: Subnet scanning with automatic node registration
- **RBAC-ready**: Routes prepared for auth middleware injection

## API Endpoints (all under /api)

- `GET /api/nodes` — list nodes (filter: status, type, limit, offset)
- `GET /api/nodes/stats/summary` — KPI summary (up/down/warning counts, avg CPU/mem)
- `GET /api/nodes/:id` — node detail
- `POST /api/nodes` — add node
- `DELETE /api/nodes/:id` — remove node
- `GET /api/metrics/:nodeId` — time-series metrics (bucket: 1m/5m/1h/1d)
- `GET /api/metrics/top-n` — top-N nodes by metric
- `GET /api/topology` — full topology graph (nodes + edges)
- `GET /api/topology/netpath/:nodeId` — traceroute hop latency data
- `GET /api/flows` — NetFlow records
- `GET /api/flows/top-talkers` — top traffic sources/destinations
- `GET /api/alerts` — alert list (filter: severity, nodeId, acknowledged)
- `POST /api/alerts/:id/acknowledge` — acknowledge alert
- `GET /api/poller/status` — poller engine stats
- `POST /api/poller/trigger` — manual poll trigger
- `POST /api/discovery/scan` — start subnet discovery
- `WS /api/ws` — WebSocket for real-time events

## Running

```bash
# Dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/npm-dashboard run dev

# DB schema push
pnpm --filter @workspace/db run push

# Codegen (after OpenAPI changes)
pnpm --filter @workspace/api-spec run codegen
```

## Scaling to 10k Nodes

The poller processes 100 nodes per batch concurrently (Promise.all). For 10k nodes:
- Run multiple poller instances (horizontal scaling)
- Increase BATCH_SIZE per available CPU cores
- TimescaleDB hypertables for time-series at scale
- Redis pub/sub for inter-instance coordination (planned)
- gRPC distributed collectors (planned)
