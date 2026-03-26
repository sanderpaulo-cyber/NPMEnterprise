import { db } from "@workspace/db";
import { nodesTable, topologyEdgesTable, flowsTable, alertsTable, metricsTable } from "@workspace/db/schema";
import { randomUUID } from "crypto";
import { logger } from "./logger";

const NODE_TYPES = ["router", "switch", "firewall", "server", "unknown"] as const;
const STATUSES = ["up", "up", "up", "up", "warning", "down"] as const;
const VENDORS = ["Cisco", "Juniper", "Arista", "Palo Alto", "HPE", "Extreme Networks"];
const MODELS = {
  router: ["ASR 9000", "CRS-1", "MX960", "7750 SR"],
  switch: ["Catalyst 9300", "Nexus 9000", "EX9200", "DCS-7050TX"],
  firewall: ["PA-5000", "ASA 5500", "SRX5800", "Fortinet 600D"],
  server: ["UCS C220", "ProLiant DL380", "PowerEdge R740", "PRIMERGY RX4770"],
  unknown: ["Unknown-1"],
};
const LOCATIONS = ["SP-DC1-CORE", "SP-DC2-DIST", "SP-POP-RJ", "SP-POP-BH", "SP-EDGE-01", "SP-EDGE-02", "LATAM-MX-01"];

function randomEl<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomIp(): string {
  return `10.${randomEl([1,2,3,4,5,10,20,100])}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 254) + 1}`;
}

