import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import {
  readStoredApiBaseUrl,
  sanitizeApiBaseUrl,
} from "@/lib/dashboard-local-settings";

const storedBase = readStoredApiBaseUrl();
const envBase = sanitizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL?.trim() ?? "",
);
if (storedBase) {
  setBaseUrl(storedBase);
} else if (envBase) {
  setBaseUrl(envBase);
}

createRoot(document.getElementById("root")!).render(<App />);
