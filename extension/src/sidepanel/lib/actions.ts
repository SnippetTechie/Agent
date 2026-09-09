/**
 * Helpers for turning agent actions into human-readable UI labels.
 *
 * The server deliberately omits any "thought" text from the model output to
 * save decode tokens (see server/agent/prompts.py). The UI therefore derives
 * its labels from the action itself, which is free.
 */

import type { BrowserUseAction } from "../types.js";

type AnyAction = Partial<BrowserUseAction> & Record<string, unknown>;

function asText(value: unknown, limit = 48): string {
  if (value == null) return "";
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/** Short human label, e.g. `Type "ISRO" into [7]`. */
export function describeAction(action: AnyAction | undefined): string {
  if (!action) return "No action";

  const kind = String(action.type ?? action.name ?? "action");
  const index = action.index;

  switch (kind) {
    case "click": {
      const label = asText(action.label, 40);
      return label ? `Click [${index}] ${label}` : `Click [${index}]`;
    }
    case "type": {
      const text = asText(action.text, 40);
      const submit = action.submit ? " and submit" : "";
      return `Type "${text}" into [${index}]${submit}`;
    }
    case "navigate":
      return `Open ${asText(action.url, 60)}`;
    case "scroll":
      return `Scroll ${asText(action.direction ?? "down", 10)}`;
    case "hover":
      return `Hover [${index}]`;
    case "press":
      return `Press ${asText(action.key, 16)}`;
    case "wait":
      return `Wait ${asText(action.seconds ?? 1, 6)}s`;
    case "wait_for":
      return `Wait for "${asText(action.text, 32)}"`;
    case "read":
      return "Read page";
    case "go_back":
      return "Go back";
    case "done":
      return "Task finished";
    default:
      return kind;
  }
}

/** True when the action could change the page and may need user approval. */
export function isRiskyAction(action: AnyAction | undefined): boolean {
  const kind = String(action?.type ?? action?.name ?? "");
  return kind === "click" || kind === "type" || kind === "navigate" || kind === "press";
}
