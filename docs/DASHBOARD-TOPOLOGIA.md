# Topology Map — documentação de alterações e passos

Este documento regista as melhorias à página **Topology Map** (`/topology`) do dashboard, à API de topologia e ao layout que as suporta, incluindo a ordem lógica de implementação e como usar.

## Resumo

- **API**: cada nó expõe `subnetPrefixLength` derivado do CIDR do scope de descoberta (`network_scopes`), para o mapa respeitar redes `/8`, `/16`, `/24`, etc.
- **Layout**: cadeia flex com `min-h-0` no contentor principal para o mapa poder ocupar a altura útil real.
- **Área do mapa**: redimensionável por barra (arrastar), setas (clique), duplo clique na barra (repor); preferência em `sessionStorage`.
- **Ecrã inteiro**: modo imersivo em camada fixa (`portal` para `document.body`), **ESC** ou **Fechar** para voltar; `zoomToFit` após entrar.

---

## Passos de implementação (ordem registada)

### 1. Prefixo L3 por scope (API)

**Objetivo:** deixar de assumir sempre `/24` no agrupamento lógico da topologia.

**Passos:**

1. Em `artifacts/api-server/src/routes/topology.ts`, importar `networkScopesTable`.
2. Carregar scopes em paralelo com nós e arestas (`Promise.all`).
3. Implementar `parseCidrPrefixLength(cidr)` para IPv4 (`/0`–`/32`).
4. Construir `Map<scopeId, prefixo>` com omissão **24** se não houver CIDR válido.
5. Para cada nó na resposta JSON, definir `subnetPrefixLength` com base em `discoveryScopeId` e nesse mapa.

**Ficheiro:** `artifacts/api-server/src/routes/topology.ts`

---

### 2. Segmentos e LPM no grafo (dashboard)

**Objetivo:** chaves de rede canónicas por prefixo e encaminhamento de gateway/concentrador com prefixo mais longo que contém o IP (LPM).

**Passos:**

1. Estender `TopologyNodeData` com `subnetPrefixLength?: number`.
2. Implementar `parseIpv4ToInt`, `getNetworkSegmentKey(ip, prefix)`, `parseSegmentKey`, `ipv4InPrefix`.
3. Substituir a chave fixa “3 octetos” por `getNetworkSegmentKey` por nó.
4. Implementar `findGatewayForNode` e `findConcentratorsForNode` (LPM sobre os mapas de segmento).
5. Usar `sameL3SiteAsRoot` com `min(prefixo nó, prefixo raiz)` na ligação à árvore.
6. Tooltip do nó: linha “Mapa L3” com prefixo e segmento.
7. Texto de ajuda na página sobre scopes e `/24` por omissão em ranges sem CIDR.

**Ficheiro:** `artifacts/npm-dashboard/src/pages/topology.tsx`

---

### 3. Altura útil e flex (layout)

**Objetivo:** o mapa deixar de ficar “preso” por falta de `min-h-0` na coluna flex.

**Passos:**

1. No contentor da página em `layout.tsx`, usar `flex min-h-0 flex-1 flex-col` com `overflow-y-auto`.
2. No wrapper dos `children`, usar `flex h-full min-h-0 w-full flex-col`.

**Ficheiro:** `artifacts/npm-dashboard/src/components/layout.tsx`

---

### 4. Área do mapa dimensionável

**Passos:**

1. Substituir dimensões fixas `window.innerWidth/Height` por `ResizeObserver` no contentor do canvas (`graphHostRef`).
2. Raiz da página de topologia: `flex min-h-0 flex-1 flex-col` (sem `100dvh` fixo como única fonte de altura).
3. Estado `topPanelPx` com limites `TOP_PANEL_MIN`, `GRAPH_AREA_MIN` e `clampTopPanel`.
4. `sessionStorage` (`npm-enterprise.topology.topPanelPx`) para persistir entre recargas na sessão.
5. Barra com `GripHorizontal`, setas, duplo clique para repor `TOP_PANEL_DEFAULT`.
6. Efeito de sincronização com `ResizeObserver` em `pageRef` e dependência `isLoading` (e mais tarde `immersiveMap`) para não medir antes do `pageRef` existir.

**Ficheiro:** `artifacts/npm-dashboard/src/pages/topology.tsx`

---

### 5. Modo ecrã inteiro e tecla ESC

**Passos:**

1. Estado `immersiveMap`.
2. `createPortal(..., document.body)` com `fixed inset-0 z-[400]`, barra superior (título, ESC, Repor layout, Fechar).
3. Função `renderGraph()` única para o `ForceGraph2D` (vista normal vs portal).
4. `useEffect`: com `immersiveMap` ativo, `keydown` em capture para `Escape`, `document.body.style.overflow = 'hidden'`, cleanup ao sair.
5. Pausar sincronização de `topPanelPx` quando `immersiveMap` (evitar `pageRef` ausente).
6. `ResizeObserver` do canvas com dependência `immersiveMap` para redimensionar ao mudar de modo.
7. `setTimeout` + `zoomToFit` após entrar no modo imersivo.
8. Botão **Maximize2** na barra de redimensionamento para entrar no modo.

**Ficheiros:** `artifacts/npm-dashboard/src/pages/topology.tsx` (import `createPortal` de `react-dom`).

---

## Ficheiros alterados (nesta entrega Git)

| Ficheiro | Alteração |
|----------|-----------|
| `artifacts/api-server/src/routes/topology.ts` | `subnetPrefixLength`, scopes e parse de CIDR |
| `artifacts/npm-dashboard/src/components/layout.tsx` | Flex `min-h-0`, wrapper `h-full` para rotas |
| `artifacts/npm-dashboard/src/pages/topology.tsx` | L3, resize, imersivo, ESC, portal |

---

## Utilização (operador)

1. **Ajustar altura** do bloco de título/KPIs vs mapa: arrastar a barra tracejada ou usar setas **↑** / **↓**.
2. **Repor** altura padrão do painel superior: duplo clique na barra central.
3. **Mapa em ecrã inteiro**: botão com ícone de maximizar na mesma barra.
4. **Sair do ecrã inteiro**: tecla **ESC** ou **Fechar** na barra escura superior.
5. **Repor layout** dos nós: botão existente (normal e modo imersivo).

---

## Notas técnicas

- Scopes **apenas com intervalo IP** (sem CIDR) continuam a usar **/24** por omissão no mapa; para `/16` ou outros, defina CIDR no scope de descoberta.
- O modo imersivo **desmonta** a árvore normal da página e renderiza o grafo só no portal; posições persistidas em memória (`nodePositionsRef`) mantêm-se no mesmo ciclo de vida do componente.
- **ESC** em capture evita que outros handlers consumam o evento antes de fechar o overlay.

---

## Como subir estas mudanças (Git)

Na raiz do repositório:

```bash
git add artifacts/api-server/src/routes/topology.ts \
        artifacts/npm-dashboard/src/components/layout.tsx \
        artifacts/npm-dashboard/src/pages/topology.tsx \
        docs/DASHBOARD-TOPOLOGIA.md \
        README.md
git commit -m "docs(topology): API L3 por scope, layout flex, resize e modo imersivo"
git push origin main
```

(Ajuste o nome do ramo se não for `main`.)
