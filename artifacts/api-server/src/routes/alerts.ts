import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable } from "@workspace/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

const router: IRouter = Router();

function describeAlert(alert: {
  type: string;
  message: string;
  severity: "critical" | "warning" | "info";
}) {
  const base = {
    category: "operational",
    typeLabel: alert.type,
    isHeuristic: false,
    recommendedAction: "Validar telemetria do dispositivo e executar troubleshooting operacional.",
    quickChecks: [
      "Confirmar se o evento ainda esta ativo no equipamento.",
      "Cruzar com mudancas recentes na rede.",
    ],
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

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(alertsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    res.json({
      alerts: alerts.map(a => ({
        id: a.id, nodeId: a.nodeId, nodeName: a.nodeName,
        severity: a.severity, type: a.type, message: a.message,
        acknowledged: a.acknowledged,
        createdAt: a.createdAt.toISOString(),
        acknowledgedAt: a.acknowledgedAt?.toISOString(),
        ...describeAlert({
          type: a.type,
          message: a.message,
          severity: a.severity,
        }),
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
