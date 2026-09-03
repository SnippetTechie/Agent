import type {
  AgentStep,
  ApprovalRequest,
  RedactionBox,
  RedactionTag,
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

const RISKY_WORDS = ["submit", "send", "delete", "purchase", "pay", "confirm", "approve", "execute"];

/**
 * Free-typed prompts only — English-keyword heuristic. Suggestion chips
 * bypass this entirely via their fixed intent (see SUGGESTION_APPROVAL
 * below), so this limitation only affects prompts the user types by hand,
 * regardless of UI language. A real backend would do actual NLU here.
 */
export function requiresApproval(promptText: string): boolean {
  const lower = promptText.toLowerCase();
  return RISKY_WORDS.some((w) => lower.includes(w));
}

const COORDINATES_BOXES: RedactionBox[] = [
  { tag: "COORDINATES", x: 8, y: 18, w: 62, h: 9 },
  { tag: "COORDINATES", x: 8, y: 32, w: 48, h: 9 },
];
const GENERIC_FORM_BOXES: RedactionBox[] = [
  { tag: "CREDENTIAL", x: 8, y: 16, w: 50, h: 8 },
  { tag: "COORDINATES", x: 8, y: 40, w: 62, h: 8 },
];

const INTENT_BOXES: Record<SuggestionIntent, RedactionBox[]> = {
  sanitize: GENERIC_FORM_BOXES,
  navigate: [],
  telemetry: COORDINATES_BOXES,
};

interface BoxPreset {
  keywords: RegExp;
  boxes: RedactionBox[];
}

const PRESETS: BoxPreset[] = [
  {
    keywords: /coordinat|telemetry|geospatial|lat|long|orbital/i,
    boxes: COORDINATES_BOXES,
  },
  {
    keywords: /credential|password|login|auth|sign.?in/i,
    boxes: [
      { tag: "CREDENTIAL", x: 8, y: 16, w: 55, h: 8 },
      { tag: "CREDENTIAL", x: 8, y: 29, w: 55, h: 8 },
    ],
  },
  {
    keywords: /face|photo|identity|aadhaar|passport|id\b/i,
    boxes: [
      { tag: "FACE", x: 8, y: 14, w: 22, h: 28 },
      { tag: "ID_NUMBER", x: 36, y: 24, w: 46, h: 7 },
    ],
  },
  {
    keywords: /signature|sign\b/i,
    boxes: [{ tag: "SIGNATURE", x: 8, y: 62, w: 50, h: 11 }],
  },
];

function detectRedactionBoxesFromText(promptText: string): RedactionBox[] {
  for (const preset of PRESETS) {
    if (preset.keywords.test(promptText)) return preset.boxes;
  }
  if (/form|field|input/i.test(promptText)) return GENERIC_FORM_BOXES;
  return [];
}

export function tagLabel(t: Translate, tag: RedactionTag): string {
  return t(`tags.${tag}`);
}

export function buildInitialSteps(
  t: Translate,
  domain: string,
  promptText: string,
  intent?: SuggestionIntent
): AgentStep[] {
  const boxes = intent ? INTENT_BOXES[intent] : detectRedactionBoxesFromText(promptText);
  const maskedDetail =
    boxes.length > 0
      ? t("steps.redactionDetailMasked", { n: boxes.length })
      : t("steps.redactionDetailNone");

  return [
    {
      id: nextId("step"),
      label: t("steps.capturingLabel"),
      detail: t("steps.capturingDetail", { domain }),
      category: "sanitizing",
      status: "pending",
    },
    {
      id: nextId("step"),
      label: t("steps.redactionLabel"),
      detail: maskedDetail,
      category: "sanitizing",
      status: "pending",
      preview: { maskedCount: boxes.length, boxes },
    },
    {
      id: nextId("step"),
      label: t("steps.reasoningLabel"),
      detail: t("steps.reasoningDetail"),
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

export function buildApprovalRequest(t: Translate, domain: string): ApprovalRequest {
  return {
    id: nextId("approval"),
    actionLabel: t("approval.actionLabel", { domain }),
    riskNote: t("approval.riskNote"),
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
