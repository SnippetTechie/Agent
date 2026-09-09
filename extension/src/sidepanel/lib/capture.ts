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
const HEALTH_URL = `${RECEIVER_BASE}/health`;

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

/** Check whether the model and the browser are both reachable. */
export async function checkHealth(): Promise<HealthStatus> {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return { ok: false, vllmReachable: false, cdpReachable: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      vllm?: { reachable: boolean; model: string };
      cdp?: { reachable: boolean };
    };
    return {
      ok: true,
      vllmReachable: Boolean(data.vllm?.reachable),
      cdpReachable: Boolean(data.cdp?.reachable),
      model: data.vllm?.model,
    };
  } catch (err) {
    return {
      ok: false,
      vllmReachable: false,
      cdpReachable: false,
      error: err instanceof Error ? err.message : "Server unreachable",
    };
  }
}
