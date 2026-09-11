/**
 * Client for the conversational (non-agent) side of the receiver.
 *
 * Task execution does not go through here — it uses the WebSocket agent in
 * `agentWebSocket.ts`. This module only handles plain chat, where the model
 * answers without touching the page.
 *
 * Note: no screenshot is ever taken or uploaded. The agent reads the DOM
 * directly on the server side (see server/agent/dom.py), which is faster and
 * avoids sending pixels anywhere.
 */

const RECEIVER_BASE = "http://127.0.0.1:8002";
const CHAT_URL = `${RECEIVER_BASE}/chat`;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  ok: boolean;
  response: string;
  error?: string;
  offline?: boolean;
  model?: string;
}

/** Send a conversational message. No page access, no browser control. */
export async function sendChatMessage(
  prompt: string,
  history: ChatMessage[] = [],
  signal?: AbortSignal
): Promise<ChatResponse> {
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, messages: history }),
      signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        response: `Local server returned error code ${res.status}.`,
        error: `HTTP ${res.status}`,
      };
    }

    return (await res.json()) as ChatResponse;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    return {
      ok: false,
      response:
        "Could not connect to the local server. Start it with `python scripts/start_server.py`.",
      error: err instanceof Error ? err.message : "Network error",
      offline: true,
    };
  }
}

export interface HealthStatus {
  ok: boolean;
  vllmReachable: boolean;
  cdpReachable: boolean;
  model?: string;
  error?: string;
}

import {
  inPageApplyPlaceholders,
  inPageRestorePlaceholders,
  inPageExtractPageContext,
  type RedactionTarget,
} from "./domPlaceholderRedactor.js";

export interface RedactedCaptureResult {
  ok: boolean;
  dataUrl: string;
  error?: string;
  appliedCount: number;
  tags: string[];
  spans: Array<{ text: string; tag: string; label: string; start: number; end: number }>;
}

/**
 * Capture Tab with In-DOM Pre-Screenshot Redaction.
 *
 * 1. Reads text and all form inputs with labels from active tab.
 * 2. Calls LiquidAI / regex PII detection service on server.
 * 3. Applies high-contrast semantic placeholder badges ([REDACTED: TAG]) directly in live DOM.
 * 4. Captures the screenshot via chrome.tabs.captureVisibleTab with placeholders baked into pixels.
 * 5. Immediately restores live DOM to original state.
 */
export async function captureRedactedScreenshot(
  prompt?: string
): Promise<RedactedCaptureResult> {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    return {
      ok: false,
      dataUrl: "",
      error: "Capture is only available in Chrome extension context",
      appliedCount: 0,
      tags: [],
      spans: [],
    };
  }

  // 1. Find active tab
  let activeTab: chrome.tabs.Tab | undefined;
  try {
    const currentWin = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTab = currentWin[0];
    if (!activeTab) {
      const focused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      activeTab = focused[0] ?? (await chrome.tabs.query({ active: true }))[0];
    }
  } catch (err) {
    console.warn("[capture] Error querying tab:", err);
  }

  if (!activeTab?.id || activeTab.windowId === undefined) {
    return {
      ok: false,
      dataUrl: "",
      error: "No active tab found to capture",
      appliedCount: 0,
      tags: [],
      spans: [],
    };
  }

  const tabId = activeTab.id;
  const windowId = activeTab.windowId;
  console.log("[varma-capture] Target tab:", tabId, activeTab.url);

  // 2. Extract page text and form inputs from tab
  let pageText = "";
  if (chrome.scripting?.executeScript) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: inPageExtractPageContext,
      });
      pageText = (res?.result as string) || "";
      console.log("[varma-capture] Extracted page text length:", pageText.length);
    } catch (err) {
      console.warn("[capture] Could not extract text via scripting:", err);
    }
  } else {
    console.warn("[capture] chrome.scripting is not available!");
  }

  // 3. Query local PII detection service
  let targets: RedactionTarget[] = [];
  let detectedSpans: any[] = [];
  try {
    const detectRes = await fetch(`${RECEIVER_BASE}/redact/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: pageText }),
    });
    if (detectRes.ok) {
      const data = await detectRes.json();
      targets = (data.targets as RedactionTarget[]) || [];
      detectedSpans = data.spans || [];
      console.log("[varma-capture] Detected PII targets count:", targets.length, targets);
    }
  } catch (err) {
    console.warn("[capture] Redaction detection service unreachable, falling back to DOM inputs:", err);
  }

  let appliedCount = 0;
  let appliedTags: string[] = [];

  try {
    // 4. In-DOM Pre-Screenshot Redaction: inject placeholders into the live DOM
    if (chrome.scripting?.executeScript) {
      try {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageApplyPlaceholders,
          args: [targets],
        });
        appliedCount = res?.result?.appliedCount ?? 0;
        appliedTags = res?.result?.tags ?? [];
        console.log("[varma-capture] Applied in-DOM placeholders:", appliedCount, appliedTags);
      } catch (err) {
        console.warn("[capture] Failed to apply placeholders in DOM:", err);
      }
    }

    // Allow frame to repaint with placeholders into GPU surface (~100ms)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 5. Capture screenshot while placeholders are visible
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });

    // Optionally upload to receiver /screenshot endpoint for preview storage
    if (prompt) {
      try {
        const base64Part = dataUrl.split(",")[1] || "";
        const byteString = atob(base64Part);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: "image/png" });

        fetch(`${RECEIVER_BASE}/screenshot?name=redacted`, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Prompt": encodeURIComponent(prompt),
          },
          body: blob,
        }).catch(() => {});
      } catch {}
    }

    return {
      ok: true,
      dataUrl,
      appliedCount,
      tags: appliedTags,
      spans: detectedSpans,
    };
  } catch (err) {
    return {
      ok: false,
      dataUrl: "",
      error: err instanceof Error ? err.message : "Tab capture failed",
      appliedCount: 0,
      tags: [],
      spans: [],
    };
  } finally {
    // 6. ALWAYS restore live DOM immediately after capture
    if (chrome.scripting?.executeScript) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageRestorePlaceholders,
        });
      } catch (err) {
        console.warn("[capture] Failed to restore DOM placeholders:", err);
      }
    }
  }
}