function randomFloat(min: number, max: number): number {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

export async function seedDatabase() {
  const existingNodes = await db.select().from(nodesTable).limit(1);
  if (existingNodes.length > 0) {
    logger.info("Database already seeded, skipping");
    return;
  }

  logger.info("Seeding database with sample NPM data...");

  const nodeCount = 50;
  const nodes = [];

  for (let i = 0; i < nodeCount; i++) {
    const type = randomEl(NODE_TYPES);
    const vendor = randomEl(VENDORS);
    const models = MODELS[type];
    const status = randomEl(STATUSES);
    const node = {
      id: randomUUID(),
      name: `${type.toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
      ipAddress: `10.${Math.floor(i / 30) + 1}.${Math.floor(i / 10) + 1}.${(i % 254) + 1}`,
      type,
      status,
      vendor,
      model: randomEl(models as string[]),
      location: randomEl(LOCATIONS),
      sysDescription: `${vendor} ${type} running IOS XE 17.x / JunOS 21.x`,
      uptime: Math.floor(Math.random() * 9999999),
      cpuUsage: status === "down" ? 0 : randomFloat(2, 95),
      memUsage: status === "down" ? 0 : randomFloat(20, 90),
      interfaceCount: type === "switch" ? 48 : type === "router" ? 24 : 8,
      snmpVersion: "v2c" as "v2c",
      snmpCommunity: "public",
      lastPolled: new Date(),
    };
    nodes.push(node);
  }

  await db.insert(nodesTable).values(nodes);
  logger.info({ count: nodes.length }, "Nodes seeded");

  const edges = [];
  const coreNodes = nodes.filter(n => n.type === "router").slice(0, 5);
  const distNodes = nodes.filter(n => n.type === "switch").slice(0, 10);

  for (const distNode of distNodes) {
    const coreNode = coreNodes[Math.floor(Math.random() * coreNodes.length)];
    if (coreNode) {
      edges.push({
        id: randomUUID(),
        sourceId: coreNode.id,
        targetId: distNode.id,
        protocol: "lldp" as "lldp",
        localInterface: `GigabitEthernet0/${Math.floor(Math.random() * 48)}`,
        remoteInterface: `GigabitEthernet0/${Math.floor(Math.random() * 48)}`,
        linkSpeed: 10000,
        utilization: randomFloat(5, 75),
      });
    }
  }

  for (let i = 0; i < Math.min(coreNodes.length - 1, 4); i++) {
    edges.push({
      id: randomUUID(),
      sourceId: coreNodes[i].id,
      targetId: coreNodes[i + 1].id,
      protocol: "lldp" as "lldp",
      localInterface: "TenGigabitEthernet0/0",
      remoteInterface: "TenGigabitEthernet0/0",
      linkSpeed: 100000,
      utilization: randomFloat(10, 60),
    });
  }

  if (edges.length > 0) {
    await db.insert(topologyEdgesTable).values(edges);
  }
  logger.info({ count: edges.length }, "Topology edges seeded");

  const now = new Date();
  const metricsToSeed = [];
  for (const node of nodes.slice(0, 20)) {
    for (let h = 23; h >= 0; h--) {
      const ts = new Date(now.getTime() - h * 60 * 60 * 1000);
      const cpu = randomFloat(10, 85);
      const mem = randomFloat(30, 80);
      metricsToSeed.push(
        { nodeId: node.id, metric: "cpu", value: cpu, min: cpu * 0.8, max: cpu * 1.2, avg: cpu, timestamp: ts },
        { nodeId: node.id, metric: "memory", value: mem, min: mem * 0.9, max: mem * 1.1, avg: mem, timestamp: ts },
        { nodeId: node.id, metric: "latency", value: randomFloat(1, 30), min: randomFloat(0.5, 5), max: randomFloat(20, 80), avg: randomFloat(1, 30), timestamp: ts },
        { nodeId: node.id, metric: "interface_in", value: randomFloat(100, 900), min: randomFloat(50, 200), max: randomFloat(800, 1000), avg: randomFloat(100, 900), timestamp: ts },
        { nodeId: node.id, metric: "interface_out", value: randomFloat(50, 700), min: randomFloat(20, 100), max: randomFloat(600, 900), avg: randomFloat(50, 700), timestamp: ts },
      );
    }
  }
  if (metricsToSeed.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < metricsToSeed.length; i += CHUNK) {
      await db.insert(metricsTable).values(metricsToSeed.slice(i, i + CHUNK));
    }
  }
  logger.info({ count: metricsToSeed.length }, "Metrics seeded");

  const flowIps = Array.from({ length: 20 }, () => randomIp());
  const flowsToSeed = [];
  for (const node of nodes.slice(0, 15)) {
    for (let j = 0; j < 20; j++) {
      flowsToSeed.push({
        id: randomUUID(),
        nodeId: node.id,
        srcIp: randomEl(flowIps),
        dstIp: randomEl(flowIps),
        srcPort: Math.floor(Math.random() * 65535),
        dstPort: randomEl([80, 443, 22, 3306, 5432, 8080, 53]),
        protocol: randomEl([6, 17]),
        bytes: Math.floor(Math.random() * 10000000) + 1000,
        packets: Math.floor(Math.random() * 100000) + 100,
        timestamp: new Date(now.getTime() - Math.random() * 3600000),
      });
    }
  }
  if (flowsToSeed.length > 0) {
    await db.insert(flowsTable).values(flowsToSeed);
  }
  logger.info({ count: flowsToSeed.length }, "Flows seeded");

  const alertsToSeed = [
    {
      id: randomUUID(), nodeId: nodes[0].id, nodeName: nodes[0].name,
      severity: "critical" as "critical", type: "cpu_high",
      message: `CPU usage at 94.3% on ${nodes[0].name}`, acknowledged: false,
    },
    {
      id: randomUUID(), nodeId: nodes[1].id, nodeName: nodes[1].name,
      severity: "warning" as "warning", type: "interface_util",
      message: `Interface utilization at 87% on ${nodes[1].name}`, acknowledged: false,
    },
    {
      id: randomUUID(), nodeId: nodes[2].id, nodeName: nodes[2].name,
      severity: "critical" as "critical", type: "node_down",
      message: `Node ${nodes[2].name} is unreachable`, acknowledged: false,
    },
    {
      id: randomUUID(), nodeId: nodes[3].id, nodeName: nodes[3].name,
      severity: "info" as "info", type: "snmp_timeout",
      message: `SNMP timeout on ${nodes[3].name} - retrying`, acknowledged: true,
    },
    {
      id: randomUUID(), nodeId: nodes[4].id, nodeName: nodes[4].name,
      severity: "warning" as "warning", type: "mem_high",
      message: `Memory usage at 88.5% on ${nodes[4].name}`, acknowledged: false,
    },
  ];
  await db.insert(alertsTable).values(alertsToSeed);
  logger.info({ count: alertsToSeed.length }, "Alerts seeded");

  logger.info("Database seeding complete");
}
