# NetworkSentinelPRO

[![CI](https://github.com/sanderpaulo-cyber/NPMEnterprise/actions/workflows/ci.yml/badge.svg)](https://github.com/sanderpaulo-cyber/NPMEnterprise/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

Plataforma de monitoracao e operacao de rede com API Node.js/Express, dashboard React/Vite, persistencia em PostgreSQL e coleta por ICMP/SNMP.

Licenca: `MIT`

O projeto foi organizado como monorepo `pnpm workspace` e hoje cobre:

- inventario de dispositivos de rede
- descoberta de hosts em sub-redes
- polling de saude e telemetria
- alertas operacionais
- topologia com correlacao LLDP/CDP
- metricas historicas de CPU, memoria, temperatura e FAN
- analise L2 com ARP, MAC table, VLANs e perfis de portas
- autenticacao do dashboard (JWT + cookie HttpOnly) e API protegida quando ativada (`AUTH_ENABLED`)
- paginas de login e definicoes, com administracao de utilizadores locais e LDAP opcional

## Arquitetura

- `artifacts/api-server`: API HTTP, WebSocket e motor de coleta
- `artifacts/npm-dashboard`: interface web operacional
- `lib/db`: schema Drizzle e conexao com PostgreSQL
- `lib/api-client-react`: client React gerado para parte da API
- `lib/api-zod`: contratos Zod usados na API

### Visao de alto nivel

```mermaid
flowchart LR
  User[Operador] --> Web[Dashboard React/Vite]
  Web -->|HTTP /api autenticado| Api[API Express]
  Web -->|WebSocket /api/ws| Ws[/api/ws]
  Api --> Db[(PostgreSQL)]
  Api --> Poller[Poller ICMP/SNMP]
  Poller --> Network[Dispositivos de rede]
  Poller --> Db
  Api --> Ws
```

Com `AUTH_ENABLED=true`, o dashboard obtem sessao em `/login`; a API valida JWT/cookie nas rotas protegidas (ver `.env.example`).

### Estrutura do repositorio

```text
.
|-- artifacts/
|   |-- api-server/
|   |-- npm-dashboard/
|   `-- mockup-sandbox/
|-- lib/
|   |-- api-client-react/
|   |-- api-zod/
|   `-- db/
|-- scripts/
|-- .env.example
|-- .gitignore
|-- LICENSE
`-- README.md
```

Documentos auxiliares:

- guia de contribuicao: `CONTRIBUTING.md`
- roadmap tecnico e lista de **entregas recentes** vs backlog: `docs/ROADMAP.md`

## Requisitos

- Node.js 22+ recomendado
- `corepack` habilitado
- `pnpm`
- PostgreSQL em execucao

## Instalacao

Clone o repositorio e instale as dependencias:

```bash
git clone https://github.com/sanderpaulo-cyber/NPMEnterprise.git
cd NPMEnterprise
corepack enable
corepack pnpm install
```

### Setup rapido

Depois da instalacao, o caminho mais curto para subir o ambiente local e:

```bash
cp .env.example .env
corepack pnpm --filter @workspace/db run push
corepack pnpm dev:api
corepack pnpm dev:web
```

## Configuracao

Crie um arquivo `.env` na raiz do projeto a partir do exemplo versionado:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Exemplo minimo:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/networksentinel

API_PORT=8080
PGPOOL_MAX=20
PGPOOL_IDLE_TIMEOUT_MS=30000
PGPOOL_CONNECT_TIMEOUT_MS=10000
WEB_PORT=20112
API_PROXY_TARGET=http://127.0.0.1:8080
BASE_PATH=/

ENABLE_DEMO_SEED=false
NETWORK_POLLING_MODE=icmp
NETWORK_POLL_INTERVAL_MS=30000
NETWORK_POLL_BATCH_SIZE=6
NETWORK_DETAILED_POLL_INTERVAL_MS=300000
DISCOVERY_MAX_PARALLEL_RUNS=1
DISCOVERY_API_RATE_LIMIT_WINDOW_MS=60000
DISCOVERY_API_RATE_LIMIT_MAX=10
DISCOVERY_MAX_HOSTS_PER_RUN=512
DISCOVERY_HOST_CONCURRENCY=6
LOG_LEVEL=info
```

Para ativar autenticacao em ambiente real, copie tambem as variaveis do bloco **Autenticacao** em `.env.example` (`AUTH_ENABLED`, `AUTH_JWT_SECRET`, etc.).

### Variaveis de ambiente

- `DATABASE_URL`: string de conexao com o PostgreSQL
- `API_PORT`: porta da API
- `PGPOOL_MAX`: conexoes maximas do pool PostgreSQL
- `PGPOOL_IDLE_TIMEOUT_MS`: tempo maximo de idle das conexoes do pool
- `PGPOOL_CONNECT_TIMEOUT_MS`: timeout de conexao com o PostgreSQL
- `WEB_PORT`: porta do dashboard Vite
- `API_PROXY_TARGET`: alvo do proxy `/api` usado pelo dashboard
- `BASE_PATH`: base path da aplicacao web
- `ENABLE_DEMO_SEED`: popula dados demo se `true`
- `NETWORK_POLLING_MODE`: `simulated` para demo ou qualquer outro valor para coleta real
- `NETWORK_POLL_INTERVAL_MS`: cadencia base do scheduler de coleta
- `NETWORK_POLL_BATCH_SIZE`: quantidade de nos consultados em paralelo por lote
- `NETWORK_DETAILED_POLL_INTERVAL_MS`: intervalo detalhado usado como base para o perfil padrao
- `DISCOVERY_MAX_PARALLEL_RUNS`: quantas execucoes de discovery podem rodar ao mesmo tempo
- `DISCOVERY_API_RATE_LIMIT_WINDOW_MS`: janela de protecao contra flood de requests de discovery
- `DISCOVERY_API_RATE_LIMIT_MAX`: quantidade maxima de requests pesados de discovery por janela
- `DISCOVERY_MAX_HOSTS_PER_RUN`: limite de IPs por execucao de descoberta
- `DISCOVERY_HOST_CONCURRENCY`: concorrencia da descoberta
- `LOG_LEVEL`: nivel de log da API

Autenticacao (opcional; ver bloco completo em `.env.example`):

- `AUTH_ENABLED`: `true` protege `/api/*` exceto health/readiness e `/api/auth/*`; `false` mantem a API aberta para desenvolvimento
- `AUTH_JWT_SECRET`: obrigatorio com auth ativa (minimo 16 caracteres)
- `AUTH_TOKEN_EXPIRY_HOURS`: horas de validade do JWT
- `AUTH_BOOTSTRAP_USERNAME` / `AUTH_BOOTSTRAP_PASSWORD`: criacao do primeiro utilizador se `auth_users` estiver vazia
- `AUTH_ALLOW_REGISTER`: permite registo na pagina `/login` quando `true`
- `AUTH_LDAP_URL`, `AUTH_LDAP_USER_DN_TEMPLATE`: login LDAP apos falha de password local
- `TRUST_PROXY`: hops atras de proxy reverso (cookies `Secure` / forwarding)

Baseline recomendado para redes maiores:

- manter `NETWORK_POLL_INTERVAL_MS=30000`
- manter `NETWORK_POLL_BATCH_SIZE` entre `4` e `8`
- manter `NETWORK_DETAILED_POLL_INTERVAL_MS=300000` ou maior
- executar discovery por blocos menores e com `DISCOVERY_HOST_CONCURRENCY` entre `4` e `8`

Perfis de coleta por no:

- `critical`: saude em `30s`, detalhamento em `2 min`
- `standard`: saude em `60s`, detalhamento em `5 min`
- `low_impact`: saude em `5 min`, detalhamento em `15 min`
- `inventory_scheduled`: saude em `10 min`, inventario pesado em `60 min`

## Banco de dados

Crie o banco no PostgreSQL e depois aplique o schema:

```bash
corepack pnpm db:push
```

Se estiver usando o exemplo acima, o banco esperado e `networksentinel`.

## Como executar

Fluxo local mais simples:

```bash
corepack pnpm install
corepack pnpm db:push
corepack pnpm dev
```

Esse comando da raiz sobe API e dashboard juntos, recicla as portas de desenvolvimento e reduz erros de inicializacao duplicada.

Ou, se preferir operar separado:

Suba a API em um terminal:

```bash
corepack pnpm dev:api
```

O comando acima agora roda a API em modo watch com rebuild e restart automatico quando houver mudancas em `artifacts/api-server/src`.

Suba o dashboard em outro terminal:

```bash
corepack pnpm dev:web
```

Acessos padrao:

- Dashboard: [http://localhost:20112](http://localhost:20112)
- API: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Liveness: [http://127.0.0.1:8080/api/healthz](http://127.0.0.1:8080/api/healthz)
- Readiness: [http://127.0.0.1:8080/api/readyz](http://127.0.0.1:8080/api/readyz)
- WebSocket: `ws://127.0.0.1:8080/api/ws`

`/api/healthz` valida que o processo HTTP esta vivo.

`/api/readyz` valida banco de dados e poller, sendo o endpoint recomendado para balanceador, proxy reverso e troubleshooting operacional.

## Roteiro operacional

1. Instale dependencias com `corepack pnpm install`.
2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`, portas e tuning de coleta.
3. Garanta que o PostgreSQL esta acessivel a partir do host da API.
4. Execute `corepack pnpm db:push` para aplicar o schema.
5. Inicie o ambiente com `corepack pnpm dev`.
6. Valide `GET /api/healthz` e `GET /api/readyz`.
7. Abra o dashboard e comece a cadastrar nos ou rodar discovery.

## Autenticacao do dashboard e da API

1. Aplique o schema do banco (`corepack pnpm db:push`) para criar as tabelas de autenticacao e definicoes.
2. No `.env`, defina `AUTH_ENABLED=true` e `AUTH_JWT_SECRET` com pelo menos 16 caracteres aleatorios.
3. Primeiro utilizador (com `auth_users` vazia ao arrancar a API):
   - **Predefinido**: se nao definir `AUTH_BOOTSTRAP_*`, a API cria **admin** com password **ChangeMeAdmin2026!** — altere logo apos o primeiro login.
   - Opcional: defina `AUTH_BOOTSTRAP_USERNAME` / `AUTH_BOOTSTRAP_PASSWORD` no `.env`, ou `npm run auth:create-user -- admin SuaPasswordForte`.
4. Reinicie a API. O dashboard passa a exigir login em `/login`. Utilizadores e opcoes administrativas ficam em `/settings`.
5. **Avatar**: no registo (se activo) ou em **Configuracoes → Utilizadores → O meu perfil**, pode definir um **emoji** ou uma **foto** (reduzida no browser); a imagem tem prioridade e aparece no canto superior ao lado do nome.

Comandos uteis:

```bash
npm run auth:create-user -- <username> <password>
npm run auth:reset
```

`auth:reset` remove utilizadores conforme o script de reset (ver comentarios em `.env.example`). LDAP e registo na pagina de login sao opcionais e estao documentados no mesmo ficheiro.

## Execucao para ambiente mais estavel

Valide o build completo:

```bash
corepack pnpm typecheck
corepack pnpm build
```

Suba os processos separadamente:

```bash
corepack pnpm start:api
corepack pnpm start:web
```

Checklist minimo de operacao:

- usar `NODE_ENV=production`
- monitorar `GET /api/readyz`
- validar `GET /api/poller/status`
- manter `DATABASE_URL` fora do Git
- revisar concorrencia de discovery e intervalos de polling antes de ambiente grande

## Docker Compose

Para subir PostgreSQL, API e dashboard em containers:

```bash
docker compose up --build
```

Servicos:

- `postgres`: banco de dados com volume persistente
- `api`: sobe a API, valida o banco e aplica `db:push` antes do start
- `web`: sobe o dashboard com proxy `/api` apontando para o servico `api`

Comandos uteis:

```bash
docker compose up --build
docker compose down
```

## PM2

Arquivo incluido:

- `ecosystem.config.cjs`

Uso:

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs
pm2 save
```

## systemd

Arquivos incluidos:

- `deploy/systemd/networksentinel-api.service`
- `deploy/systemd/networksentinel-web.service`

Fluxo sugerido em Linux:

1. Copiar o projeto para `/opt/networksentinel`
2. Ajustar `.env`
3. Executar `corepack pnpm install && corepack pnpm build && corepack pnpm db:push`
4. Copiar os arquivos `.service` para `/etc/systemd/system/`
5. Rodar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable networksentinel-api
sudo systemctl enable networksentinel-web
sudo systemctl start networksentinel-api
sudo systemctl start networksentinel-web
```

## Backup e restore

Backup do PostgreSQL:

```bash
corepack pnpm db:backup
```

Ou informando um caminho:

```bash
corepack pnpm db:backup backups/producao.dump
```

Restore:

```bash
corepack pnpm db:restore backups/producao.dump
```

Observacoes:

- os scripts usam `pg_dump` e `pg_restore`
- essas ferramentas precisam estar instaladas e no `PATH`
- a pasta `backups/` e ignorada no Git

## Modulos da interface

- `/login`: autenticacao do operador
- `/settings`: definicoes da aplicacao e gestao de utilizadores (conforme permissoes)
- `/`: dashboard executivo e operacional
- `/nodes`: inventario e cadastro de dispositivos
- `/nodes/:id`: detalhe tecnico do dispositivo
- `/discovery`: descoberta em sub-redes
- `/topology`: topologia e interligacoes
- `/alerts`: alertas e tratativas
- `/poller`: estado do motor de coleta
- `/netpath`: analise de caminho
- `/flows`: visao de fluxos

## Fluxo recomendado para primeiro uso

1. Ajuste o `.env`.
2. Execute o `push` do schema do banco.
3. Inicie API e dashboard.
4. Abra o dashboard.
5. Cadastre dispositivos manualmente ou use a pagina de descoberta.
6. Configure credenciais SNMP para ampliar o inventario e a telemetria.

## Novidades da versao

- **Autenticacao e seguranca**: login no dashboard (`/login`), JWT e cookie HttpOnly; API com gateway de auth quando `AUTH_ENABLED=true`; rotas `/api/auth/*`, definicoes e administracao de utilizadores em `/settings`; tabelas Drizzle `auth_users` e definicoes persistidas; scripts `npm run auth:create-user` e `npm run auth:reset`; LDAP opcional (variaveis em `.env.example`).
- descoberta com suporte a `CIDR`, range de IP e roteador principal
- limpeza de resultados de discovery para reexecutar coletas produtivas
- remocao em lote em `Network Nodes` com alternancia entre `Remove selected` e `Remove all`
- inventario tecnico ampliado com firmware, software, serial, service tag e sensores ambientais
- inventario fisico por componente com `ENTITY-MIB` para chassis, modulos, fontes e FANs
- biblioteca local de MIBs em `docs/mibs/` com catalogo por fabricante
- diagnostico SNMP por no com perfil aplicado, familia resolvida e OIDs de CPU tentados
- resolucao automatica de perfis SNMP por familia para ambientes mistos

## Checklist de validacao por fabricante

Use este checklist apos cadastrar as credenciais SNMP e aguardar alguns ciclos de polling.

### Cisco

- confirmar se o diagnostico SNMP resolveu a familia correta: `Cisco NX-OS`, `Cisco IOS/IOS-XE` ou `Cisco ASA/Firepower`
- validar `sysObjectID` e `sysDescr` na tela de detalhe do no
- confirmar leitura de `CPU`, `memoria`, interfaces e vizinhos `LLDP/CDP`
- verificar se firmware, serial e modulos aparecem no inventario tecnico/fisico

### Aruba / HPE

- confirmar se a familia caiu em `Aruba CX`, `ArubaOS-Switch/ProCurve` ou `HPE/Aruba Generic`
- validar se CPU vem por OID proprietario ou por `HOST-RESOURCES-MIB`
- conferir sensores de temperatura e FAN quando o equipamento expuser `ENTITY-SENSOR-MIB`
- revisar VLANs, MAC table e correlacao L2 nas portas

### Fortinet / FortiGate

- confirmar se a familia foi resolvida como `FortiGate`
- validar CPU e memoria no detalhe do no
- conferir `sysDescr`, versao de software e inventario tecnico
- revisar se a firewall expone sensores ambientais e interfaces via SNMP

### Dell

- confirmar se a familia foi resolvida como `Dell N-Series`, `Dell PowerConnect` ou `Dell Generic`
- se CPU continuar `null`, abrir o card de diagnostico e verificar quais OIDs foram tentados
- validar memoria, inventario tecnico e inventario fisico por componente
- conferir se os valores antigos zerados nao reaparecem no grafico

### Juniper, Arista, MikroTik, Palo Alto e demais

- conferir a familia resolvida no card de diagnostico SNMP
- validar se `CPU`, `memoria`, interfaces e sensores aparecem apos alguns ciclos de polling
- revisar `sysObjectID` e `sysDescr` para identificar se vale criar um perfil mais especifico
- se a familia cair em um perfil generico, usar o diagnostico do no para orientar novos OIDs

## Funcionalidades principais

### Dashboard

- visao geral de saude da rede
- metricas agregadas
- alertas ativos
- atualizacao em tempo real por WebSocket

### Inventario de dispositivos

- cadastro manual
- detalhe por dispositivo
- inventario tecnico com fabricante, modelo, firmware, serial e service tag
- sensores ambientais quando expostos por SNMP

### Descoberta

- scan de sub-redes
- concorrencia configuravel
- integracao com polling posterior

### Polling e telemetria

- ICMP para alcance e latencia
- SNMP para inventario e metricas
- CPU e memoria
- temperatura e FAN quando o equipamento expoe `ENTITY-SENSOR-MIB`
- interfaces, taxas e contadores

### Topologia

- correlacao LLDP/CDP
- animacao de fluxos no mapa
- visualizacao hierarquica
- apoio para entendimento dos enlaces

### L2 e operacao

- ARP table
- MAC forwarding database
- VLAN inventory
- correlacao de portas de acesso
- baseline e historico de mudancas

## Comandos uteis

Na raiz:

```bash
corepack pnpm dev
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm db:push
corepack pnpm db:backup
corepack pnpm db:restore backups/exemplo.dump
corepack pnpm docker:up
corepack pnpm docker:down
corepack pnpm typecheck
corepack pnpm build
npm run auth:create-user -- <user> <password>
npm run auth:reset
npm run cert:localhost
```

Banco:

```bash
corepack pnpm --filter @workspace/db run push
```

Validacao local:

```bash
corepack pnpm typecheck
corepack pnpm build
```

## Integracao continua

O repositorio inclui workflow de GitHub Actions em `.github/workflows/ci.yml` para:

- instalar dependencias
- executar `pnpm typecheck`
- executar `pnpm build`
- provisionar PostgreSQL temporario
- aplicar o schema com Drizzle
- subir a API e validar `/api/readyz`

O workflow roda em `push` para `main` e em `pull_request`.

## Troubleshooting

### Login com `admin` falha (credenciais invalidas ou volta ao login)

1. Na **mesma máquina onde corre a API**, execute `npm run auth:debug-users` — confirma se existe `admin`, se tem hash e se a password `ChangeMeAdmin2026!` bate certo com a base a que o `.env` aponta. Se aqui falhar, rode `npm run auth:reset` nessa máquina.
2. **Password predefinida** (primeiro utilizador / bootstrap): `ChangeMeAdmin2026!` — respeite maiúsculas e o `!` no fim. O utilizador é **`admin`** (minúsculas no login).
3. Se já existiam utilizadores na base antes do bootstrap, a password pode ser outra. Redefina com: `npm run auth:reset` (ou `npm run auth:create-user -- admin NovaPasswordForte123`).
4. Confirme `AUTH_ENABLED=true` e `AUTH_JWT_SECRET` (≥16 caracteres) no `.env` e reinicie a API.
5. Com a API actualizada, após uma tentativa de login falhada os **logs da API** indicam o motivo (utilizador inexistente nesta BD, sem password local, hash inválido, ou password errada).
6. **LDAP**: se `AUTH_LDAP_URL` estiver preenchido mas o servidor LDAP não estiver acessível, o login local deve funcionar na mesma (a API ignora erros de LDAP após tentar a password local). Se ainda falhar, comente temporariamente as variáveis `AUTH_LDAP_*` e reinicie.
7. **Dashboard em HTTPS** (`WEB_HTTPS=1`): o proxy Vite envia `X-Forwarded-Proto` para a API definir o cookie `ns_session` corretamente. Se usar **URL directa** da API no browser (`VITE_API_BASE_URL=http://127.0.0.1:8080`) com página em `https://localhost`, o cookie pode não acompanhar os pedidos — deixe `VITE_API_BASE_URL` vazio para usar o proxy `/api` no mesmo host.
8. Em último caso, defina `AUTH_COOKIE_SECURE=false` no `.env` da API (só desenvolvimento) se o cookie não for gravado.

### `pnpm` nao reconhecido

Use:

```bash
corepack enable
corepack pnpm install
```

### A API nao sobe por falta de porta

Verifique se `API_PORT` ja esta em uso e altere a variavel no `.env`.

### `readyz` retorna erro

Verifique:

- `DATABASE_URL`
- se o PostgreSQL esta acessivel
- se o poller foi iniciado
- se houve erro de bootstrap nos logs da API

### Discovery fica em fila ou falha apos restart

- a API agora limita execucoes paralelas por `DISCOVERY_MAX_PARALLEL_RUNS`
- requests pesados de discovery sao protegidos por rate limit
- se a API reiniciar no meio de uma descoberta, as execucoes antigas sao marcadas como interrompidas e devem ser reenviadas

### Backup ou restore falham

Confirme se `pg_dump` e `pg_restore` estao instalados e disponiveis no `PATH`.

### O dashboard abre, mas a API esta indisponivel

Confirme:

- API rodando na porta configurada
- `API_PROXY_TARGET` apontando para a API correta
- acesso ao healthcheck `/api/healthz`

### O inventario aparece incompleto

Campos como firmware, serial, service tag, temperatura e FAN dependem do equipamento expor essas informacoes por SNMP. Em alguns vendors ou modelos esses OIDs nao estao disponiveis.

### A descoberta ou coleta esta lenta

Revise:

- `DISCOVERY_HOST_CONCURRENCY`
- `DISCOVERY_MAX_HOSTS_PER_RUN`
- latencia da rede
- disponibilidade SNMP/ICMP nos dispositivos alvo

### Quero usar modo demo

Defina:

```env
ENABLE_DEMO_SEED=true
NETWORK_POLLING_MODE=simulated
```

## Build de producao

Para gerar build:

```bash
corepack pnpm build
```

O dashboard gera saida em `artifacts/npm-dashboard/dist/public` e a API gera saida em `artifacts/api-server/dist`.

## Seguranca

- nao versione o `.env`
- com autenticacao ativa, use `AUTH_JWT_SECRET` forte e rotacao periodica; em producao use HTTPS e `TRUST_PROXY` correto atras de reverse proxy
- nao publique comunidades SNMP reais no repositorio
- prefira credenciais dedicadas de leitura para SNMP

## Licenca

Este projeto esta licenciado sob a licenca MIT. Veja `LICENSE`.

## Colaboracao e roadmap

- guia para contribuidores: `CONTRIBUTING.md`
- backlog tecnico inicial: `docs/ROADMAP.md`
