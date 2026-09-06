export type StepCategory = "sanitizing" | "reasoning" | "executing" | "completed";
export type StepStatus = "pending" | "active" | "done" | "error";

export type RedactionTag = "CREDENTIAL" | "COORDINATES" | "FACE" | "ID_NUMBER" | "SIGNATURE";

export interface RedactionBox {
  tag: RedactionTag;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RedactionPreview {
  maskedCount: number;
  boxes: RedactionBox[];
}

export interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  category: StepCategory;
  status: StepStatus;
  preview?: RedactionPreview;
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

/**
 * The real screenshot captured for a turn (chrome.tabs.captureVisibleTab)
 * and saved into the screenshots folder via chrome.downloads.
 */
export interface ScreenshotInfo {
  /** The captured viewport as a data URL ("" when capture failed). */
  dataUrl: string;
  /** True when the PNG was successfully saved to the screenshots folder. */
  saved: boolean;
  /** Destination path where the PNG was saved (e.g. screenshots/<timestamp>-<name>.png). */
  savedPath?: string;
  /** Human-readable failure reason, when capture or saving failed. */
  error?: string;
  /** Simplified description / analysis from UI-TARS. */
  analysis?: string;
  /** Error from UI-TARS if vision inference failed. */
  analysisError?: string;
}

export interface AgentTurn {
  id: string;
  prompt: string;
  createdAt: number;
  steps: AgentStep[];
  approval?: ApprovalRequest;
  status: TurnStatus;
  summary?: string;
  screenshot?: ScreenshotInfo;
  /** Simplified description / analysis from UI-TARS. */
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
 * A canned suggestion chip carries an explicit intent so redaction-box
 * detection doesn't depend on regex-matching translated (non-English)
 * button text. Free-typed prompts have no intent and fall back to
 * English-keyword matching in lib/mockAgent.ts — a known limitation of
 * this mocked layer, not of a real NLU backend.
 */
export type SuggestionIntent = "sanitize" | "navigate" | "telemetry";

/**
 * Governs how a risky action's approval gate behaves:
 * - manual: pause and wait for an explicit Approve/Deny click (default).
 * - auto: still surfaces the approval banner (for the audit trail), but
 *   resolves it as approved after a brief visible pause — no click needed.
 * - skip: bypasses the approval gate entirely, as if the action weren't
 *   risky at all.
 */
export type ApprovalMode = "manual" | "auto" | "skip";
