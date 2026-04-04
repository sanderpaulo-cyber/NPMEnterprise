/**
 * Registo central de áreas de configuração (extensível).
 * Novas opções devem ser documentadas aqui para manter um único ponto de referência.
 */
export const SETTINGS_SECTION_IDS = [
  "interface",
  "connection",
  "server",
  "persisted",
  "shortcuts",
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

export type SettingFieldDefinition = {
  id: string;
  label: string;
  description?: string;
  /** "client" = localStorage / browser; "server" = env (read-only); "persisted" = BD via API */
  scope: "client" | "server" | "persisted";
  /** chave em `DashboardLocalSettings` ou em `persisted` na API */
  key: string;
  valueType: "string" | "number" | "boolean" | "enum" | "json";
  enumOptions?: ReadonlyArray<{ value: string; label: string }>;
};

/** Campos já suportados na UI; acrescente entradas conforme novas funcionalidades. */
export const KNOWN_SETTING_FIELDS: SettingFieldDefinition[] = [
  {
    id: "theme",
    label: "Tema",
    description: "Aparência clara, escura ou do sistema.",
    scope: "client",
    key: "interface.theme",
    valueType: "enum",
    enumOptions: [
      { value: "system", label: "Sistema" },
      { value: "light", label: "Claro" },
      { value: "dark", label: "Escuro" },
    ],
  },
  {
    id: "locale",
    label: "Idioma",
    description: "Preferência guardada para futura internacionalização.",
    scope: "client",
    key: "interface.locale",
    valueType: "enum",
    enumOptions: [
      { value: "pt", label: "Português" },
      { value: "en", label: "English" },
    ],
  },
  {
    id: "dataRefreshIntervalMs",
    label: "Intervalo de atualização (ms)",
    description:
      "0 mantém o comportamento padrão do dashboard; outros valores preparam invalidação de cache.",
    scope: "client",
    key: "interface.dataRefreshIntervalMs",
    valueType: "number",
  },
  {
    id: "apiBaseUrl",
    label: "URL base da API",
    description:
      "Vazio = mesmo host com proxy /api (recomendado em desenvolvimento).",
    scope: "client",
    key: "connection.apiBaseUrl",
    valueType: "string",
  },
];
