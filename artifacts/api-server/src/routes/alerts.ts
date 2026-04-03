import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, nodesTable } from "@workspace/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

const router: IRouter = Router();

type NodeContext = {
  id: string;
  ipAddress: string;
  type: "router" | "switch" | "firewall" | "server" | "unknown";
  vendor: string | null;
  model: string | null;
  firmwareVersion: string | null;
  softwareVersion: string | null;
  hardwareRevision: string | null;
  serialNumber: string | null;
  serviceTag: string | null;
  sysDescription: string | null;
};

type CommandBlock = {
  title: string;
  commands: string[];
};

function normalizeVendor(node?: NodeContext | null) {
  const text = `${node?.vendor ?? ""} ${node?.sysDescription ?? ""}`.toLowerCase();
  if (text.includes("forti")) return "fortinet";
  if (text.includes("cisco")) return "cisco";
  if (text.includes("aruba") || text.includes("procurve") || text.includes("hpe")) return "aruba";
  if (text.includes("juniper") || text.includes("junos")) return "juniper";
  if (text.includes("mikrotik") || text.includes("routeros")) return "mikrotik";
  if (text.includes("dell")) return "dell";
  if (node?.type === "server") return "linux";
  return "generic";
}

function extractInterfaceHint(message: string) {
  const match =
    message.match(/interface\s+([A-Za-z0-9\/\.\-_:]+)/i) ??
    message.match(/porta\s+([A-Za-z0-9\/\.\-_:]+)/i);
  return match?.[1] ?? "<interface>";
}

function buildInventoryContext(node?: NodeContext | null) {
  return {
    ipAddress: node?.ipAddress ?? null,
    vendor: node?.vendor ?? null,
    model: node?.model ?? null,
    firmwareVersion: node?.firmwareVersion ?? null,
    softwareVersion: node?.softwareVersion ?? null,
    hardwareRevision: node?.hardwareRevision ?? null,
    serialNumber: node?.serialNumber ?? null,
    serviceTag: node?.serviceTag ?? null,
  };
}

function buildCollectionSources(node?: NodeContext | null) {
  const sources = [
    "sysDescr via SNMP (1.3.6.1.2.1.1.1.0) para descricao do sistema e, em muitos vendors, versao base do software.",
    "ENTITY-MIB para fabricante, modelo, serial, hardware revision e, quando suportado, firmware/software revision do equipamento.",
    "Correlacao por perfil de vendor usando sysDescr/sysObjectID para interpretar os OIDs mais provaveis de cada familia.",
  ];
  if (!node?.firmwareVersion && !node?.softwareVersion) {
    sources.push(
      "Neste no, firmware/software pode nao estar exposto pelo vendor em SNMP; nesse caso a plataforma depende de sysDescr e inventario fisico parcial.",
    );
  }
  return sources;
}

function buildResolutionSequence(alert: {
  type: string;
  message: string;
  severity: "critical" | "warning" | "info";
}) {
  const iface = extractInterfaceHint(alert.message);
  if (alert.type === "node_down") {
    return [
      "Confirmar se a indisponibilidade ainda esta ativa por ping, rota e outra origem de monitoracao.",
      "Validar energia, console, stack, HA ou reboot recente do equipamento.",
      "Verificar se o plano de gerenciamento ainda tem rota, ACL e reachability ate o IP monitorado.",
      "Se o equipamento voltou, correlacionar logs e causa raiz antes de encerrar o incidente.",
    ];
  }
  if (alert.type === "interface_down") {
    return [
      `Validar se ${iface} deveria estar em producao ou se faz parte de uma mudanca planejada.`,
      "Conferir admin state, oper state, negociacao, LACP e counters de erro.",
      "Checar cabo, fibra, transceiver e o peer remoto da conexao.",
      "Normalizar o estado da interface e acompanhar se o flap volta a ocorrer.",
    ];
  }
  if (alert.type === "interface_high_util") {
    return [
      `Confirmar se a alta utilizacao em ${iface} e sustentada ou apenas burst pontual.`,
      "Verificar top talkers, backup, replicacao, fila/QoS e trafego leste-oeste.",
      "Correlacionar com perda, latencia, drops e aumento de CPU/control plane.",
      "Se recorrente, replanejar capacidade, agregacao ou politica de trafego.",
    ];
  }
  if (alert.type === "cpu_high" || alert.type === "mem_high") {
    return [
      "Comparar o valor atual com o historico recente para separar pico pontual de saturacao sustentada.",
      "Identificar processo, feature, daemon ou plano de controle responsavel pelo consumo.",
      "Correlacionar com mudancas, flaps, storms, rotas, VPN, inspeção ou backup.",
      "Aplicar mitigacao e acompanhar se o consumo volta ao baseline.",
    ];
  }
  if (alert.type === "latency_high" || alert.type === "packet_loss") {
    return [
      "Executar testes fim a fim de latencia/perda por mais de uma origem.",
      "Avaliar interfaces do caminho, filas, drops, QoS e saturacao.",
      "Validar o hop onde a degradacao comeca e correlacionar com eventos de uplink.",
      "Aplicar ajuste no caminho ou na capacidade e repetir os testes.",
    ];
  }
  if (alert.type.startsWith("l2_port_risk_") || alert.type === "l2_port_mac_churn" || alert.type === "l2_port_profile_flap") {
    return [
      "Abrir o detalhe do no e validar a classificacao da porta na aba Layer 2 / Access Ports.",
      "Conferir MACs, VLANs, role da porta, historico e comportamento esperado do ponto.",
      "Verificar se ha bridge indevida, switch nao autorizado, loop ou mudanca fisica recente.",
      "Somente escalar apos confirmar que o risco nao e um comportamento legitimo do ambiente.",
    ];
  }
  return [
    "Confirmar se o alerta ainda esta ativo no equipamento ou no caminho monitorado.",
    "Correlacionar com mudancas recentes, telemetria e outros alertas simultaneos.",
    "Executar troubleshooting no dominio afetado antes de encerrar o evento.",
  ];
}

