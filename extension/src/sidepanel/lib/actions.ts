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

  const kind = String(action.action ?? action.type ?? action.name ?? "action").toLowerCase();
  const index = action.index;
  const rawLabel = String(action.label || action.name || "").trim();
  const label = asText(rawLabel, 45);

  switch (kind) {
    case "click": {
      if (label) return `Clicked "${label}"`;
      if (index !== undefined) return `Clicked element [${index}]`;
      return "Clicked button";
    }
    case "type": {
      const text = asText(action.text, 35);
      const target = label ? `"${label}"` : index !== undefined ? `[${index}]` : "input";
      const submit = action.submit ? " and submitted" : "";
      return `Typed "${text}" into ${target}${submit}`;
    }
    case "navigate":
      return `Navigated to ${asText(action.url, 50)}`;
    case "scroll":
      return `Scrolled ${asText(action.direction ?? "down", 10)}`;
    case "hover":
      return label ? `Hovered over "${label}"` : `Hovered [${index}]`;
    case "press":
      return `Pressed ${asText(action.key, 16)}`;
    case "wait":
      return `Waited ${asText(action.seconds ?? 1, 6)}s`;
    case "wait_for":
      return `Waited for "${asText(action.text, 32)}"`;
    case "read":
      return "Read the page";
    case "go_back":
      return "Went back";
    case "done":
      return label ? `Finished: ${label}` : "Task finished";
    default:
      if (label) return `${kind}: "${label}"`;
      return kind !== "action" ? `Action: ${kind}` : "Executed action";
  }
}
