# Contribuindo com o NetworkSentinelPRO

Este documento resume como preparar o ambiente, validar alteracoes e abrir contribuicoes com menor risco de regressao.

## Requisitos

- Node.js 22+
- `corepack` habilitado
- `pnpm`
- PostgreSQL local ou acessivel por `DATABASE_URL`

## Setup local

1. Instale dependencias:

```bash
corepack enable
corepack pnpm install
```

2. Gere o arquivo de ambiente:

```bash
cp .env.example .env
```

No PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Aplique o schema:

```bash
corepack pnpm --filter @workspace/db run push
```

4. Suba a aplicacao:

```bash
corepack pnpm dev:api
corepack pnpm dev:web
```

Por defeito, `AUTH_ENABLED=false` no `.env.example`, para desenvolvimento sem login. Para testar o fluxo completo de autenticacao, siga a secao **Autenticacao do dashboard e da API** no `README.md` e reinicie a API.

## Estrategia de mudanca

- prefira mudancas pequenas e focadas
- evite misturar refactor estrutural com feature nova no mesmo commit
- preserve `.env` e outros arquivos locais fora do Git
- mantenha o README e o `.env.example` atualizados quando houver mudanca de setup

## Validacao minima antes de abrir PR

Execute:

```bash
corepack pnpm run typecheck:libs
corepack pnpm -r --filter "./artifacts/**" --filter "./scripts" --if-present run typecheck
corepack pnpm -r --filter "./lib/**" --filter "./artifacts/api-server" --filter "./artifacts/npm-dashboard" --if-present run build
```

Se sua mudanca tocar runtime da API, tambem valide:

- `GET /api/healthz` e `GET /api/readyz`
- bootstrap local com `dev:api`
- dashboard com proxy `/api`
- se alterar rotas protegidas ou auth: login em `/login`, cookie `ns_session` ou header `Authorization`, e rotas em `/api/auth/*` conforme `artifacts/api-server/src/routes/auth.ts`

## Convencao de commits

Mensagens recomendadas:

- frase curta em ingles
- foco no objetivo da mudanca
- segunda linha opcional explicando o impacto

Exemplos:

- `Improve API developer workflow and CI smoke coverage.`
- `Add setup documentation and safe environment template.`
- `Expand enterprise network monitoring capabilities.`

## Areas sensiveis

Tenha atencao extra em:

- `lib/db`: altera schema e pode exigir `drizzle push` (inclui `schema/auth.ts` e `schema/settings.ts`)
- `artifacts/api-server/src/lib/auth/` e `src/middleware/auth-gateway.ts`: sessao, JWT e protecao de rotas
- `artifacts/api-server/src/routes/auth.ts`, `settings.ts`, `users-admin.ts`: contratos publicos da API
- `artifacts/npm-dashboard/src/context/auth-context.tsx` e paginas `login.tsx` / `settings.tsx`: fluxo de utilizador
- `artifacts/api-server/src/lib/poller.ts`: afeta polling e carga operacional
- `artifacts/api-server/src/lib/snmp-client.ts`: afeta compatibilidade com vendors
- `artifacts/npm-dashboard/src/pages/topology.tsx`: impacto forte em UX e performance

## Seguranca

- nao commite segredos (inclui `AUTH_JWT_SECRET` e passwords de bootstrap)
- nao publique credenciais SNMP reais
- prefira acessos de leitura
- remova dados sensiveis de logs e exemplos
- mudancas em auth ou em listagem de utilizadores: revisar rate limits e validacao de entrada em `artifacts/api-server/src/lib/auth/`

## Backlog tecnico

O backlog inicial do projeto esta em `docs/ROADMAP.md`.
