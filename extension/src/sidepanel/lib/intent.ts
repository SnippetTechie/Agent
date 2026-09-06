import type { ContextMode, TurnMode } from "../types.js";

const PAGE_INDICATORS: RegExp[] = [
  // Page, site, tab, or screen references
  /\b(this\s+page|the\s+page|current\s+page|this\s+site|the\s+site|this\s+website|the\s+website|this\s+tab|the\s+tab|current\s+tab|on\s+screen|my\s+screen|the\s+screen|whole\s+page|entire\s+page|webpage)\b/i,

  // Screenshot / visual requests
  /\b(screenshot|take\s+a\s+screenshot|capture|snapshot|what\s+do\s+you\s+see|can\s+you\s+see|look\s+at\s+(this|the)|view\s+this)\b/i,

  // Direct UI interaction or element localization
  /\b(click|press|tap|fill\s+out|fill\s+in|scroll\s+to|find\s+(the|this|a)|locate\s+(the|this)|where\s+is\s+(the|this))\s+(button|link|form|input|field|navbar|header|footer|pricing|cart|checkout|icon|menu|dropdown|popup|dialog|banner|modal)\b/i,

  // UI elements mentioned specifically
  /\b(navbar|nav\s+bar|header\s+banner|pricing\s+table|checkout\s+button|login\s+button|sign\s*in\s+button|search\s+bar|video\s+player)\b/i,

  // Page reading & summarization
  /\b(summarize\s+(this|the)\s+(page|article|site|tab|text|content)|read\s+(this|the)\s+(page|article|content|post))\b/i,

  // Inquiries about current UI state
  /\b(what('s| is)\s+on\s+(this|the)\s+(page|screen|tab|site)|what\s+does\s+this\s+page\s+say|what\s+is\s+this\s+site\s+about)\b/i,
];

/**
 * Checks if the prompt contains signals that the user is referring to
 * or asking about the active webpage / visual screen.
 */
export function isPageContextRequested(promptText: string): boolean {
  const trimmed = promptText.trim();
  if (!trimmed) return false;
  return PAGE_INDICATORS.some((pattern) => pattern.test(trimmed));
}

/**
 * Resolves whether a turn should run in conversational "chat" mode
 * or on-demand "vision" mode (capturing the page with UI-TARS).
 */
export function resolveTurnMode(promptText: string, contextMode: ContextMode = "auto"): TurnMode {
  if (contextMode === "page") return "vision";
  if (contextMode === "chat") return "chat";

  // In "auto" mode, intelligently classify the prompt
  return isPageContextRequested(promptText) ? "vision" : "chat";
}
