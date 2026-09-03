import { useCallback, useEffect, useState } from "react";
import { loadLocalState, saveLocalState } from "../lib/storage.js";
import { clearState } from "../lib/storage.js";

export type NoticeChoice = "accepted" | "rejected";

const NOTICE_STORAGE_KEY = "varma.privacyNotice.v1";
const SESSION_STORAGE_KEY = "varma.session.v1";

/**
 * Tracked in chrome.storage.local (survives browser restarts) — not
 * session storage — so the banner genuinely shows only once, rather than
 * re-nagging every time the browser reopens.
 */
export function usePrivacyNotice(): {
  loaded: boolean;
  choice: NoticeChoice | null;
  respond: (choice: NoticeChoice) => void;
} {
  const [choice, setChoiceState] = useState<NoticeChoice | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLocalState<NoticeChoice>(NOTICE_STORAGE_KEY).then((saved) => {
      if (cancelled) return;
      setChoiceState(saved ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const respond = useCallback((next: NoticeChoice) => {
    setChoiceState(next);
    void saveLocalState(NOTICE_STORAGE_KEY, next);
    // Rejecting is a real choice, not just dismissing the banner: it clears
    // whatever session history already exists and stops future turns from
    // being persisted (useAgentSession checks this same flag before saving).
    if (next === "rejected") {
      void clearState(SESSION_STORAGE_KEY);
    }
  }, []);

  return { loaded, choice, respond };
}
