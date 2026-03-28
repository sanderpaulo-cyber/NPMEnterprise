# Biblioteca de MIBs

Esta pasta centraliza o catalogo de MIBs e OIDs usados pelo `NetworkSentinelPRO`.

## Objetivo

- mapear fabricantes por `sysObjectID`
- registrar quais MIBs padrao e proprietarias sao usadas por perfil
- facilitar expansao de novos vendors e modelos
- manter um local unico para anexar MIBs oficiais exportadas pelos fabricantes

## Como a aplicacao usa isso

- o runtime usa o catalogo em `artifacts/api-server/src/lib/snmp-mib-profiles.ts`
- o indice legivel desta pasta documenta os vendors suportados
- quando o equipamento nao expoe OIDs proprietarios, a coleta cai para:
  - `ENTITY-MIB`
  - `ENTITY-SENSOR-MIB`
  - `HOST-RESOURCES-MIB`
  - `IF-MIB`
  - `LLDP-MIB`
  - `Q-BRIDGE-MIB`

## Estrutura sugerida

- `library-index.json`: indice de fabricantes, familias e OIDs principais
- `vendors/<fabricante>/`: local para armazenar MIBs oficiais `.mib` ou `.txt`

## Observacoes

- nem todos os MIBs oficiais podem ser redistribuidos livremente; por isso a pasta foi preparada para receber os arquivos conforme a politica de cada fabricante
- o sistema ja possui perfis iniciais para Cisco, Juniper, Fortinet, HPE/Aruba, Dell, Arista, MikroTik e Palo Alto
