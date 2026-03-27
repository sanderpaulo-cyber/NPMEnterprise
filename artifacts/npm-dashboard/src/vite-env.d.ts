/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL absoluta da API (ex.: http://127.0.0.1:8080) quando não usa o proxy do Vite */
  readonly VITE_API_BASE_URL?: string;
}
