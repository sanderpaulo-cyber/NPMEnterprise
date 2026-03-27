import * as snmp from "net-snmp";
import type { SnmpCredentialRecord } from "@workspace/db/schema";

type SnmpSession = any;
type SnmpVarbind = any;

export interface SnmpIdentity {
  sysName?: string;
  sysDescr?: string;
  sysObjectId?: string;
  uptime?: number;
  interfaceCount?: number;
}

export interface SnmpPollSnapshot extends SnmpIdentity {
  vendor?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  serviceTag?: string | null;
  assetTag?: string | null;
  firmwareVersion?: string | null;
  softwareVersion?: string | null;
  hardwareRevision?: string | null;
  manufactureDate?: string | null;
  cpuUsage?: number | null;
  memUsage?: number | null;
  cpuTemperatureC?: number | null;
  inletTemperatureC?: number | null;
  fanCount?: number | null;
  fanHealthyCount?: number | null;
  temperatureSensors?: SnmpEnvironmentSensor[];
  fanSensors?: SnmpEnvironmentSensor[];
  interfaceInBps?: number | null;
  interfaceOutBps?: number | null;
  interfaces?: SnmpInterfaceSnapshot[];
  lldpNeighbors?: SnmpLldpNeighbor[];
  cdpNeighbors?: SnmpCdpNeighbor[];
  arpEntries?: SnmpArpEntry[];
  macEntries?: SnmpMacEntry[];
  vlans?: SnmpVlan[];
}

export interface SnmpInterfaceSnapshot {
  ifIndex: number;
  name: string;
  description?: string | null;
  alias?: string | null;
  adminStatus: "up" | "down" | "testing";
  operStatus:
    | "up"
    | "down"
    | "testing"
    | "unknown"
    | "dormant"
    | "notPresent"
    | "lowerLayerDown";
  speedBps?: number | null;
  inBps?: number | null;
  outBps?: number | null;
}

export interface SnmpLldpNeighbor {
  localPortNumber: number;
  localPortName?: string | null;
  remoteSysName?: string | null;
  remotePortDescription?: string | null;
  remotePortId?: string | null;
  remoteChassisId?: string | null;
}

export interface SnmpCdpNeighbor {
  localIfIndex: number;
  remoteDeviceId?: string | null;
  remotePort?: string | null;
  remotePlatform?: string | null;
  remoteAddress?: string | null;
}

export interface SnmpArpEntry {
  ifIndex?: number | null;
  ipAddress: string;
  macAddress: string;
}

export interface SnmpMacEntry {
  vlanId?: number | null;
  macAddress: string;
  bridgePort?: number | null;
  ifIndex?: number | null;
  interfaceName?: string | null;
  status?: string | null;
}

export interface SnmpVlan {
  vlanId: number;
  name?: string | null;
}

export interface SnmpEnvironmentSensor {
  index: number;
  sensorType: "temperature" | "fan";
  name: string;
  label?: string | null;
  value?: number | null;
  unit?: string | null;
  status: "ok" | "warning" | "critical" | "unknown";
  source?: string | null;
}

const SYSTEM_OIDS = {
  sysDescr: "1.3.6.1.2.1.1.1.0",
  sysObjectId: "1.3.6.1.2.1.1.2.0",
  uptime: "1.3.6.1.2.1.1.3.0",
  sysName: "1.3.6.1.2.1.1.5.0",
  interfaceCount: "1.3.6.1.2.1.2.1.0",
} as const;

const CPU_LOAD_BASE = "1.3.6.1.2.1.25.3.3.1.2";
const HR_STORAGE_DESCR_BASE = "1.3.6.1.2.1.25.2.3.1.3";
const HR_STORAGE_ALLOC_BASE = "1.3.6.1.2.1.25.2.3.1.4";
const HR_STORAGE_SIZE_BASE = "1.3.6.1.2.1.25.2.3.1.5";
const HR_STORAGE_USED_BASE = "1.3.6.1.2.1.25.2.3.1.6";
const IF_HC_IN_BASE = "1.3.6.1.2.1.31.1.1.1.6";
const IF_HC_OUT_BASE = "1.3.6.1.2.1.31.1.1.1.10";
const IF_IN_BASE = "1.3.6.1.2.1.2.2.1.10";
const IF_OUT_BASE = "1.3.6.1.2.1.2.2.1.16";
const IF_NAME_BASE = "1.3.6.1.2.1.31.1.1.1.1";
const IF_DESCR_BASE = "1.3.6.1.2.1.2.2.1.2";
const IF_ALIAS_BASE = "1.3.6.1.2.1.31.1.1.1.18";
const IF_SPEED_BASE = "1.3.6.1.2.1.2.2.1.5";
const IF_HIGH_SPEED_BASE = "1.3.6.1.2.1.31.1.1.1.15";
const IF_ADMIN_STATUS_BASE = "1.3.6.1.2.1.2.2.1.7";
const IF_OPER_STATUS_BASE = "1.3.6.1.2.1.2.2.1.8";
const LLDP_LOC_PORT_ID_BASE = "1.0.8802.1.1.2.1.3.7.1.3";
const LLDP_LOC_PORT_DESC_BASE = "1.0.8802.1.1.2.1.3.7.1.4";
const LLDP_REM_CHASSIS_ID_BASE = "1.0.8802.1.1.2.1.4.1.1.5";
const LLDP_REM_PORT_ID_BASE = "1.0.8802.1.1.2.1.4.1.1.7";
const LLDP_REM_PORT_DESC_BASE = "1.0.8802.1.1.2.1.4.1.1.8";
const LLDP_REM_SYS_NAME_BASE = "1.0.8802.1.1.2.1.4.1.1.9";
const IP_NET_TO_MEDIA_IFINDEX_BASE = "1.3.6.1.2.1.4.22.1.1";
const IP_NET_TO_MEDIA_PHYS_ADDRESS_BASE = "1.3.6.1.2.1.4.22.1.2";
const IP_NET_TO_MEDIA_NET_ADDRESS_BASE = "1.3.6.1.2.1.4.22.1.3";
const DOT1D_BASE_PORT_IFINDEX_BASE = "1.3.6.1.2.1.17.1.4.1.2";
const DOT1D_TP_FDB_PORT_BASE = "1.3.6.1.2.1.17.4.3.1.2";
const DOT1D_TP_FDB_STATUS_BASE = "1.3.6.1.2.1.17.4.3.1.3";
const DOT1Q_TP_FDB_PORT_BASE = "1.3.6.1.2.1.17.7.1.2.2.1.2";
const DOT1Q_TP_FDB_STATUS_BASE = "1.3.6.1.2.1.17.7.1.2.2.1.3";
const DOT1Q_VLAN_STATIC_NAME_BASE = "1.3.6.1.2.1.17.7.1.4.3.1.1";

