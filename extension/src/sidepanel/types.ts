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

export type ApprovalState = "pending" | "approved" | "denied";

export interface ApprovalRequest {
  id: string;
  actionLabel: string;
  riskNote: string;
  state: ApprovalState;
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
