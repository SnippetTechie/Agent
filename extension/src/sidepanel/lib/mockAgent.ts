import type {
  AgentStep,
  ApprovalMode,
  ApprovalRequest,
  TurnStatus,
} from "../types.js";
import type { TranslationKey } from "./i18n/I18nContext.js";

export type Translate = (path: TranslationKey, params?: Record<string, string | number>) => string;

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * The four scaffold rows shown the moment a task starts. `promptText`/`intent`
 * are intentionally not used to vary these: the real server events overwrite
 * them with measured detail within a step, so branching here would only add
 * noise that the user sees for ~200 ms.
 */
export function buildInitialSteps(t: Translate, domain: string): AgentStep[] {
  return [
    {
      id: nextId("step"),
      label: "Connecting to browser",
      detail: `Attaching to ${domain} via CDP`,
      category: "sanitizing",
      status: "pending",
    },
    {
      id: nextId("step"),
      label: "Perceiving page",
      detail: "Scanning on-screen interactive elements",
      category: "reasoning",
      status: "pending",
    },
    {
      id: nextId("step"),
      label: "Reading the screen",
      detail: "Describing what is visible and planning",
      category: "reasoning",
      status: "pending",
    },
    {
      id: nextId("step"),
      label: "Reasoning & acting",
      detail: "Model deciding the next action",
      category: "reasoning",
      status: "pending",
    },
    {
      id: nextId("step"),
      label: t("steps.actionLabel"),
      detail: t("steps.actionDetail"),
      category: "executing",
      status: "pending",
    },
  ];
}

export function buildApprovalRequest(
  t: Translate,
  domain: string,
  customActionLabel?: string,
  customRiskNote?: string,
  mode: ApprovalMode = "manual",
  step?: number,
  timeoutSeconds?: number
): ApprovalRequest {
  return {
    id: nextId("approval"),
    actionLabel: customActionLabel || t("approval.actionLabel", { domain }),
    riskNote: customRiskNote || t("approval.riskNote"),
    state: "pending",
    mode,
    step,
    // The server gives up after this; mirror it so the banner can show a
    // countdown instead of silently hanging.
    expiresAt:
      mode === "manual" && typeof timeoutSeconds === "number" && timeoutSeconds > 0
        ? Date.now() + timeoutSeconds * 1000
        : undefined,
  };
}

export function buildSummary(t: Translate, status: TurnStatus, maskedCount: number): string {
  switch (status) {
    case "completed":
      return maskedCount > 0
        ? t("summary.completedWithMasks", { n: maskedCount })
        : t("summary.completedNoMasks");
    case "denied":
      return t("summary.denied");
    case "stopped":
      return t("summary.stopped");
    case "error":
      return t("summary.error");
    default:
      return "";
  }
}