const CISCO_CPU_5MIN_BASE = "1.3.6.1.4.1.9.9.109.1.1.1.1.8";
const CISCO_CPU_5MIN_REV_BASE = "1.3.6.1.4.1.9.9.109.1.1.1.1.25";
const CISCO_MEM_FREE_BASE = "1.3.6.1.4.1.9.9.48.1.1.1.5";
const CISCO_MEM_USED_BASE = "1.3.6.1.4.1.9.9.48.1.1.1.6";
const CDP_CACHE_ADDRESS_BASE = "1.3.6.1.4.1.9.9.23.1.2.1.1.4";
const CDP_CACHE_DEVICE_ID_BASE = "1.3.6.1.4.1.9.9.23.1.2.1.1.6";
const CDP_CACHE_DEVICE_PORT_BASE = "1.3.6.1.4.1.9.9.23.1.2.1.1.7";
const CDP_CACHE_PLATFORM_BASE = "1.3.6.1.4.1.9.9.23.1.2.1.1.8";
const ENTITY_PHYSICAL_DESCR_BASE = "1.3.6.1.2.1.47.1.1.1.1.2";
const ENTITY_PHYSICAL_CLASS_BASE = "1.3.6.1.2.1.47.1.1.1.1.5";
const ENTITY_PHYSICAL_NAME_BASE = "1.3.6.1.2.1.47.1.1.1.1.7";
const ENTITY_PHYSICAL_HARDWARE_REV_BASE = "1.3.6.1.2.1.47.1.1.1.1.8";
const ENTITY_PHYSICAL_FIRMWARE_REV_BASE = "1.3.6.1.2.1.47.1.1.1.1.9";
const ENTITY_PHYSICAL_SOFTWARE_REV_BASE = "1.3.6.1.2.1.47.1.1.1.1.10";
const ENTITY_PHYSICAL_SERIAL_NUM_BASE = "1.3.6.1.2.1.47.1.1.1.1.11";
const ENTITY_PHYSICAL_MFG_NAME_BASE = "1.3.6.1.2.1.47.1.1.1.1.12";
const ENTITY_PHYSICAL_MODEL_NAME_BASE = "1.3.6.1.2.1.47.1.1.1.1.13";
const ENTITY_PHYSICAL_ASSET_ID_BASE = "1.3.6.1.2.1.47.1.1.1.1.15";
const ENTITY_SENSOR_TYPE_BASE = "1.3.6.1.2.1.99.1.1.1.1.1";
const ENTITY_SENSOR_SCALE_BASE = "1.3.6.1.2.1.99.1.1.1.1.2";
const ENTITY_SENSOR_PRECISION_BASE = "1.3.6.1.2.1.99.1.1.1.1.3";
const ENTITY_SENSOR_VALUE_BASE = "1.3.6.1.2.1.99.1.1.1.1.4";
const ENTITY_SENSOR_OPER_STATUS_BASE = "1.3.6.1.2.1.99.1.1.1.1.5";
const ENTITY_SENSOR_UNITS_DISPLAY_BASE = "1.3.6.1.2.1.99.1.1.1.1.6";

const interfaceCounterCache = new Map<
  string,
  { inOctets: number; outOctets: number; sampledAt: number }
>();
const interfaceDetailCounterCache = new Map<
  string,
  { inOctets: number; outOctets: number; sampledAt: number }
>();

function mapVersion(version: SnmpCredentialRecord["version"]) {
  switch (version) {
    case "v1":
      return snmp.Version1;
    case "v3":
      return snmp.Version3;
    default:
      return snmp.Version2c;
  }
}

function mapAuthProtocol(protocol: SnmpCredentialRecord["authProtocol"]) {
  switch (protocol) {
    case "md5":
      return snmp.AuthProtocols.md5;
    case "sha224":
      return snmp.AuthProtocols.sha224;
    case "sha256":
      return snmp.AuthProtocols.sha256;
    case "sha384":
      return snmp.AuthProtocols.sha384;
    case "sha512":
      return snmp.AuthProtocols.sha512;
    case "sha":
    default:
      return snmp.AuthProtocols.sha;
  }
}

function mapPrivProtocol(protocol: SnmpCredentialRecord["privProtocol"]) {
  switch (protocol) {
    case "des":
      return snmp.PrivProtocols.des;
    case "aes":
    default:
      return snmp.PrivProtocols.aes;
  }
}

function mapSecurityLevel(credential: SnmpCredentialRecord) {
  if (credential.version !== "v3") {
    return snmp.SecurityLevel.noAuthNoPriv;
  }
  if (credential.authProtocol !== "none" && credential.privProtocol !== "none") {
    return snmp.SecurityLevel.authPriv;
  }
  if (credential.authProtocol !== "none") {
    return snmp.SecurityLevel.authNoPriv;
  }
  return snmp.SecurityLevel.noAuthNoPriv;
}

