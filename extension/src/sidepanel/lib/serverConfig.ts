import { loadLocalState, saveLocalState } from "./storage.js";

const STORAGE_KEY = "varma.server.url";

export const DEFAULT_RECEIVER_URL = "https://varma.jrushvj.dev";

let cachedServerUrl: string = DEFAULT_RECEIVER_URL;

export async function getServerBaseUrl(): Promise<string> {
  try {
    const saved = await loadLocalState<string>(STORAGE_KEY);
    if (saved && typeof saved === "string" && saved.trim()) {
      cachedServerUrl = saved.trim().replace(/\/+$/, "");
      return cachedServerUrl;
    }
  } catch (err) {
    console.warn("[serverConfig] Failed to load saved server url:", err);
  }
  return cachedServerUrl;
}

export async function setServerBaseUrl(url: string): Promise<string> {
  const clean = (url || DEFAULT_RECEIVER_URL).trim().replace(/\/+$/, "");
  cachedServerUrl = clean;
  await saveLocalState(STORAGE_KEY, clean);
  return clean;
}

export async function resetServerBaseUrl(): Promise<string> {
  cachedServerUrl = DEFAULT_RECEIVER_URL.replace(/\/+$/, "");
  await saveLocalState(STORAGE_KEY, null);
  return cachedServerUrl;
}

export async function getWsUrl(): Promise<string> {
  const base = await getServerBaseUrl();
  let wsBase = base;
  if (wsBase.startsWith("https://")) {
    wsBase = "wss://" + wsBase.slice(8);
  } else if (wsBase.startsWith("http://")) {
    wsBase = "ws://" + wsBase.slice(7);
  } else if (!wsBase.startsWith("ws://") && !wsBase.startsWith("wss://")) {
    wsBase = "ws://" + wsBase;
  }
  return `${wsBase}/ws/agent`;
}

export async function getHealthUrl(): Promise<string> {
  const base = await getServerBaseUrl();
  return `${base}/health`;
}

export async function getChatUrl(): Promise<string> {
  const base = await getServerBaseUrl();
  return `${base}/chat`;
}

export async function checkServerHealth(customUrl?: string): Promise<{
  ok: boolean;
  model?: string;
  statusText?: string;
}> {
  try {
    const base = customUrl ? customUrl.trim().replace(/\/+$/, "") : await getServerBaseUrl();
    const res = await fetch(`${base}/health`, { method: "GET" });
    if (!res.ok) {
      return { ok: false, statusText: `HTTP ${res.status}` };
    }
    const data = await res.json();
    const model = data?.vllm?.model || data?.models?.reasoning || "gemma-4-12b-it";
    return { ok: true, model, statusText: "Online" };
  } catch (err) {
    return {
      ok: false,
      statusText: err instanceof Error ? err.message : "Unreachable",
    };
  }
}
