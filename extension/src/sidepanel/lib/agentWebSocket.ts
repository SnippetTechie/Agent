/**
 * WebSocket client for communicating with the V.A.R.M.A agent server.
 *
 * Manages the connection lifecycle: connect → start task → stream step events
 * → handle approval gates → receive final result.
 *
 * The server runs a native CDP agent (see server/agent/) that reads the page's
 * accessibility/DOM structure directly - no screenshots are sent to the model.
 * Each step streams the observed elements and the executed action back here so
 * the panel can render exactly what the agent saw and did.
 */

const WS_URL = "ws://127.0.0.1:8002/ws/agent";

// ─── Incoming message types (Server → Extension) ───────────────────────────

export interface WsConnected {
  type: "CONNECTED";
  cdp_url: string;
  url?: string;
}

export interface WsStepStart {
  type: "STEP_START";
  step: number;
  status: string;
}

/** One interactive element the agent could see on screen. */
export interface ObservedElement {
  i: number;
  tag: string;
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WsPageState {
  type: "PAGE_STATE";
  step: number;
  url: string;
  title: string;
  elements: ObservedElement[];
  observe_ms: number;
}

export interface WsAction {
  type: "ACTION";
  step: number;
  thought: string;
  action: BrowserUseActionPayload & {
    ok?: boolean;
    index?: number;
    label?: string;
    text?: string;
    url?: string;
    final_url?: string;
    key?: string;
    seconds?: number;
    error?: string;
  };
}

export interface StepTiming {
  observe_ms?: number;
  llm_ms?: number;
  action_ms?: number;
  total_ms?: number;
}

export interface WsStepComplete {
  type: "STEP_COMPLETE";
  step: number;
  thought: string;
  actions: BrowserUseActionPayload[];
  is_done: boolean;
  extracted_content?: string;
  timing?: StepTiming;
  usage?: Record<string, unknown>;
}

export interface WsApprovalRequired {
  type: "APPROVAL_REQUIRED";
  step: number;
  thought: string;
  actions: BrowserUseActionPayload[];
}

export interface WsFinalResult {
  type: "FINAL_RESULT";
  result: string;
  success: boolean;
  metrics?: Record<string, unknown>;
  elapsed_ms?: number;
}

export interface WsError {
  type: "ERROR";
  error: string;
  step?: number;
}

export interface WsStopped {
  type: "STOPPED";
  reason: string;
}

export interface BrowserUseActionPayload {
  name?: string;
  type?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export type WsServerMessage =
  | WsConnected
  | WsStepStart
  | WsPageState
  | WsAction
  | WsStepComplete
  | WsApprovalRequired
  | WsFinalResult
  | WsError
  | WsStopped;

// ─── Outgoing message types (Extension → Server) ───────────────────────────

export interface WsStartTask {
  type: "START_TASK";
  task: string;
  approval_mode: "manual" | "auto" | "skip";
  max_steps?: number;
  /** Draw numbered bounding boxes on the page. */
  show_overlay?: boolean;
  /** Animate the agent cursor + click ripples on the page. */
  show_cursor?: boolean;
}

export interface WsApprove {
  type: "APPROVE";
}

export interface WsDeny {
  type: "DENY";
}

export interface WsStop {
  type: "STOP";
}

/** Live toggle for the on-page visual layer (can be sent mid-run). */
export interface WsSetVisuals {
  type: "SET_VISUALS";
  overlay?: boolean;
  cursor?: boolean;
}

export type WsClientMessage = WsStartTask | WsApprove | WsDeny | WsStop | WsSetVisuals;

// ─── Event callback interface ──────────────────────────────────────────────

export interface AgentEventHandlers {
  onConnected?: (msg: WsConnected) => void;
  onStepStart?: (msg: WsStepStart) => void;
  /** The agent's view of the page for this step (element list + timings). */
  onPageState?: (msg: WsPageState) => void;
  /** A single action was executed (fired once per action, before STEP_COMPLETE). */
  onAction?: (msg: WsAction) => void;
  onStepComplete?: (msg: WsStepComplete) => void;
  onApprovalRequired?: (msg: WsApprovalRequired) => void;
  onFinalResult?: (msg: WsFinalResult) => void;
  onError?: (msg: WsError) => void;
  onStopped?: (msg: WsStopped) => void;
  onDisconnect?: () => void;
}

// ─── AgentConnection class ─────────────────────────────────────────────────

/**
 * Manages a single WebSocket session with the browser-use agent server.
 *
 * Usage:
 *   const conn = new AgentConnection(handlers);
 *   await conn.connect("Search for ISRO on Google", "manual");
 *   // ... events stream via handlers ...
 *   conn.approve();   // or conn.deny()
 *   conn.stop();      // abort the run
 *   conn.close();     // cleanup
 */
export class AgentConnection {
  private ws: WebSocket | null = null;
  private handlers: AgentEventHandlers;
  private closed = false;

