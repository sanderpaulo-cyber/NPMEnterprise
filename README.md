# NetworkSentinelPRO

Plataforma de monitoracao e operacao de rede com API Node.js/Express, dashboard React/Vite, persistencia em PostgreSQL e coleta por ICMP/SNMP.

O projeto foi organizado como monorepo `pnpm workspace` e hoje cobre:

- inventario de dispositivos de rede
- descoberta de hosts em sub-redes
- polling de saude e telemetria
- alertas operacionais
- topologia com correlacao LLDP/CDP
- metricas historicas de CPU, memoria, temperatura e FAN
- analise L2 com ARP, MAC table, VLANs e perfis de portas

## Arquitetura

- `artifacts/api-server`: API HTTP, WebSocket e motor de coleta
- `artifacts/npm-dashboard`: interface web operacional
- `lib/db`: schema Drizzle e conexao com PostgreSQL
- `lib/api-client-react`: client React gerado para parte da API
- `lib/api-zod`: contratos Zod usados na API

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
WEB_PORT=20112
API_PROXY_TARGET=http://127.0.0.1:8080
BASE_PATH=/

ENABLE_DEMO_SEED=false
NETWORK_POLLING_MODE=icmp
DISCOVERY_MAX_HOSTS_PER_RUN=4096
DISCOVERY_HOST_CONCURRENCY=24
LOG_LEVEL=info
```

### Variaveis de ambiente

- `DATABASE_URL`: string de conexao com o PostgreSQL
- `API_PORT`: porta da API
- `WEB_PORT`: porta do dashboard Vite
- `API_PROXY_TARGET`: alvo do proxy `/api` usado pelo dashboard
- `BASE_PATH`: base path da aplicacao web
- `ENABLE_DEMO_SEED`: popula dados demo se `true`
- `NETWORK_POLLING_MODE`: `simulated` para demo ou qualquer outro valor para coleta real
- `DISCOVERY_MAX_HOSTS_PER_RUN`: limite de IPs por execucao de descoberta
- `DISCOVERY_HOST_CONCURRENCY`: concorrencia da descoberta
- `LOG_LEVEL`: nivel de log da API

## Banco de dados

Crie o banco no PostgreSQL e depois aplique o schema:

```bash
corepack pnpm --filter @workspace/db run push
```

Se estiver usando o exemplo acima, o banco esperado e `networksentinel`.

## Como executar

Suba a API em um terminal:

```bash
corepack pnpm dev:api
```

Suba o dashboard em outro terminal:

```bash
corepack pnpm dev:web
```

Acessos padrao:

- Dashboard: [http://localhost:20112](http://localhost:20112)
- API: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Healthcheck: [http://127.0.0.1:8080/api/healthz](http://127.0.0.1:8080/api/healthz)
- WebSocket: `ws://127.0.0.1:8080/api/ws`

## Fluxo recomendado para primeiro uso

1. Ajuste o `.env`.
2. Execute o `push` do schema do banco.
3. Inicie API e dashboard.
4. Abra o dashboard.
5. Cadastre dispositivos manualmente ou use a pagina de descoberta.
6. Configure credenciais SNMP para ampliar o inventario e a telemetria.

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
corepack pnpm dev:api
corepack pnpm dev:web
corepack pnpm typecheck
corepack pnpm build
```

Banco:

```bash
corepack pnpm --filter @workspace/db run push
```

## Troubleshooting

### `pnpm` nao reconhecido

Use:

```bash
corepack enable
corepack pnpm install
```

### A API nao sobe por falta de porta

Verifique se `API_PORT` ja esta em uso e altere a variavel no `.env`.

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
- nao publique comunidades SNMP reais no repositorio
- prefira credenciais dedicadas de leitura para SNMP

## Proximos passos recomendados

- adicionar um playbook inicial de descoberta e cadastro
- documentar perfis SNMP especificos por fabricante