function buildCommandBlocks(
  family: string,
  alert: { type: string; message: string },
  node?: NodeContext | null,
): CommandBlock[] {
  const target = node?.ipAddress ?? "<ip-do-no>";
  const iface = extractInterfaceHint(alert.message);
  const generic = [
    {
      title: "Validacao inicial",
      commands: [`ping ${target}`, `traceroute ${target}`],
    },
  ];

  if (family === "fortinet") {
    if (alert.type === "cpu_high" || alert.type === "mem_high") {
      return [
        {
          title: "Saude do appliance",
          commands: ["get system performance status", "diagnose sys top-summary"],
        },
        {
          title: "Processos e logs",
          commands: ["diagnose sys top 5 20", "execute log filter category 0", "execute log display"],
        },
      ];
    }
    if (alert.type === "interface_down" || alert.type === "interface_high_util") {
      return [
        {
          title: "Interface e NIC",
          commands: [`get system interface | grep -f ${iface}`, `diagnose hardware deviceinfo nic ${iface}`],
        },
        {
          title: "Contadores e trafego",
          commands: ["diagnose netlink interface list", `diagnose sniffer packet any "host ${target}" 4 10`],
        },
      ];
    }
    return [
      ...generic,
      {
        title: "Status geral FortiGate",
        commands: ["get system status", "get router info routing-table all", "diagnose debug crashlog read"],
      },
    ];
  }

  if (family === "juniper") {
    return alert.type === "interface_down" || alert.type === "interface_high_util"
      ? [
          {
            title: "Interface e erros",
            commands: [`show interfaces ${iface} extensive`, "show lacp interfaces", "show log messages | last 50"],
          },
        ]
      : [
          {
            title: "Saude e roteamento",
            commands: ["show chassis routing-engine", "show system processes extensive", "show route summary"],
          },
          ...generic,
        ];
  }

  if (family === "mikrotik") {
    return alert.type === "interface_down" || alert.type === "interface_high_util"
      ? [
          {
            title: "Porta e trafego",
            commands: [
              `/interface ethernet monitor ${iface} once`,
              `/interface print detail where name=${iface}`,
              `/tool torch interface=${iface}`,
            ],
          },
        ]
      : [
          {
            title: "CPU, memoria e rotas",
            commands: ["/system resource print", "/tool profile", "/ip route print detail"],
          },
          ...generic,
        ];
  }

  if (family === "linux") {
    return alert.type === "cpu_high" || alert.type === "mem_high"
      ? [
          {
            title: "Recursos do host",
            commands: ["top -H", "free -m", "vmstat 1 5", "journalctl -p warning -n 100"],
          },
        ]
      : [
          {
            title: "Rede no host",
            commands: [`ip addr show ${iface}`, `ip -s link show ${iface}`, `ethtool ${iface}`, `mtr -rw ${target}`],
          },
        ];
  }

  if (family === "cisco" || family === "aruba" || family === "dell") {
    if (alert.type === "cpu_high" || alert.type === "mem_high") {
      return [
        {
          title: "Processos e memoria",
          commands: ["show processes cpu sorted", "show processes memory sorted", "show logging | last 50"],
        },
        {
          title: "Estado geral",
          commands: ["show version", "show environment all", "show platform health"],
        },
      ];
    }
    if (alert.type === "interface_down" || alert.type === "interface_high_util") {
      return [
        {
          title: "Porta afetada",
          commands: [
            `show interface ${iface}`,
            `show interface ${iface} counters errors`,
            `show interfaces status | include ${iface}`,
          ],
        },
        {
          title: "Peer e agregacao",
          commands: ["show cdp neighbors detail", "show lldp neighbors detail", "show lacp neighbor"],
        },
      ];
    }
    if (alert.type === "latency_high" || alert.type === "packet_loss" || alert.type === "node_down") {
      return [
        {
          title: "Caminho e reachability",
          commands: [`ping ${target} repeat 10`, `traceroute ${target}`, `show ip route ${target}`],
        },
        {
          title: "Logs e ambiente",
          commands: ["show logging | last 50", "show version", "show environment all"],
        },
      ];
    }
  }

  return [
    ...generic,
    {
      title: "Comandos genericos no equipamento",
      commands: [
        "show version",
        "show interfaces",
        "show logging | last 50",
        "show processes cpu",
        "show memory",
      ],
    },
  ];
}

