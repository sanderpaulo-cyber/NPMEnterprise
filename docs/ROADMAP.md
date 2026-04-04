# Roadmap Tecnico

Este backlog organiza os proximos temas de evolucao do NetworkSentinelPRO. A ideia e servir como base para futuras issues e milestones.

## Entregas recentes (ja no codigo)

Resumo das modificacoes ja integradas; detalhe de setup em `README.md` (secao **Autenticacao do dashboard e da API**) e variaveis em `.env.example`.

| Area | O que foi adicionado |
|------|----------------------|
| API | Gateway de autenticacao quando `AUTH_ENABLED=true`; rotas `/api/auth/*`; excecoes para health/readiness; WebSocket alinhado com o mesmo modelo de sessao/token |
| Dashboard | Paginas `/login` e `/settings`; fluxo de sessao (JWT + cookie HttpOnly); painel de administracao de utilizadores |
| Base de dados | Schema Drizzle para utilizadores (`lib/db/src/schema/auth.ts`) e definicoes (`lib/db/src/schema/settings.ts`) |
| Operacao | Scripts `npm run auth:create-user`, `npm run auth:reset`; opcional LDAP (`AUTH_LDAP_*`); HTTPS local do Vite documentado no `.env.example` |
| Bibliotecas | `lib/api-client-react` com suporte a pedidos autenticados onde aplicavel |

Itens abaixo continuam em aberto ou so parcialmente cobertos (ex.: RBAC por papel fino, auditoria).

## Prioridade alta

### 1. Credenciais SNMP por fabricante e perfil

Objetivo:

- melhorar taxa de coleta de firmware, serial, sensores e inventario

Entregas:

- perfis Cisco, HPE/Aruba, Dell, Fortinet e MikroTik
- fallback por OID padrao + vendor-specific
- documentacao de compatibilidade por fabricante

### 2. Descoberta guiada e onboarding operacional

Objetivo:

- reduzir friccao para primeiro uso

Entregas:

- wizard inicial de descoberta
- validacao de sub-redes e credenciais
- resumo de cobertura antes de iniciar scan

### 3. Alertas com workflow operacional

Objetivo:

- aproximar o produto de um fluxo real de NOC

Entregas:

- estados de tratamento
- responsavel
- comentarios
- historico por alerta
- SLA e aging

## Prioridade media

### 4. Topologia com mais contexto de enlaces

Objetivo:

- aprofundar diagnostico de conectividade

Entregas:

- identificacao de agregacao/LACP
- destaque de enlaces degradados
- agrupamento por camada ou site
- filtros de protocolo e status

### 5. Observabilidade do poller

Objetivo:

- dar visibilidade sobre desempenho e gargalos internos

Entregas:

- filas, tempos de polling e taxa por segundo
- erros por protocolo
- retries e timeouts detalhados
- dashboard tecnico do coletor

### 6. Seguranca e governanca

Objetivo:

- preparar o projeto para ambientes mais formais

Entregas:

- **parcial**: login obrigatorio no dashboard e API protegida quando `AUTH_ENABLED=true`; gestao de utilizadores locais; LDAP opcional; segredo JWT e cookies documentados
- perfis de acesso por papel (RBAC) alem de admin/operador basico
- trilha de auditoria
- mascaramento de segredos
- hardening de configuracao

## Prioridade estrutural

### 7. Testes automatizados orientados a runtime

Objetivo:

- reduzir regressao em rotas, polling e bootstrap

Entregas:

- testes de healthcheck e rotas principais
- testes de polling simulado
- fixtures de dados SNMP
- smoke tests de dashboard

### 8. Publicacao e entrega

Objetivo:

- simplificar distribuicao e reproducao

Entregas:

- compose para app + banco
- perfil de ambiente de homologacao
- release notes automatizadas
- badges de versao e status

## Backlog de experiencia do produto

### 9. Dashboard executivo

- KPIs por site
- tendencias de disponibilidade
- resumo de incidentes
- ranking de riscos

### 10. Inventario enriquecido

- datas relevantes do ativo
- warranty/support status
- campos para CMDB
- exportacao CSV/JSON

### 11. Integracoes

- webhook para incidentes
- e-mail ou chat ops
- ITSM externo
- Sentry ou observabilidade complementar

## Sugestao de primeiras issues

- `Adicionar smoke tests HTTP para /api/healthz, /api/auth/login e /api/nodes (com e sem AUTH_ENABLED)`
- `Criar wizard inicial de descoberta de rede`
- `Implementar perfis SNMP vendor-specific`
- `Adicionar workflow operacional aos alertas`
- `Documentar matriz de compatibilidade por fabricante`
