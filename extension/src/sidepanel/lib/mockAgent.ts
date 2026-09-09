import type {
  AgentStep,
  ApprovalRequest,
  SuggestionIntent,
  TurnStatus,
} from "../types.js";
import type { TranslationKey } from "./i18n/I18nContext.js";

export type Translate = (path: TranslationKey, params?: Record<string, string | number>) => string;

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

export function buildInitialSteps(
  t: Translate,
  domain: string,
  promptText: string,
  intent?: SuggestionIntent
): AgentStep[] {
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
  customRiskNote?: string
): ApprovalRequest {
  return {
    id: nextId("approval"),
    actionLabel: customActionLabel || t("approval.actionLabel", { domain }),
    riskNote: customRiskNote || t("approval.riskNote"),
    state: "pending",
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

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