function sessionGet(
  session: SnmpSession,
  oids: string[],
): Promise<SnmpVarbind[]> {
  return new Promise((resolve, reject) => {
    session.get(oids, (error: unknown, varbinds: SnmpVarbind[]) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(varbinds);
    });
  });
}

function readValue(varbind: SnmpVarbind | undefined) {
  if (!varbind || snmp.isVarbindError(varbind)) {
    return undefined;
  }
  return varbind.value;
}

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (Buffer.isBuffer(value)) {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  return String(value);
}

function normalizeText(value: string | undefined | null) {
  const normalized = value?.replace(/\0/g, "").trim();
  return normalized ? normalized : undefined;
}

function formatMacFromBuffer(buffer: Buffer) {
  return Array.from(buffer.values())
    .map((part) => part.toString(16).padStart(2, "0"))
    .join(":");
}

function formatMacFromParts(parts: string[]) {
  if (parts.length !== 6) return undefined;
  const bytes = parts.map((part) => Number(part));
  if (bytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    return undefined;
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(":");
}

function parseIpNetToMediaIndex(suffix: string) {
  const parts = suffix.split(".");
  if (parts.length < 5) return null;
  const ifIndex = Number(parts[0]);
  const ipAddress = parts.slice(1).join(".");
  if (!Number.isFinite(ifIndex) || !ipAddress) return null;
  return { ifIndex, ipAddress };
}

function parseQBridgeIndex(suffix: string) {
  const parts = suffix.split(".");
  if (parts.length < 7) return null;
  const vlanId = Number(parts[0]);
  const macAddress = formatMacFromParts(parts.slice(1, 7));
  if (!Number.isFinite(vlanId) || !macAddress) return null;
  return { vlanId, macAddress };
}

function parseDot1dMacIndex(suffix: string) {
  const macAddress = formatMacFromParts(suffix.split("."));
  return macAddress ? { macAddress } : null;
}

function inferVendorAndModel(input: { sysDescr?: string; sysObjectId?: string }) {
  const sysDescr = input.sysDescr?.trim();
  const text = sysDescr?.toLowerCase() ?? "";
  let vendor: string | null = null;
  if (text.includes("cisco")) vendor = "Cisco";
  else if (text.includes("dell")) vendor = "Dell";
  else if (text.includes("juniper")) vendor = "Juniper";
  else if (text.includes("arista")) vendor = "Arista";
  else if (text.includes("fortinet") || text.includes("fortigate")) vendor = "Fortinet";
  else if (text.includes("palo alto")) vendor = "Palo Alto";
  else if (text.includes("mikrotik")) vendor = "MikroTik";
  else if (text.includes("aruba") || text.includes("procurve") || text.includes("hewlett")) vendor = "HPE/Aruba";
  else if (text.includes("windows")) vendor = "Microsoft";
  else if (text.includes("linux")) vendor = "Linux";

  let model: string | null = null;
  if (sysDescr) {
    const patterns = [
      /(catalyst\s+\S+)/i,
      /(nexus\s+\S+)/i,
      /(asr\s+\S+)/i,
      /(mx\d+)/i,
      /(srx\S*)/i,
      /(fortigate\s+\S+)/i,
      /(pa-\S+)/i,
      /(dcs-\S+)/i,
      /(proliant\s+\S+)/i,
      /(poweredge\s+\S+)/i,
    ];
    for (const pattern of patterns) {
      const match = sysDescr.match(pattern);
      if (match?.[1]) {
        model = match[1];
        break;
      }
    }
  }

  if (!model && input.sysObjectId) {
    model = input.sysObjectId;
  }

  return { vendor, model };
}

function firstPresentText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    if (["unknown", "n/a", "na", "not specified"].includes(normalized.toLowerCase())) {
      continue;
    }
    return normalized;
  }
  return undefined;
}

function rankEntityClass(value: number | undefined) {
  switch (value) {
    case 3:
      return 100;
    case 9:
      return 90;
    case 5:
      return 70;
    case 10:
      return 60;
    default:
      return 0;
  }
}

