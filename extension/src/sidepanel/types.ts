export type StepCategory = "sanitizing" | "reasoning" | "executing" | "completed";
export type StepStatus = "pending" | "active" | "done" | "error" | "skipped";

/**
 * Sensitive-data categories the local layer can tag. Retained so the audit log
 * and redaction UI keep a stable vocabulary; the current agent path is
 * DOM-only and does not emit redaction boxes.
 */
export type RedactionTag = "CREDENTIAL" | "COORDINATES" | "FACE" | "ID_NUMBER" | "SIGNATURE";

/**
 * A structured action emitted by the agent (click, type, scroll, etc.).
 * Serialized from the server's step events.
 */
export interface BrowserUseAction {
  name?: string;
  type?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  category: StepCategory;
  status: StepStatus;
  /** The action(s) the agent executed in this step. */
  actions?: BrowserUseAction[];
}

export type ApprovalState = "pending" | "approved" | "denied" | "expired";

export interface ApprovalRequest {
  id: string;
  actionLabel: string;
  riskNote: string;
  state: ApprovalState;
  /** The approval mode this request was raised under. */
  mode?: ApprovalMode;
  /** Agent step that raised the request. */
  step?: number;
  /** Epoch ms after which the server stops waiting (manual mode only). */
  expiresAt?: number;
}

/** One category of sensitive data masked on-device before any dispatch. */
export interface RedactionNotice {
  tag: RedactionTag;
  /** Human label for the masked field, e.g. `input:password`. */
  label: string;
  count: number;
}

/**
 * Reachability of the receiver, the model and the browser.
 *
 * Mirrors the `vllm` and `cdp` blocks of GET /health. `serverUp` is separate
 * from the other two because a receiver that answers while its model and its
 * browser are both down is a different problem from an unreachable receiver.
 */
export interface HealthStatus {
  serverUp: boolean;
  vllmReachable: boolean;
  cdpReachable: boolean;
  /** The model the receiver reports it will use, when it answered. */
  model?: string;
  error?: string;
}

/**
 * A model the server can be asked for, as advertised by GET /models.
 *
 * The catalog is the server's, not the panel's: the panel may only offer models
 * the operator actually loaded. A model that cannot accept an image is never
 * offered for game mode, because grounding needs to see the screen.
 */
export interface ModelInfo {
  id: string;
  /** Can accept an image and therefore ground a point for game mode. */
  vision: boolean;
  modes: AgentMode[];
  tasks: string[];
  /** The model the panel is currently using for reasoning. */
  selected?: boolean;
  /** True when a foreign launcher owns the endpoint and this was not declared. */
  undeclared?: boolean;
}

/** One model role (reasoning / precision) as the server reports it. */
export interface ModelRole {
  base_url: string;
  model: string;
  /** The name the operator configured, which may differ from what is serving. */
  configured_model?: string;
  reachable: boolean;
  enabled?: boolean;
  available_models: string[];
  alias_ok?: boolean;
  /**
   * "ready" | "loading" | "disabled". The panel distinguishes these because
   * "switched off" and "not loaded yet" need different words and different
   * actions from the user.
   */
  load_state?: "ready" | "loading" | "disabled";
  /** "dedicated" | "reasoning_vision" | "disabled" | "no_vision" | "unreachable". */
  source?: string;
}

/** What the server can currently do, and why not when it cannot. */
export interface ServerCapabilities {
  normal: string[];
  game: string[];
  precision_ready: boolean;
  precision_reason: string;
  precision_source?: string;
  precision_model?: string | null;
}

/**
 * The full picture: which model is loaded, what it can do, and what is wrong.
 * Mirrors GET /models on the receiver.
 */
export interface ModelStatus {
  serverUp: boolean;
  catalog: ModelInfo[];
  roles: { reasoning?: ModelRole; precision?: ModelRole };
  capabilities?: ServerCapabilities;
  cdpReachable: boolean;
  /** Populated only when the receiver itself could not be reached. */
  error?: string;
}

export type TurnStatus =
  | "running"
  | "awaiting-approval"
  | "completed"
  | "denied"
  | "stopped"
  | "error";

export type TurnMode = "chat" | "vision";
export type ContextMode = "auto" | "page" | "chat";
export type TabScope = "single" | "all";

/**
 * Which agent loop drives the run.
 *
 * - normal: the DOM loop. Reasons over an indexed element map and clicks by
 *   index. Cheap, exact, and the right tool for browsing, search and messaging.
 * - game: the precision loop. Takes a screenshot and grounds a click to a pixel
 *   coordinate, which is the only way to drive a board or a canvas that exposes
 *   no useful DOM.
 */
export type AgentMode = "normal" | "game";

export interface AgentTurn {
  id: string;
  prompt: string;
  createdAt: number;
  mode?: TurnMode;
  /** Conversational text response from the assistant. */
  response?: string;
  steps: AgentStep[];
  approval?: ApprovalRequest;
  status: TurnStatus;
  summary?: string;
  /** Final answer / page summary from the agent. */
  analysis?: string;
  /**
   * What the agent saw when it first looked at the screen, and what it intended
   * to do. Populated once per run, before any action.
   */
  description?: AgentDescription;
  /**
   * The most recent viewport the agent captured, as a `data:image/png` URI.
   *
   * Shown as a preview so the user can see what the model was looking at. Only
   * the latest frame is kept: a screenshot per step would grow the turn without
   * bound, and the newest one is the one that explains the current action.
   */
  screenshot?: ScreenshotPreview;
}

/** The agent's opening read of the page, before it acts. */
export interface AgentDescription {
  /** What is on screen, in the model's words. */
  screen: string;
  /** Whether the page was in a usable state. */
  ready: boolean;
  /** Cookie banner / login wall / modal that has to be cleared first. */
  blockers?: string;
  /** The steps it intends to take, in order. */
  plan: string[];
  /** Populated instead of the rest when the description call failed. */
  error?: string;
}

/** A captured viewport, sized for display. */
export interface ScreenshotPreview {
  /** `data:image/png;base64,...` */
  image: string;
  width: number;
  height: number;
  bytes: number;
  /** Which step this frame belongs to. */
  step: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  message: string;
  tag: RedactionTag | "SESSION";
}

export interface TabContext {
  /** null when unknown/unavailable — callers substitute a translated fallback at render time, never a hardcoded English string. */
  domain: string | null;
  faviconUrl?: string;
  isSecure: boolean;
}

/**
 * A canned suggestion chip carries an explicit intent so the routing doesn't
 * depend on regex-matching translated (non-English) button text.
 */
export type SuggestionIntent = "sanitize" | "navigate" | "telemetry";

/**
 * Governs how a risky action's approval gate behaves:
 * - manual: pause and wait for an explicit Approve/Deny click.
 * - auto: still surfaces the approval banner (for the audit trail), but
 *   resolves it as approved after a brief visible pause — no click needed.
 * - skip: bypasses the approval gate entirely (default, fastest).
 */
export type ApprovalMode = "manual" | "auto" | "skip";