function describeAlert(
  alert: {
    type: string;
    message: string;
    severity: "critical" | "warning" | "info";
  },
  node?: NodeContext | null,
) {
  const family = normalizeVendor(node);
  const base = {
    category: "operational",
    typeLabel: alert.type,
    isHeuristic: false,
    recommendedAction: "Validar telemetria do dispositivo e executar troubleshooting operacional.",
    quickChecks: [
      "Confirmar se o evento ainda esta ativo no equipamento.",
      "Cruzar com mudancas recentes na rede.",
    ],
    inventoryContext: buildInventoryContext(node),
    collectionSummary:
      "Versao, firmware, modelo e serial sao obtidos principalmente por SNMP via sysDescr e ENTITY-MIB, com fallback por heuristica de vendor quando o equipamento nao expoe todos os OIDs.",
    collectionSources: buildCollectionSources(node),
    resolutionSequence: buildResolutionSequence(alert),
    suggestedCommands: buildCommandBlocks(family, alert, node),
  };

  if (alert.type === "node_down") {
    return {
      ...base,
      category: "availability",
      typeLabel: "Node Down",
      recommendedAction: "Validar energia, conectividade IP, rota e acesso de gerenciamento do dispositivo.",
      quickChecks: [
        "Testar ping e rota ate o IP do equipamento.",
        "Validar se houve reboot, queda de energia ou manutencao.",
        "Confirmar reachability por outra origem da rede.",
      ],
    };
  }
  if (alert.type === "interface_down") {
    return {
      ...base,
      category: "interface",
      typeLabel: "Interface Down",
      recommendedAction: "Confirmar se a interface deveria estar ativa e validar negociacao, fibra/cabo, LACP ou desligamento administrativo.",
      quickChecks: [
        "Executar show interface / verificar counters.",
        "Validar administratively up versus oper down.",
        "Checar cabo, transceiver e peer remoto.",
      ],
    };
  }
  if (alert.type === "interface_high_util") {
    return {
      ...base,
      category: "capacity",
      typeLabel: "High Interface Utilization",
      recommendedAction: "Verificar saturacao, bursts, QoS e necessidade de balanceamento/capacidade adicional.",
      quickChecks: [
        "Validar top talkers e filas/QoS.",
        "Comparar com baseline da porta.",
        "Checar se ha backup, replicacao ou trafego anomalo.",
      ],
    };
  }
  if (alert.type.startsWith("l2_port_risk_")) {
    return {
      ...base,
      category: "layer2-risk",
      typeLabel: "L2 Risk",
      isHeuristic: true,
      recommendedAction: "Tratar como indicio operacional: validar a porta, MAC table, VLANs, topologia e comportamento esperado antes de escalar.",
      quickChecks: [
        "Abrir o detalhe do no e revisar Correlated Access Ports.",
        "Confirmar role da porta, numero de MACs e VLANs aprendidas.",
        "Validar se a porta pertence a uplink, trunk ou edge conhecido.",
      ],
    };
  }
  if (alert.type === "l2_port_mac_churn") {
    return {
      ...base,
      category: "layer2-anomaly",
      typeLabel: "MAC Churn",
      isHeuristic: true,
      recommendedAction: "Validar instabilidade de host/bridge na porta, flapping de conexao ou troca intensa de endpoints.",
      quickChecks: [
        "Comparar historico recente da porta.",
        "Checar STP, loops e bridge nao autorizada.",
        "Validar se houve manutencao, mover de patch ou troca de equipamento.",
      ],
    };
  }
  if (alert.type === "l2_port_profile_flap") {
    return {
      ...base,
      category: "layer2-anomaly",
      typeLabel: "L2 Profile Flap",
      isHeuristic: true,
      recommendedAction: "Investigar mudanca recorrente de perfil da porta e validar se ela esta sendo usada fora do papel esperado.",
      quickChecks: [
        "Comparar baseline versus historico recente.",
        "Validar role esperado da interface.",
        "Checar VLANs aprendidas e mudancas frequentes.",
      ],
    };
  }
  if (alert.type === "cpu_high" || alert.type === "mem_high") {
    return {
      ...base,
      category: "resource",
      typeLabel: alert.type === "cpu_high" ? "High CPU" : "High Memory",
      recommendedAction: "Validar processo/feature responsavel e confirmar se ha impacto operacional.",
      quickChecks: [
        "Checar processos, control plane ou features recentes.",
        "Comparar com historico do dispositivo.",
        "Correlacionar com trafego, flaps ou eventos simultaneos.",
      ],
    };
  }
  if (alert.type === "latency_high" || alert.type === "packet_loss") {
    return {
      ...base,
      category: "performance",
      typeLabel: alert.type === "latency_high" ? "High Latency" : "Packet Loss",
      recommendedAction: "Validar qualidade do caminho, congestionamento e perda entre origem e destino monitorado.",
      quickChecks: [
        "Executar testes ICMP/trace a partir de outro ponto.",
        "Comparar com uso das interfaces do caminho.",
        "Correlacionar com eventos de uplink ou fila/QoS.",
      ],
    };
  }

  return base;
}

