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

import type { HealthStatus } from "../types.js";
import { executeDriverAction, type DriverActionRequest } from "./extensionDriver.js";
import { getWsUrl, getHealthUrl } from "./serverConfig.js";

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
  /** Which gate raised this: manual waits for a click, auto self-resolves. */
  mode?: "manual" | "auto";
  /** Seconds the server will wait before giving up (manual mode). */
  timeout_s?: number;
}

/** Layer-1 redaction report for the step's page read. */
export interface WsRedactions {
  type: "REDACTIONS";
  step: number;
  redactions: { tag: string; label: string; count: number }[];
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

/**
 * A viewport screenshot the agent took for this step.
 *
 * Sent for the panel's preview only. The image has already been used for the
 * model call by the time this arrives; it is echoed back so the user can see
 * exactly what the agent looked at, which is otherwise invisible.
 */
export interface WsScreenshot {
  type: "SCREENSHOT";
  step: number;
  /** `data:image/png;base64,...` */
  image: string;
  width: number;
  height: number;
  bytes: number;
  capture_ms?: number;
}

/**
 * The agent's opening read of the screen: what is visible, whether anything
 * blocks the task, and the plan it intends to follow.
 */
export interface WsDescription {
  type: "DESCRIPTION";
  step: number;
  ok?: boolean;
  error?: string;
  screen?: string;
  ready?: boolean;
  blockers?: string;
  plan?: string[];
  /** The same frame as the screenshot event, for the inline preview. */
  screenshot?: string;
}

/** The run stopped because the page stopped changing. */
export interface WsStalled {
  type: "STALLED";
  step: number;
  streak: number;
  threshold: number;
  reason: string;
}

/** A completion claim was refused because it carried no supporting evidence. */
export interface WsDoneRejected {
  type: "DONE_REJECTED";
  step: number;
  reason: string;
  attempts: number;
  max_attempts: number;
}

/** A completion claim was accepted, with the evidence that justified it. */
export interface WsDoneVerified {
  type: "DONE_VERIFIED";
  step: number;
  reason: string;
  evidence?: string;
}

export type WsServerMessage =
  | WsConnected
  | WsStepStart
  | WsPageState
  | WsScreenshot
  | WsDescription
  | WsAction
  | WsStepComplete
  | WsApprovalRequired
  | WsRedactions
  | WsStalled
  | WsDoneRejected
  | WsDoneVerified
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
  /** Layer-1 deterministic PII redaction before anything reaches the model. */
  auto_redact?: boolean;
  /**
   * "single" pins the agent to the tab it attached to; "all" lets it open and
   * follow new tabs (a navigate with new_tab, or a link that spawns one).
   */
  tab_scope?: "single" | "all";
  supports_driver?: boolean;
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
  redact?: boolean;
}

export type WsClientMessage = WsStartTask | WsApprove | WsDeny | WsStop | WsSetVisuals;

// ─── Event callback interface ──────────────────────────────────────────────

