/**
 * Captures the active tab's visible viewport with chrome.tabs.captureVisibleTab
 * and POSTs the PNG to the local receiver server (http://127.0.0.1:8000/screenshot).
 *
 * This saves screenshots directly into the project's screenshots/ directory
 * with zero browser popups and zero settings changes required from users.
 *
 * Falls back gracefully when run outside an extension context or when the receiver
 * server is temporarily offline.
 */

const RECEIVER_URL = "http://127.0.0.1:8000/screenshot";

export interface CaptureResult {
  ok: boolean;
  /** The captured viewport as a data URL ("" when capture failed). */
  dataUrl: string;
  /** Human-readable reason when ok is false. */
  error?: string;
  /** Path where the PNG was saved on the machine (e.g. screenshots/<timestamp>-<name>.png). */
  savedPath?: string;
  /** Number of bytes saved. */
  bytes?: number;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Capture the visible tab in the current window.
 */
async function captureVisibleTab(): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    throw new Error("captureVisibleTab is unavailable outside extension context");
  }

  let windowId: number | undefined;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.windowId !== undefined) {
      windowId = activeTab.windowId;
    }
  } catch {
    // Ignore and fallback to current window
  }

  return new Promise((resolve, reject) => {
    const cb = (dataUrl?: string) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!dataUrl) {
        reject(new Error("No image data captured"));
      } else {
        resolve(dataUrl);
      }
    };

    if (typeof windowId === "number") {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, cb);
    } else {
      chrome.tabs.captureVisibleTab({ format: "png" }, cb);
    }
  });
}

/**
 * Capture the active tab and send the screenshot directly to the local receiver.
 * `prompt` is sanitized and used as the filename hint.
 */
export async function captureAndSaveScreenshot(prompt: string): Promise<CaptureResult> {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    return {
      ok: false,
      dataUrl: "",
      error: "Capture unavailable outside extension context",
    };
  }

  let dataUrl: string;
  try {
    dataUrl = await captureVisibleTab();
  } catch (err) {
    return {
      ok: false,
      dataUrl: "",
      error: err instanceof Error ? err.message : "Tab capture failed",
    };
  }

  const safeName = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  const blob = dataUrlToBlob(dataUrl);

  try {
    const res = await fetch(`${RECEIVER_URL}?name=${encodeURIComponent(safeName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: blob,
    });

    if (!res.ok) {
      return {
        ok: false,
        dataUrl,
        error: `Receiver error (${res.status})`,
      };
    }

    const json = (await res.json()) as { ok: boolean; path?: string; bytes?: number };
    return {
      ok: true,
      dataUrl,
      savedPath: json.path,
      bytes: json.bytes,
    };
  } catch (err) {
    return {
      ok: false,
      dataUrl,
      error: "Local receiver offline (start with: python server/receiver.py)",
    };
  }
}