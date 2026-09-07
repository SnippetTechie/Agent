import type { TabContext } from "../types.js";
import { markTabAccessedByVarma } from "./tabAccess.js";

const UNKNOWN: TabContext = { domain: null, isSecure: false };

/**
 * Real (not mocked) — chrome.tabs is cheap and safe to call for read-only
 * context, and it makes the header pill demo-authentic. Falls back
 * gracefully when run outside an extension context (e.g. `pnpm dev` in a
 * plain browser tab during UI iteration). domain is null rather than a
 * hardcoded English string when unknown — callers translate the fallback.
 */
export async function getActiveTabContext(): Promise<TabContext> {
  if (typeof chrome === "undefined" || !chrome.tabs) return UNKNOWN;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return UNKNOWN;
    if (typeof tab.id === "number") void markTabAccessedByVarma(tab.id);
    const url = new URL(tab.url);
    return {
      domain: url.hostname || url.protocol.replace(":", ""),
      faviconUrl: tab.favIconUrl,
      isSecure: url.protocol === "https:",
    };
  } catch {
    return UNKNOWN;
  }
}

export function watchActiveTabContext(onChange: (ctx: TabContext) => void): () => void {
  if (typeof chrome === "undefined" || !chrome.tabs) return () => {};

  const refresh = () => {
    getActiveTabContext().then(onChange);
  };

  chrome.tabs.onActivated.addListener(refresh);
  chrome.tabs.onUpdated.addListener(refresh);
  return () => {
    chrome.tabs.onActivated.removeListener(refresh);
    chrome.tabs.onUpdated.removeListener(refresh);
  };
}