function pickEntityRootIndex(classes: Map<string, unknown>, names: Map<string, unknown>, descr: Map<string, unknown>) {
  let bestIndex: string | undefined;
  let bestScore = -1;

  for (const [index, rawClass] of classes.entries()) {
    const entityClass = toNumber(rawClass);
    const name = firstPresentText(toText(names.get(index)), toText(descr.get(index))) ?? "";
    let score = rankEntityClass(entityClass);
    if (/chassis|system|backplane|stack|switch|router/i.test(name)) {
      score += 25;
    }
    if (/fan|power|supply|sensor/i.test(name)) {
      score -= 20;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestIndex;
}

async function readEntityInventory(
  session: SnmpSession,
  fingerprint: { vendor?: string | null; model?: string | null },
) {
  try {
    const [
      classes,
      names,
      descr,
      hardwareRevs,
      firmwareRevs,
      softwareRevs,
      serials,
      manufacturers,
      models,
      assetIds,
    ] = await Promise.all([
      readTableAsMap(session, ENTITY_PHYSICAL_CLASS_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_NAME_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_DESCR_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_HARDWARE_REV_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_FIRMWARE_REV_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_SOFTWARE_REV_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_SERIAL_NUM_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_MFG_NAME_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_MODEL_NAME_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_ASSET_ID_BASE),
    ]);

    const rootIndex = pickEntityRootIndex(classes, names, descr);
    if (!rootIndex) {
      return {};
    }

    const vendor = firstPresentText(
      toText(manufacturers.get(rootIndex)),
      fingerprint.vendor ?? undefined,
    );
    const model = firstPresentText(
      toText(models.get(rootIndex)),
      toText(descr.get(rootIndex)),
      fingerprint.model ?? undefined,
    );
    const serialNumber = firstPresentText(toText(serials.get(rootIndex)));
    const assetTag = firstPresentText(toText(assetIds.get(rootIndex)));
    const serviceTag = firstPresentText(
      assetTag,
      vendor === "Dell" ? serialNumber : undefined,
    );

    return {
      vendor,
      model,
      serialNumber,
      serviceTag,
      assetTag,
      firmwareVersion: firstPresentText(toText(firmwareRevs.get(rootIndex))),
      softwareVersion: firstPresentText(toText(softwareRevs.get(rootIndex))),
      hardwareRevision: firstPresentText(toText(hardwareRevs.get(rootIndex))),
      manufactureDate: undefined,
    };
  } catch {
    return {};
  }
}

function sensorScaleFactor(scale: number | undefined) {
  switch (scale) {
    case 1:
      return 1e-24;
    case 2:
      return 1e-21;
    case 3:
      return 1e-18;
    case 4:
      return 1e-15;
    case 5:
      return 1e-12;
    case 6:
      return 1e-9;
    case 7:
      return 1e-6;
    case 8:
      return 1e-3;
    case 10:
      return 1e3;
    case 11:
      return 1e6;
    case 12:
      return 1e9;
    case 13:
      return 1e12;
    case 14:
      return 1e15;
    case 15:
      return 1e18;
    case 16:
      return 1e21;
    case 17:
      return 1e24;
    case 9:
    default:
      return 1;
  }
}

function normalizeSensorReading(raw: number | undefined, scale: number | undefined, precision: number | undefined) {
  if (raw == null) return undefined;
  const scaled = raw * sensorScaleFactor(scale);
  if (precision != null && precision > 0) {
    return Number((scaled / 10 ** precision).toFixed(Math.min(precision, 2)));
  }
  if (precision != null && precision < 0) {
    return Number((scaled * 10 ** Math.abs(precision)).toFixed(2));
  }
  return Number(scaled.toFixed(2));
}

function mapSensorStatus(value: number | undefined): SnmpEnvironmentSensor["status"] {
  switch (value) {
    case 1:
      return "ok";
    case 3:
      return "critical";
    case 2:
      return "warning";
    default:
      return "unknown";
  }
}

async function readEnvironmentSensors(session: SnmpSession) {
  try {
    const [
      physicalNames,
      physicalDescr,
      sensorTypes,
      sensorScales,
      sensorPrecisions,
      sensorValues,
      sensorStatuses,
      sensorUnits,
    ] = await Promise.all([
      readTableAsMap(session, ENTITY_PHYSICAL_NAME_BASE),
      readTableAsMap(session, ENTITY_PHYSICAL_DESCR_BASE),
      readTableAsMap(session, ENTITY_SENSOR_TYPE_BASE),
      readTableAsMap(session, ENTITY_SENSOR_SCALE_BASE),
      readTableAsMap(session, ENTITY_SENSOR_PRECISION_BASE),
      readTableAsMap(session, ENTITY_SENSOR_VALUE_BASE),
      readTableAsMap(session, ENTITY_SENSOR_OPER_STATUS_BASE),
      readTableAsMap(session, ENTITY_SENSOR_UNITS_DISPLAY_BASE),
    ]);

    const temperatureSensors: SnmpEnvironmentSensor[] = [];
    const fanSensors: SnmpEnvironmentSensor[] = [];

    for (const [index, rawType] of sensorTypes.entries()) {
      const type = toNumber(rawType);
      const name = firstPresentText(
        toText(physicalNames.get(index)),
        toText(physicalDescr.get(index)),
        `Sensor ${index}`,
      );
      if (!name) continue;

      const unitsDisplay = firstPresentText(toText(sensorUnits.get(index)));
      const sensorClass =
        type === 8
          ? "temperature"
          : type === 10 || /fan/i.test(name) || /rpm/i.test(unitsDisplay ?? "")
            ? "fan"
            : null;
      if (!sensorClass) continue;

      const value = normalizeSensorReading(
        toNumber(sensorValues.get(index)),
        toNumber(sensorScales.get(index)),
        toNumber(sensorPrecisions.get(index)),
      );
      const status = mapSensorStatus(toNumber(sensorStatuses.get(index)));
      const sensor: SnmpEnvironmentSensor = {
        index: Number(index),
        sensorType: sensorClass,
        name,
        label: unitsDisplay ?? null,
        value: value ?? null,
        unit:
          sensorClass === "temperature"
            ? "C"
            : /rpm/i.test(unitsDisplay ?? "")
              ? "RPM"
              : unitsDisplay ?? null,
        status,
        source: "ENTITY-SENSOR-MIB",
      };

      if (sensorClass === "temperature") {
        temperatureSensors.push(sensor);
      } else {
        fanSensors.push(sensor);
      }
    }

    const cpuTemperatureSensor =
      temperatureSensors.find((sensor) => /cpu|proc|core|die/i.test(sensor.name)) ??
      [...temperatureSensors]
        .sort((left, right) => (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY))[0];
    const inletTemperatureSensor = temperatureSensors.find((sensor) =>
      /inlet|intake|ambient/i.test(sensor.name),
    );

    return {
      temperatureSensors,
      fanSensors,
      cpuTemperatureC: cpuTemperatureSensor?.value ?? null,
      inletTemperatureC: inletTemperatureSensor?.value ?? null,
      fanCount: fanSensors.length,
      fanHealthyCount: fanSensors.filter((sensor) => sensor.status === "ok").length,
    };
  } catch {
    return {
      temperatureSensors: [],
      fanSensors: [],
      cpuTemperatureC: null,
      inletTemperatureC: null,
      fanCount: 0,
      fanHealthyCount: 0,
    };
  }
}

async function readVendorSpecificCpu(
  session: SnmpSession,
  vendor?: string | null,
) {
  if (vendor === "Cisco") {
    return (
      (await readCpuUsageFromBases(session, [
        CISCO_CPU_5MIN_REV_BASE,
        CISCO_CPU_5MIN_BASE,
      ])) ?? undefined
    );
  }
  return undefined;
}

async function readVendorSpecificMemory(
  session: SnmpSession,
  vendor?: string | null,
) {
  if (vendor === "Cisco") {
    return readCiscoMemoryUsage(session);
  }
  return undefined;
}

function createSession(target: string, credential: SnmpCredentialRecord) {
  const commonOptions = {
    port: credential.port,
    retries: credential.retries,
    timeout: credential.timeoutMs,
    transport: "udp4" as const,
    version: mapVersion(credential.version),
  };

  if (credential.version === "v3") {
    const user = {
      name: credential.username ?? "",
      level: mapSecurityLevel(credential),
      authProtocol:
        credential.authProtocol !== "none"
          ? mapAuthProtocol(credential.authProtocol)
          : undefined,
      authKey: credential.authPassword ?? undefined,
      privProtocol:
        credential.privProtocol !== "none"
          ? mapPrivProtocol(credential.privProtocol)
          : undefined,
      privKey: credential.privPassword ?? undefined,
    };
    return snmp.createV3Session(target, user, commonOptions);
  }

  return snmp.createSession(target, credential.community ?? "public", commonOptions);
}

function sessionSubtree(
  session: SnmpSession,
  oid: string,
): Promise<SnmpVarbind[]> {
  return new Promise((resolve, reject) => {
    const collected: SnmpVarbind[] = [];
    (session as unknown as {
      subtree: (
        oid: string,
        maxRepetitions: number,
        feedCb: (varbinds: SnmpVarbind[]) => void,
        doneCb: (error?: Error) => void,
      ) => void;
    }).subtree(
      oid,
      20,
      (varbinds) => {
        collected.push(...varbinds);
      },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(collected);
      },
    );
  });
}

function average(values: number[]) {
  if (values.length === 0) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function readCpuUsage(session: SnmpSession) {
  try {
    const varbinds = await sessionSubtree(session, CPU_LOAD_BASE);
    const values = varbinds
      .map((varbind) => toNumber(readValue(varbind)))
      .filter((value): value is number => value != null);
    const avg = average(values);
    return avg != null ? Number(avg.toFixed(2)) : undefined;
  } catch {
    return undefined;
  }
}

async function readCpuUsageFromBases(session: SnmpSession, bases: string[]) {
  for (const base of bases) {
    try {
      const varbinds = await sessionSubtree(session, base);
      const values = varbinds
        .map((varbind) => toNumber(readValue(varbind)))
        .filter((value): value is number => value != null);
      const avg = average(values);
      if (avg != null) return Number(avg.toFixed(2));
    } catch {
      // try next profile
    }
  }
  return undefined;
}

async function readTableAsMap(session: SnmpSession, oid: string) {
  const varbinds = await sessionSubtree(session, oid);
  const map = new Map<string, unknown>();
  for (const varbind of varbinds) {
    if (snmp.isVarbindError(varbind)) continue;
    const parts = varbind.oid.split(".");
    const index = parts[parts.length - 1];
    map.set(index, varbind.value);
  }
  return map;
}

async function readTableAsSuffixMap(session: SnmpSession, oid: string) {
  const varbinds = await sessionSubtree(session, oid);
  const map = new Map<string, unknown>();
  const prefix = `${oid}.`;
  for (const varbind of varbinds) {
    if (snmp.isVarbindError(varbind)) continue;
    const suffix = varbind.oid.startsWith(prefix)
      ? varbind.oid.slice(prefix.length)
      : varbind.oid;
    map.set(suffix, varbind.value);
  }
  return map;
}

async function readMemoryUsage(session: SnmpSession) {
  try {
    const [descr, alloc, size, used] = await Promise.all([
      readTableAsMap(session, HR_STORAGE_DESCR_BASE),
      readTableAsMap(session, HR_STORAGE_ALLOC_BASE),
      readTableAsMap(session, HR_STORAGE_SIZE_BASE),
      readTableAsMap(session, HR_STORAGE_USED_BASE),
    ]);

    let bestUsage: number | undefined;
    for (const [index, descrValue] of descr.entries()) {
      const label = toText(descrValue)?.toLowerCase() ?? "";
      if (!label.includes("memory")) continue;
      const totalUnits = toNumber(size.get(index));
      const usedUnits = toNumber(used.get(index));
      if (!totalUnits || usedUnits == null || totalUnits <= 0) continue;
      const usage = (usedUnits / totalUnits) * 100;
      if (bestUsage == null || usage > bestUsage) {
        bestUsage = usage;
      }
    }
    return bestUsage != null ? Number(bestUsage.toFixed(2)) : undefined;
  } catch {
    return undefined;
  }
}

async function readCiscoMemoryUsage(session: SnmpSession) {
  try {
    const [freeMap, usedMap] = await Promise.all([
      readTableAsMap(session, CISCO_MEM_FREE_BASE),
      readTableAsMap(session, CISCO_MEM_USED_BASE),
    ]);
    let best: number | undefined;
    for (const [index, usedValue] of usedMap.entries()) {
      const used = toNumber(usedValue);
      const free = toNumber(freeMap.get(index));
      if (used == null || free == null) continue;
      const total = used + free;
      if (total <= 0) continue;
      const pct = (used / total) * 100;
      if (best == null || pct > best) best = pct;
    }
    return best != null ? Number(best.toFixed(2)) : undefined;
  } catch {
    return undefined;
  }
}

async function readInterfaceRates(session: SnmpSession, cacheKey: string) {
  const tryCounters = async (inBase: string, outBase: string) => {
    const [inMap, outMap] = await Promise.all([
      readTableAsMap(session, inBase),
      readTableAsMap(session, outBase),
    ]);

    const inOctets = Array.from(inMap.values()).reduce<number>((sum, value) => {
      return sum + (toNumber(value) ?? 0);
    }, 0);
    const outOctets = Array.from(outMap.values()).reduce<number>((sum, value) => {
      return sum + (toNumber(value) ?? 0);
    }, 0);
    if (inOctets === 0 && outOctets === 0) return null;
    return { inOctets, outOctets } as const;
  };

  let counters = await tryCounters(IF_HC_IN_BASE, IF_HC_OUT_BASE);
  if (!counters) {
    counters = await tryCounters(IF_IN_BASE, IF_OUT_BASE);
  }
  if (!counters) {
    return { interfaceInBps: undefined, interfaceOutBps: undefined };
  }

  const sampledAt = Date.now();
  const previous = interfaceCounterCache.get(cacheKey);
  interfaceCounterCache.set(cacheKey, { ...counters, sampledAt });
  if (!previous) {
    return { interfaceInBps: undefined, interfaceOutBps: undefined };
  }

  const deltaSeconds = (sampledAt - previous.sampledAt) / 1000;
  if (deltaSeconds <= 0) {
    return { interfaceInBps: undefined, interfaceOutBps: undefined };
  }

  const deltaIn = counters.inOctets - previous.inOctets;
  const deltaOut = counters.outOctets - previous.outOctets;
  return {
    interfaceInBps: deltaIn >= 0 ? Number((deltaIn / deltaSeconds).toFixed(2)) : undefined,
    interfaceOutBps:
      deltaOut >= 0 ? Number((deltaOut / deltaSeconds).toFixed(2)) : undefined,
  };
}

function mapAdminStatus(value: number | undefined): SnmpInterfaceSnapshot["adminStatus"] {
  if (value === 1) return "up";
  if (value === 3) return "testing";
  return "down";
}

function mapOperStatus(value: number | undefined): SnmpInterfaceSnapshot["operStatus"] {
  switch (value) {
    case 1:
      return "up";
    case 2:
      return "down";
    case 3:
      return "testing";
    case 5:
      return "dormant";
    case 6:
      return "notPresent";
    case 7:
      return "lowerLayerDown";
    default:
      return "unknown";
  }
}

function mapFdbStatus(value: number | undefined) {
  switch (value) {
    case 1:
      return "other";
    case 2:
      return "invalid";
    case 3:
      return "learned";
    case 4:
      return "self";
    case 5:
      return "management";
    default:
      return undefined;
  }
}

async function readInterfaceInventory(
  session: SnmpSession,
  cacheKey: string,
): Promise<SnmpInterfaceSnapshot[]> {
  try {
    const [
      names,
      descr,
      aliases,
      speeds,
      highSpeeds,
      adminStatuses,
      operStatuses,
      hcIn,
      hcOut,
      in32,
      out32,
    ] = await Promise.all([
      readTableAsMap(session, IF_NAME_BASE),
      readTableAsMap(session, IF_DESCR_BASE),
      readTableAsMap(session, IF_ALIAS_BASE),
      readTableAsMap(session, IF_SPEED_BASE),
      readTableAsMap(session, IF_HIGH_SPEED_BASE),
      readTableAsMap(session, IF_ADMIN_STATUS_BASE),
      readTableAsMap(session, IF_OPER_STATUS_BASE),
      readTableAsMap(session, IF_HC_IN_BASE).catch(() => new Map<string, unknown>()),
      readTableAsMap(session, IF_HC_OUT_BASE).catch(() => new Map<string, unknown>()),
      readTableAsMap(session, IF_IN_BASE).catch(() => new Map<string, unknown>()),
      readTableAsMap(session, IF_OUT_BASE).catch(() => new Map<string, unknown>()),
    ]);

    const indexes = Array.from(descr.keys())
      .map((index) => Number(index))
      .filter((index) => Number.isFinite(index))
      .sort((a, b) => a - b);

    return indexes.map((ifIndex) => {
      const key = String(ifIndex);
      const name = toText(names.get(key)) || toText(descr.get(key)) || `if${key}`;
      const description = toText(descr.get(key)) ?? null;
      const alias = toText(aliases.get(key)) ?? null;
      const speedFromHigh = toNumber(highSpeeds.get(key));
      const speedFromBase = toNumber(speeds.get(key));
      const speedBps =
        speedFromHigh != null && speedFromHigh > 0
          ? speedFromHigh * 1_000_000
          : speedFromBase ?? null;

      const inOctets = toNumber(hcIn.get(key)) ?? toNumber(in32.get(key));
      const outOctets = toNumber(hcOut.get(key)) ?? toNumber(out32.get(key));
      const detailCacheKey = `${cacheKey}:${key}`;
      const sampledAt = Date.now();
      let inBps: number | null = null;
      let outBps: number | null = null;
      if (inOctets != null && outOctets != null) {
        const previous = interfaceDetailCounterCache.get(detailCacheKey);
        interfaceDetailCounterCache.set(detailCacheKey, {
          inOctets,
          outOctets,
          sampledAt,
        });
        if (previous) {
          const deltaSeconds = (sampledAt - previous.sampledAt) / 1000;
          if (deltaSeconds > 0) {
            const deltaIn = inOctets - previous.inOctets;
            const deltaOut = outOctets - previous.outOctets;
            inBps = deltaIn >= 0 ? Number((deltaIn / deltaSeconds).toFixed(2)) : null;
            outBps = deltaOut >= 0 ? Number((deltaOut / deltaSeconds).toFixed(2)) : null;
          }
        }
      }

      return {
        ifIndex,
        name,
        description,
        alias,
        adminStatus: mapAdminStatus(toNumber(adminStatuses.get(key))),
        operStatus: mapOperStatus(toNumber(operStatuses.get(key))),
        speedBps,
        inBps,
        outBps,
      };
    });
  } catch {
    return [];
  }
}

async function readLldpNeighbors(session: SnmpSession): Promise<SnmpLldpNeighbor[]> {
  try {
    const [
      localPortIds,
      localPortDescs,
      remoteChassisIds,
      remotePortIds,
      remotePortDescs,
      remoteSysNames,
    ] = await Promise.all([
      readTableAsMap(session, LLDP_LOC_PORT_ID_BASE).catch(() => new Map<string, unknown>()),
      readTableAsMap(session, LLDP_LOC_PORT_DESC_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsMap(session, LLDP_REM_CHASSIS_ID_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsMap(session, LLDP_REM_PORT_ID_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsMap(session, LLDP_REM_PORT_DESC_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsMap(session, LLDP_REM_SYS_NAME_BASE).catch(
        () => new Map<string, unknown>(),
      ),
    ]);

    const neighbors: SnmpLldpNeighbor[] = [];
    for (const [key, value] of remoteSysNames.entries()) {
      const indexParts = key.split(".");
      const localPortRaw = indexParts[indexParts.length - 2];
      const localPortNumber = Number(localPortRaw);
      if (!Number.isFinite(localPortNumber)) continue;
      neighbors.push({
        localPortNumber,
        localPortName:
          toText(localPortDescs.get(String(localPortNumber))) ??
          toText(localPortIds.get(String(localPortNumber))) ??
          null,
        remoteSysName: toText(value) ?? null,
        remotePortDescription: toText(remotePortDescs.get(key)) ?? null,
        remotePortId: toText(remotePortIds.get(key)) ?? null,
        remoteChassisId: toText(remoteChassisIds.get(key)) ?? null,
      });
    }
    return neighbors;
  } catch {
    return [];
  }
}

async function readCdpNeighbors(session: SnmpSession): Promise<SnmpCdpNeighbor[]> {
  try {
    const [addresses, deviceIds, devicePorts, platforms] = await Promise.all([
      readTableAsSuffixMap(session, CDP_CACHE_ADDRESS_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, CDP_CACHE_DEVICE_ID_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, CDP_CACHE_DEVICE_PORT_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, CDP_CACHE_PLATFORM_BASE).catch(
        () => new Map<string, unknown>(),
      ),
    ]);

    const neighbors: SnmpCdpNeighbor[] = [];
    for (const [suffix, deviceIdValue] of deviceIds.entries()) {
      const parts = suffix.split(".");
      const localIfIndex = Number(parts[0]);
      if (!Number.isFinite(localIfIndex)) continue;
      neighbors.push({
        localIfIndex,
        remoteDeviceId: toText(deviceIdValue) ?? null,
        remotePort: toText(devicePorts.get(suffix)) ?? null,
        remotePlatform: toText(platforms.get(suffix)) ?? null,
        remoteAddress: toText(addresses.get(suffix)) ?? null,
      });
    }
    return neighbors;
  } catch {
    return [];
  }
}

async function readArpEntries(session: SnmpSession): Promise<SnmpArpEntry[]> {
  try {
    const [ifIndexes, macs, addresses] = await Promise.all([
      readTableAsSuffixMap(session, IP_NET_TO_MEDIA_IFINDEX_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, IP_NET_TO_MEDIA_PHYS_ADDRESS_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, IP_NET_TO_MEDIA_NET_ADDRESS_BASE).catch(
        () => new Map<string, unknown>(),
      ),
    ]);

    const entries: SnmpArpEntry[] = [];
    for (const [suffix, macValue] of macs.entries()) {
      const parsed = parseIpNetToMediaIndex(suffix);
      if (!parsed) continue;
      const macAddress = Buffer.isBuffer(macValue)
        ? formatMacFromBuffer(macValue)
        : normalizeText(toText(macValue));
      const ipAddress = normalizeText(toText(addresses.get(suffix))) ?? parsed.ipAddress;
      if (!macAddress || !ipAddress) continue;
      entries.push({
        ifIndex: toNumber(ifIndexes.get(suffix)) ?? parsed.ifIndex,
        ipAddress,
        macAddress,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

async function readVlans(session: SnmpSession): Promise<SnmpVlan[]> {
  try {
    const names = await readTableAsMap(session, DOT1Q_VLAN_STATIC_NAME_BASE).catch(
      () => new Map<string, unknown>(),
    );
    const vlans: SnmpVlan[] = [];
    for (const [index, value] of names.entries()) {
      const vlanId = Number(index);
      if (!Number.isFinite(vlanId)) continue;
      vlans.push({
        vlanId,
        name: normalizeText(toText(value)) ?? null,
      });
    }
    return vlans.sort((a, b) => a.vlanId - b.vlanId);
  } catch {
    return [];
  }
}

async function readMacEntries(
  session: SnmpSession,
  interfaceNameByIfIndex: Map<number, string>,
): Promise<SnmpMacEntry[]> {
  const readBridgePortMap = async () => {
    const basePortIfIndex = await readTableAsMap(session, DOT1D_BASE_PORT_IFINDEX_BASE).catch(
      () => new Map<string, unknown>(),
    );
    const map = new Map<number, number>();
    for (const [bridgePortKey, ifIndexValue] of basePortIfIndex.entries()) {
      const bridgePort = Number(bridgePortKey);
      const ifIndex = toNumber(ifIndexValue);
      if (Number.isFinite(bridgePort) && ifIndex != null) {
        map.set(bridgePort, ifIndex);
      }
    }
    return map;
  };

  try {
    const bridgePortToIfIndex = await readBridgePortMap();
    const [qPorts, qStatuses] = await Promise.all([
      readTableAsSuffixMap(session, DOT1Q_TP_FDB_PORT_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, DOT1Q_TP_FDB_STATUS_BASE).catch(
        () => new Map<string, unknown>(),
      ),
    ]);

    const entries: SnmpMacEntry[] = [];
    for (const [suffix, portValue] of qPorts.entries()) {
      const parsed = parseQBridgeIndex(suffix);
      if (!parsed) continue;
      const bridgePort = toNumber(portValue);
      const ifIndex =
        bridgePort != null ? (bridgePortToIfIndex.get(bridgePort) ?? null) : null;
      entries.push({
        vlanId: parsed.vlanId,
        macAddress: parsed.macAddress,
        bridgePort: bridgePort ?? null,
        ifIndex,
        interfaceName: ifIndex != null ? (interfaceNameByIfIndex.get(ifIndex) ?? null) : null,
        status: mapFdbStatus(toNumber(qStatuses.get(suffix))) ?? null,
      });
    }

    if (entries.length > 0) {
      return entries;
    }

    const [ports, statuses] = await Promise.all([
      readTableAsSuffixMap(session, DOT1D_TP_FDB_PORT_BASE).catch(
        () => new Map<string, unknown>(),
      ),
      readTableAsSuffixMap(session, DOT1D_TP_FDB_STATUS_BASE).catch(
        () => new Map<string, unknown>(),
      ),
    ]);
    for (const [suffix, portValue] of ports.entries()) {
      const parsed = parseDot1dMacIndex(suffix);
      if (!parsed) continue;
      const bridgePort = toNumber(portValue);
      const ifIndex =
        bridgePort != null ? (bridgePortToIfIndex.get(bridgePort) ?? null) : null;
      entries.push({
        vlanId: null,
        macAddress: parsed.macAddress,
        bridgePort: bridgePort ?? null,
        ifIndex,
        interfaceName: ifIndex != null ? (interfaceNameByIfIndex.get(ifIndex) ?? null) : null,
        status: mapFdbStatus(toNumber(statuses.get(suffix))) ?? null,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

export async function fetchSnmpIdentity(
  target: string,
  credential: SnmpCredentialRecord,
): Promise<SnmpIdentity | null> {
  const session = createSession(target, credential);
  try {
    const varbinds = await sessionGet(session, Object.values(SYSTEM_OIDS));
    return {
      sysDescr: readValue(varbinds[0])?.toString(),
      sysObjectId: readValue(varbinds[1])?.toString(),
      uptime: Number(readValue(varbinds[2]) ?? 0),
      sysName: readValue(varbinds[3])?.toString(),
      interfaceCount: Number(readValue(varbinds[4]) ?? 0) || undefined,
    };
  } catch {
    return null;
  } finally {
    session.close();
  }
}

export async function fetchSnmpPollSnapshot(
  target: string,
  credential: SnmpCredentialRecord,
  cacheKey: string,
): Promise<SnmpPollSnapshot | null> {
  const session = createSession(target, credential);
  try {
    const base = await sessionGet(session, Object.values(SYSTEM_OIDS));
    const identity: SnmpIdentity = {
      sysDescr: toText(readValue(base[0])),
      sysObjectId: toText(readValue(base[1])),
      uptime: toNumber(readValue(base[2])),
      sysName: toText(readValue(base[3])),
      interfaceCount: toNumber(readValue(base[4])),
    };
    const fingerprint = inferVendorAndModel({
      sysDescr: identity.sysDescr,
      sysObjectId: identity.sysObjectId,
    });

    const [
      inventory,
      environment,
      vendorCpu,
      genericCpu,
      vendorMem,
      genericMem,
      interfaceRates,
      interfaces,
      lldpNeighbors,
      cdpNeighbors,
      arpEntries,
      vlans,
    ] =
      await Promise.all([
        readEntityInventory(session, fingerprint),
        readEnvironmentSensors(session),
        readVendorSpecificCpu(session, fingerprint.vendor),
        readCpuUsage(session),
        readVendorSpecificMemory(session, fingerprint.vendor),
        readMemoryUsage(session),
        readInterfaceRates(session, cacheKey),
        readInterfaceInventory(session, cacheKey),
        readLldpNeighbors(session),
        readCdpNeighbors(session),
        readArpEntries(session),
        readVlans(session),
      ]);
    const interfaceNameByIfIndex = new Map(
      interfaces.map((iface) => [iface.ifIndex, iface.name] as const),
    );
    const macEntries = await readMacEntries(session, interfaceNameByIfIndex);

    return {
      ...identity,
      vendor: inventory.vendor ?? fingerprint.vendor,
      model: inventory.model ?? fingerprint.model,
      serialNumber: inventory.serialNumber ?? null,
      serviceTag: inventory.serviceTag ?? null,
      assetTag: inventory.assetTag ?? null,
      firmwareVersion: inventory.firmwareVersion ?? null,
      softwareVersion: inventory.softwareVersion ?? null,
      hardwareRevision: inventory.hardwareRevision ?? null,
      manufactureDate: inventory.manufactureDate ?? null,
      cpuUsage: vendorCpu ?? genericCpu ?? null,
      memUsage: vendorMem ?? genericMem ?? null,
      cpuTemperatureC: environment.cpuTemperatureC ?? null,
      inletTemperatureC: environment.inletTemperatureC ?? null,
      fanCount: environment.fanCount ?? 0,
      fanHealthyCount: environment.fanHealthyCount ?? 0,
      temperatureSensors: environment.temperatureSensors,
      fanSensors: environment.fanSensors,
      interfaceInBps: interfaceRates.interfaceInBps ?? null,
      interfaceOutBps: interfaceRates.interfaceOutBps ?? null,
      interfaces,
      lldpNeighbors,
      cdpNeighbors,
      arpEntries,
      macEntries,
      vlans,
    };
  } catch {
    return null;
  } finally {
    session.close();
  }
}