export interface AgentEventHandlers {
  onConnected?: (msg: WsConnected) => void;
  onStepStart?: (msg: WsStepStart) => void;
  /** The agent's view of the page for this step (element list + timings). */
  onPageState?: (msg: WsPageState) => void;
  /** The viewport the agent captured for this step, for the preview. */
  onScreenshot?: (msg: WsScreenshot) => void;
  /** The agent's opening description of the screen plus its plan. */
  onDescription?: (msg: WsDescription) => void;
  /** A single action was executed (fired once per action, before STEP_COMPLETE). */
  onAction?: (msg: WsAction) => void;
  onStepComplete?: (msg: WsStepComplete) => void;
  onApprovalRequired?: (msg: WsApprovalRequired) => void;
  /** On-device redaction report for the step's page read. */
  onRedactions?: (msg: WsRedactions) => void;
  /** The run ended because the page stopped changing. */
  onStalled?: (msg: WsStalled) => void;
  /** A completion claim was refused for lack of evidence. */
  onDoneRejected?: (msg: WsDoneRejected) => void;
  /** A completion claim was accepted. */
  onDoneVerified?: (msg: WsDoneVerified) => void;
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
    options: {
      maxSteps?: number;
      showOverlay?: boolean;
      showCursor?: boolean;
      autoRedact?: boolean;
      tabScope?: "single" | "all";
      userId?: string;
      userEmail?: string;
    } = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error("AgentConnection already closed"));
        return;
      }

      // The socket can fail in more than one way (error then close, or a close
      // with no error). Settle the promise exactly once.
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(message));
      };
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      getWsUrl()
        .then((wsUrl) => {
          if (this.closed) return;
          try {
            this.ws = new WebSocket(wsUrl);
          } catch (err) {
            fail(
              `WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`
            );
            return;
          }

          this.ws.onopen = () => {
            // Send the task immediately after connection
            this.send({
              type: "START_TASK",
              task,
              approval_mode: approvalMode,
              supports_driver: true,
              ...(options.maxSteps ? { max_steps: options.maxSteps } : {}),
              ...(options.showOverlay !== undefined ? { show_overlay: options.showOverlay } : {}),
              ...(options.showCursor !== undefined ? { show_cursor: options.showCursor } : {}),
              ...(options.autoRedact !== undefined ? { auto_redact: options.autoRedact } : {}),
              ...(options.tabScope ? { tab_scope: options.tabScope } : {}),
              ...(options.userId ? { user_id: options.userId } : {}),
              ...(options.userEmail ? { user_email: options.userEmail } : {}),
            });
            succeed();
          };

          this.ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data) as WsServerMessage;
              this.dispatch(msg);
            } catch (err) {
              console.warn("[agentWS] Failed to parse message:", event.data, err);
            }
          };

          this.ws.onerror = () => {
            fail(
              `Could not connect to the agent server on ${wsUrl}. ` +
                "Ensure the server is running."
            );
          };

          this.ws.onclose = () => {
            fail("The agent server closed the connection.");
            if (!this.closed) {
              this.handlers.onDisconnect?.();
            }
            this.ws = null;
          };
        })
        .catch((err) => {
          fail(`Could not resolve server URL: ${err instanceof Error ? err.message : String(err)}`);
        });
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

  /** Toggle the on-page overlay / cursor / redaction, even mid-run. */
  setVisuals(opts: { overlay?: boolean; cursor?: boolean; redact?: boolean }): void {
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
      case "SCREENSHOT":
        this.handlers.onScreenshot?.(msg);
        break;
      case "DESCRIPTION":
        this.handlers.onDescription?.(msg);
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
      case "REDACTIONS":
        this.handlers.onRedactions?.(msg);
        break;
      case "STALLED":
        this.handlers.onStalled?.(msg);
        break;
      case "DONE_REJECTED":
        this.handlers.onDoneRejected?.(msg);
        break;
      case "DONE_VERIFIED":
        this.handlers.onDoneVerified?.(msg);
        break;
      case "FINAL_RESULT":
        this.handlers.onFinalResult?.(msg);
        break;
      case "DRIVER_REQUEST" as any:
        void (async () => {
          const resp = await executeDriverAction(msg as unknown as DriverActionRequest);
          this.send(resp as unknown as WsClientMessage);
        })();
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
export async function checkServerHealth(): Promise<HealthStatus> {
  try {
    const healthUrl = await getHealthUrl();
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) {
      return { serverUp: false, vllmReachable: false, cdpReachable: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      vllm?: { reachable: boolean; model: string };
      cdp?: { reachable: boolean };
    };
    return {
      serverUp: true,
      vllmReachable: Boolean(data.vllm?.reachable),
      cdpReachable: Boolean(data.cdp?.reachable),
      model: data.vllm?.model,
    };
  } catch (err) {
    return {
      serverUp: false,
      vllmReachable: false,
      cdpReachable: false,
      error: err instanceof Error ? err.message : "Server unreachable",
    };
  }
}
