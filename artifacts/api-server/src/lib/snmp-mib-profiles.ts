export interface SnmpVendorProfile {
  id: string;
  vendor: string;
  family?: string;
  priority?: number;
  enterpriseRoots: string[];
  sysDescrHints?: string[];
  sysDescrAllHints?: string[];
  cpuTableBases?: string[];
  cpuScalarOids?: string[];
  ignoreZeroCpuValues?: boolean;
  memoryPercentOids?: string[];
  memoryUsedFreePairs?: Array<{
    used: string;
    free: string;
  }>;
  memoryTotalFreePairs?: Array<{
    total: string;
    free: string;
  }>;
  inventorySources: string[];
  environmentSources: string[];
}

export const SNMP_VENDOR_PROFILES: SnmpVendorProfile[] = [
  {
    id: "cisco-nxos",
    vendor: "Cisco",
    family: "Cisco NX-OS",
    priority: 220,
    enterpriseRoots: ["1.3.6.1.4.1.9"],
    sysDescrHints: ["nexus", "nx-os", "nxos"],
    cpuTableBases: [
      "1.3.6.1.4.1.9.9.109.1.1.1.1.25",
      "1.3.6.1.4.1.9.9.109.1.1.1.1.8",
      "1.3.6.1.2.1.25.3.3.1.2",
    ],
    memoryUsedFreePairs: [
      {
        used: "1.3.6.1.4.1.9.9.48.1.1.1.6",
        free: "1.3.6.1.4.1.9.9.48.1.1.1.5",
      },
    ],
    inventorySources: ["ENTITY-MIB", "CISCO-ENTITY-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "CISCO-ENVMON-MIB"],
  },
  {
    id: "cisco-ios",
    vendor: "Cisco",
    family: "Cisco IOS/IOS-XE",
    priority: 210,
    enterpriseRoots: ["1.3.6.1.4.1.9"],
    sysDescrHints: ["cisco ios", "ios xe", "catalyst", "isr", "asr"],
    cpuTableBases: [
      "1.3.6.1.4.1.9.9.109.1.1.1.1.25",
      "1.3.6.1.4.1.9.9.109.1.1.1.1.8",
      "1.3.6.1.2.1.25.3.3.1.2",
    ],
    memoryUsedFreePairs: [
      {
        used: "1.3.6.1.4.1.9.9.48.1.1.1.6",
        free: "1.3.6.1.4.1.9.9.48.1.1.1.5",
      },
    ],
    inventorySources: ["ENTITY-MIB", "CISCO-ENTITY-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "CISCO-ENVMON-MIB"],
  },
  {
    id: "cisco-security",
    vendor: "Cisco",
    family: "Cisco ASA/Firepower",
    priority: 205,
    enterpriseRoots: ["1.3.6.1.4.1.9"],
    sysDescrHints: ["adaptive security appliance", "firepower", "cisco asa"],
    cpuTableBases: [
      "1.3.6.1.4.1.9.9.109.1.1.1.1.25",
      "1.3.6.1.4.1.9.9.109.1.1.1.1.8",
      "1.3.6.1.2.1.25.3.3.1.2",
    ],
    memoryUsedFreePairs: [
      {
        used: "1.3.6.1.4.1.9.9.48.1.1.1.6",
        free: "1.3.6.1.4.1.9.9.48.1.1.1.5",
      },
    ],
    inventorySources: ["ENTITY-MIB", "CISCO-ENTITY-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "CISCO-ENVMON-MIB"],
  },
  {
    id: "cisco-generic",
    vendor: "Cisco",
    family: "Cisco Generic",
    priority: 100,
    enterpriseRoots: ["1.3.6.1.4.1.9"],
    sysDescrHints: ["cisco"],
    cpuTableBases: [
      "1.3.6.1.4.1.9.9.109.1.1.1.1.25",
      "1.3.6.1.4.1.9.9.109.1.1.1.1.8",
      "1.3.6.1.2.1.25.3.3.1.2",
    ],
    memoryUsedFreePairs: [
      {
        used: "1.3.6.1.4.1.9.9.48.1.1.1.6",
        free: "1.3.6.1.4.1.9.9.48.1.1.1.5",
      },
    ],
    inventorySources: ["ENTITY-MIB", "CISCO-ENTITY-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "CISCO-ENVMON-MIB"],
  },
  {
    id: "juniper-junos",
    vendor: "Juniper",
    family: "Juniper Junos",
    priority: 200,
    enterpriseRoots: ["1.3.6.1.4.1.2636"],
    sysDescrHints: ["juniper", "junos"],
    cpuTableBases: ["1.3.6.1.4.1.2636.3.1.13.1.8", "1.3.6.1.2.1.25.3.3.1.2"],
    memoryPercentOids: ["1.3.6.1.4.1.2636.3.1.13.1.11"],
    inventorySources: ["ENTITY-MIB", "JUNIPER-MIB", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "JUNIPER-MIB"],
  },
  {
    id: "fortigate",
    vendor: "Fortinet",
    family: "FortiGate",
    priority: 220,
    enterpriseRoots: ["1.3.6.1.4.1.12356"],
    sysDescrHints: ["fortigate"],
    cpuScalarOids: ["1.3.6.1.4.1.12356.101.4.1.3.0"],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    memoryPercentOids: ["1.3.6.1.4.1.12356.101.4.1.4.0"],
    inventorySources: ["ENTITY-MIB", "FORTINET-FORTIGATE-MIB", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "FORTINET-FORTIGATE-MIB"],
  },
  {
    id: "fortinet-generic",
    vendor: "Fortinet",
    family: "Fortinet Generic",
    priority: 100,
    enterpriseRoots: ["1.3.6.1.4.1.12356"],
    sysDescrHints: ["fortinet"],
    cpuScalarOids: ["1.3.6.1.4.1.12356.101.4.1.3.0"],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    memoryPercentOids: ["1.3.6.1.4.1.12356.101.4.1.4.0"],
    inventorySources: ["ENTITY-MIB", "FORTINET-FORTIGATE-MIB", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "FORTINET-FORTIGATE-MIB"],
  },
  {
    id: "arista-eos",
    vendor: "Arista",
    family: "Arista EOS",
    priority: 200,
    enterpriseRoots: ["1.3.6.1.4.1.30065"],
    sysDescrHints: ["arista", "eos"],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    inventorySources: ["ENTITY-MIB", "ARISTA-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "ARISTA-HARDWARE-UTILIZATION-MIB"],
  },
  {
    id: "aruba-cx",
    vendor: "HPE/Aruba",
    family: "Aruba CX",
    priority: 220,
    enterpriseRoots: ["1.3.6.1.4.1.11", "1.3.6.1.4.1.14823"],
    sysDescrHints: ["arubaos-cx", "aruba cx", "cx "],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    inventorySources: ["ENTITY-MIB", "ARUBA-CX-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "ARUBA-CX-*"],
  },
  {
    id: "aruba-procurve",
    vendor: "HPE/Aruba",
    family: "ArubaOS-Switch/ProCurve",
    priority: 210,
    enterpriseRoots: ["1.3.6.1.4.1.11", "1.3.6.1.4.1.14823"],
    sysDescrHints: ["procurve", "arubaos-switch", "hewlett", "hpe"],
    cpuScalarOids: [
      "1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0",
      "1.3.6.1.4.1.11.2.1.7.0",
    ],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    inventorySources: ["ENTITY-MIB", "HP-ICF-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "HP-ICF-*"],
  },
  {
    id: "aruba-generic",
    vendor: "HPE/Aruba",
    family: "HPE/Aruba Generic",
    priority: 100,
    enterpriseRoots: ["1.3.6.1.4.1.11", "1.3.6.1.4.1.14823"],
    sysDescrHints: ["aruba", "hewlett", "hpe"],
    cpuScalarOids: [
      "1.3.6.1.4.1.11.2.14.11.5.1.9.6.1.0",
      "1.3.6.1.4.1.11.2.1.7.0",
    ],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    inventorySources: ["ENTITY-MIB", "HP-ICF-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "HP-ICF-*"],
  },
  {
    id: "dell-n-series",
    vendor: "Dell",
    family: "Dell N-Series",
    priority: 220,
    enterpriseRoots: ["1.3.6.1.4.1.674", "1.3.6.1.4.1.89"],
    sysDescrHints: ["dell emc networking n", "networking n", "n1124", "n2024", "n3024", "n3048", "n4032"],
    cpuScalarOids: ["1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.4.0"],
    cpuTableBases: [
      "1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.9",
      "1.3.6.1.2.1.25.3.3.1.2",
    ],
    ignoreZeroCpuValues: true,
    memoryTotalFreePairs: [
      {
        total: "1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.2",
        free: "1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.1",
      },
    ],
    inventorySources: ["ENTITY-MIB", "DELL-NETWORKING-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "DELL-*"],
  },
  {
    id: "dell-powerconnect",
    vendor: "Dell",
    family: "Dell PowerConnect",
    priority: 210,
    enterpriseRoots: ["1.3.6.1.4.1.674", "1.3.6.1.4.1.89"],
    sysDescrHints: ["powerconnect"],
    cpuScalarOids: ["1.3.6.1.4.1.89.1.8.0"],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    ignoreZeroCpuValues: true,
    memoryTotalFreePairs: [
      {
        total: "1.3.6.1.4.1.89.29.11.2",
        free: "1.3.6.1.4.1.89.29.11.1",
      },
    ],
    inventorySources: ["ENTITY-MIB", "POWERCONNECT-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "POWERCONNECT-*"],
  },
  {
    id: "dell-generic",
    vendor: "Dell",
    family: "Dell Generic",
    priority: 100,
    enterpriseRoots: ["1.3.6.1.4.1.674", "1.3.6.1.4.1.89"],
    sysDescrHints: ["dell"],
    cpuScalarOids: ["1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.4.0"],
    cpuTableBases: [
      "1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.9",
      "1.3.6.1.2.1.25.3.3.1.2",
    ],
    ignoreZeroCpuValues: true,
    memoryTotalFreePairs: [
      {
        total: "1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.2",
        free: "1.3.6.1.4.1.674.10895.5000.2.6132.1.1.1.1.4.1",
      },
    ],
    inventorySources: ["ENTITY-MIB", "DELL-NETWORKING-*", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "DELL-*"],
  },
  {
    id: "mikrotik-routeros",
    vendor: "MikroTik",
    family: "MikroTik RouterOS",
    priority: 200,
    enterpriseRoots: ["1.3.6.1.4.1.14988"],
    sysDescrHints: ["mikrotik", "routeros"],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    inventorySources: ["ENTITY-MIB", "MIKROTIK-MIB", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "MIKROTIK-MIB"],
  },
  {
    id: "palo-alto-pan-os",
    vendor: "Palo Alto",
    family: "Palo Alto PAN-OS",
    priority: 200,
    enterpriseRoots: ["1.3.6.1.4.1.25461"],
    sysDescrHints: ["palo alto", "panos", "pa-"],
    cpuTableBases: ["1.3.6.1.2.1.25.3.3.1.2"],
    inventorySources: ["ENTITY-MIB", "PAN-COMMON-MIB", "HOST-RESOURCES-MIB"],
    environmentSources: ["ENTITY-SENSOR-MIB", "PAN-COMMON-MIB"],
  },
];

function matchesEnterpriseRoot(sysObjectId: string | undefined, root: string) {
  return sysObjectId === root || sysObjectId?.startsWith(`${root}.`) === true;
}

export function resolveSnmpVendorProfile(input: {
  sysObjectId?: string;
  sysDescr?: string;
}) {
  const sysDescr = input.sysDescr?.toLowerCase() ?? "";
  const matches = SNMP_VENDOR_PROFILES.filter((profile) => {
    const rootMatch =
      input.sysObjectId &&
      profile.enterpriseRoots.some((root) => matchesEnterpriseRoot(input.sysObjectId, root));
    const anyHintMatch =
      profile.sysDescrHints?.some((hint) => sysDescr.includes(hint.toLowerCase())) ?? false;
    const allHintsMatch =
      profile.sysDescrAllHints?.every((hint) => sysDescr.includes(hint.toLowerCase())) ?? true;
    return (rootMatch || anyHintMatch) && allHintsMatch;
  });

  return matches.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))[0];
}
