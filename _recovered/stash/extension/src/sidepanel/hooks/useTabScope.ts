import { useCallback, useEffect, useState } from "react";
import type { TabScope } from "../types.js";
import { loadLocalState, saveLocalState } from "../lib/storage.js";

const TAB_SCOPE_STORAGE_KEY = "varma.tabScope.v1";

/** Durable preference (chrome.storage.local), not per-session. */
export function useTabScope(): [TabScope, (scope: TabScope) => void] {
  const [scope, setScopeState] = useState<TabScope>("single");

  useEffect(() => {
    let cancelled = false;
    loadLocalState<TabScope>(TAB_SCOPE_STORAGE_KEY).then((saved) => {
      if (!cancelled && (saved === "single" || saved === "all")) setScopeState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setScope = useCallback((next: TabScope) => {
    setScopeState(next);
    void saveLocalState(TAB_SCOPE_STORAGE_KEY, next);
  }, []);

  return [scope, setScope];
}