  constructor(handlers: AgentEventHandlers) {
    this.handlers = handlers;
  }

  /**
   * Open the WebSocket and send START_TASK once connected.
   * Resolves when the connection is open and the task has been sent.
   * Rejects if the connection fails.
   */
  connect(
    task: string,
    approvalMode: "manual" | "auto" | "skip" = "manual",
    options: { maxSteps?: number; showOverlay?: boolean; showCursor?: boolean } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("AgentConnection already closed"));
        return;
      }

      try {
        this.ws = new WebSocket(WS_URL);
      } catch (err) {
        reject(
          new Error(
            `WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`
          )
        );
        return;
      }

      this.ws.onopen = () => {
        // Send the task immediately after connection
        this.send({
          type: "START_TASK",
          task,
          approval_mode: approvalMode,
          ...(options.maxSteps ? { max_steps: options.maxSteps } : {}),
          ...(options.showOverlay !== undefined ? { show_overlay: options.showOverlay } : {}),
          ...(options.showCursor !== undefined ? { show_cursor: options.showCursor } : {}),
        });
        resolve();
      };

      this.ws.onerror = (event) => {
        console.error("[agentWS] WebSocket error:", event);
        reject(
          new Error(
            "Could not connect to the agent server. Ensure it is running (python server/receiver.py)."
          )
        );
      };

      this.ws.onclose = () => {
        if (!this.closed) {
          this.handlers.onDisconnect?.();
        }
        this.ws = null;
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WsServerMessage;
          this.dispatch(msg);
        } catch (err) {
          console.warn("[agentWS] Failed to parse message:", event.data, err);
        }
      };
    });
  }

  /** Send an approval to proceed with the pending action. */
  approve(): void {
    this.send({ type: "APPROVE" });
  }

  /** Deny the pending action. */
  deny(): void {
    this.send({ type: "DENY" });
  }

  /** Request the server to stop the agent run. */
  stop(): void {
    this.send({ type: "STOP" });
  }

  /** Toggle the on-page overlay / cursor, even while the agent is running. */
  setVisuals(opts: { overlay?: boolean; cursor?: boolean }): void {
    this.send({ type: "SET_VISUALS", ...opts });
  }

  /** Close the WebSocket connection and mark as done. */
  close(): void {
    this.closed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
  }

  /** Check if the connection is still open. */
  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  // ── Private ────────────────────────────────────────────────────────────

  private send(msg: WsClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn("[agentWS] Cannot send, WebSocket not open:", msg.type);
    }
  }

  private dispatch(msg: WsServerMessage): void {
    switch (msg.type) {
      case "CONNECTED":
        this.handlers.onConnected?.(msg);
        break;
      case "STEP_START":
        this.handlers.onStepStart?.(msg);
        break;
      case "PAGE_STATE":
        this.handlers.onPageState?.(msg);
        break;
      case "ACTION":
        this.handlers.onAction?.(msg);
        break;
      case "STEP_COMPLETE":
        this.handlers.onStepComplete?.(msg);
        break;
      case "APPROVAL_REQUIRED":
        this.handlers.onApprovalRequired?.(msg);
        break;
      case "FINAL_RESULT":
        this.handlers.onFinalResult?.(msg);
        break;
      case "ERROR":
        this.handlers.onError?.(msg);
        break;
      case "STOPPED":
        this.handlers.onStopped?.(msg);
        break;
      default:
        console.warn("[agentWS] Unknown message type:", msg);
    }
  }
}

/**
 * Quick health-check: can we reach the server, the model and the browser?
 * Mirrors the shape of GET /health on the receiver.
 */
export async function checkServerHealth(): Promise<{
  ok: boolean;
  vllmReachable?: boolean;
  cdpReachable?: boolean;
  model?: string;
  cdpUrl?: string;
  error?: string;
}> {
  try {
    const res = await fetch("http://127.0.0.1:8002/health", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      vllm?: { reachable: boolean; model: string };
      cdp?: { reachable: boolean; url: string };
    };
    return {
      ok: true,
      vllmReachable: data.vllm?.reachable,
      cdpReachable: data.cdp?.reachable,
      model: data.vllm?.model,
      cdpUrl: data.cdp?.url,
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Server unreachable. Start with: python server/receiver.py",
    };
  }
}