router.get("/", async (req, res): Promise<void> => {
  try {
    const { severity, nodeId, type, acknowledged, limit = "50" } = req.query as Record<string, string>;
    const conditions = [];
    if (severity) conditions.push(eq(alertsTable.severity, severity as "critical" | "warning" | "info"));
    if (nodeId) conditions.push(eq(alertsTable.nodeId, nodeId));
    if (type) conditions.push(eq(alertsTable.type, type));
    if (acknowledged !== undefined) conditions.push(eq(alertsTable.acknowledged, acknowledged === "true"));

    const alerts = await db.select().from(alertsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(alertsTable.createdAt))
      .limit(parseInt(limit, 10));

    const nodeIds = Array.from(new Set(alerts.map((alert) => alert.nodeId)));
    const nodes =
      nodeIds.length > 0
        ? await db
            .select({
              id: nodesTable.id,
              ipAddress: nodesTable.ipAddress,
              type: nodesTable.type,
              vendor: nodesTable.vendor,
              model: nodesTable.model,
              firmwareVersion: nodesTable.firmwareVersion,
              softwareVersion: nodesTable.softwareVersion,
              hardwareRevision: nodesTable.hardwareRevision,
              serialNumber: nodesTable.serialNumber,
              serviceTag: nodesTable.serviceTag,
              sysDescription: nodesTable.sysDescription,
            })
            .from(nodesTable)
            .where(inArray(nodesTable.id, nodeIds))
        : [];
    const nodeById = new Map(nodes.map((node) => [node.id, node] as const));

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(alertsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      alerts: alerts.map(a => ({
        id: a.id, nodeId: a.nodeId, nodeName: a.nodeName,
        severity: a.severity, type: a.type, message: a.message,
        acknowledged: a.acknowledged,
        createdAt: a.createdAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
        ...describeAlert(
          {
            type: a.type,
            message: a.message,
            severity: a.severity,
          },
          nodeById.get(a.nodeId),
        ),
      })),
      total: count,
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to list alerts");
    res.status(500).json({ error: "Failed to list alerts" });
    return;
  }
});

router.post("/acknowledge", async (req, res): Promise<void> => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.filter((value: unknown): value is string => typeof value === "string")
      : [];
    if (ids.length === 0) {
      res.status(400).json({ error: "ids is required" });
      return;
    }
    const updated = await db
      .update(alertsTable)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(inArray(alertsTable.id, ids))
      .returning();
    res.json({
      updated: updated.length,
      alerts: updated.map((item) => ({
        id: item.id,
        acknowledged: item.acknowledged,
        acknowledgedAt: item.acknowledgedAt?.toISOString(),
      })),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to bulk acknowledge alerts");
    res.status(500).json({ error: "Failed to bulk acknowledge alerts" });
    return;
  }
});

router.post("/:alertId/acknowledge", async (req, res): Promise<void> => {
  try {
    const { alertId } = req.params;
    const [updated] = await db.update(alertsTable)
      .set({ acknowledged: true, acknowledgedAt: new Date() })
      .where(eq(alertsTable.id, alertId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }
    res.json({
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      acknowledgedAt: updated.acknowledgedAt?.toISOString(),
    });
    return;
  } catch (err) {
    req.log.error({ err }, "Failed to acknowledge alert");
    res.status(500).json({ error: "Failed to acknowledge alert" });
    return;
  }
});

export default router;
