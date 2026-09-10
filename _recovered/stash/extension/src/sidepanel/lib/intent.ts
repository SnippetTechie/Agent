import type { ContextMode, TurnMode } from "../types.js";

/**
 * Pure small talk, greetings, and off-screen general conversational patterns.
 * ONLY prompts strictly matching these patterns will bypass page inspection.
 */
const CASUAL_CHAT_PATTERNS: RegExp[] = [
  // Greetings
  /^(hi|hello|hey|good\s+(morning|afternoon|evening)|howdy|sup|yo|hola|greetings)[\s!.,?]*$/i,

  // Assistant identity & small talk
  /^(how\s+are\s+you|who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|what\s+is\s+your\s+name|introduce\s+yourself|help|test)[\s!.,?]*$/i,

  // Pleasantries
  /^(thanks|thank\s+you|ok|okay|bye|goodbye|cool|nice|great|awesome)[\s!.,?]*$/i,

  // General off-screen knowledge / programming not referencing browser
  /^(tell\s+me\s+a\s+joke|what\s+is\s+the\s+capital\s+of|how\s+far\s+is\s+the\s+moon|explain\s+quantum|write\s+a\s+python\s+script\s+for\s+bubble\s+sort)[\s!.,?]*$/i,
];

/**
 * Explicit browser action, navigation, search, or page inspection patterns.
 * Always given precedence.
 */
const BROWSER_ACTION_PATTERNS: RegExp[] = [
  // Search & finding
  /\b(search|find|lookup|look\s+up|locate|filter)\b/i,

  // Mouse & UI interaction
  /\b(click|press|tap|select|choose|open|fill|type|enter|scroll|check|tick)\b/i,

  // Follow-up task commands
  /^(proceed|continue|go\s+ahead|do\s+it|yes|ok\s+proceed|start|run)[\s!.,?]*$/i,

  // Page, screen, content inquiries
  /\b(page|screen|website|site|tab|viewport|deadline|organization|problem|button|link|input|banner|navbar)\b/i,
  /\b(summarize|read|describe|explain|what('s| is)\s+(this|the|on))\b/i,
];

/**
 * Determines whether the user prompt requires page context / UI-TARS vision.
 */
export function isPageContextRequested(promptText: string): boolean {
  const trimmed = promptText.trim();
  if (!trimmed) return false;

  // 1. If it matches explicit browser action patterns, vision is required
  if (BROWSER_ACTION_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }

  // 2. If it matches casual chat small talk, no vision needed
  if (CASUAL_CHAT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return false;
  }

  // 3. Default to vision for any contextual or complex instruction in the browser
  return true;
}

/**
 * Resolves whether a turn should run in conversational "chat" mode
 * or on-demand "vision" mode (capturing the page with UI-TARS).
 */
export function resolveTurnMode(promptText: string, contextMode: ContextMode = "auto"): TurnMode {
  if (contextMode === "page") return "vision";
  if (contextMode === "chat") return "chat";

  // In "auto" mode:
  return isPageContextRequested(promptText) ? "vision" : "chat";
}
