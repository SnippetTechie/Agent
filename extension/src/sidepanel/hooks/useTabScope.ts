import { useCallback, useEffect, useState } from "react";
import type { TabScope } from "../types.js";
import { loadState, saveState } from "../lib/storage.js";

const TAB_SCOPE_STORAGE_KEY = "varma.tabScope.v1";

export function useTabScope(): [TabScope, (scope: TabScope) => void] {
  const [scope, setScopeState] = useState<TabScope>("single");

  useEffect(() => {
    let cancelled = false;
    loadState<TabScope>(TAB_SCOPE_STORAGE_KEY).then((saved) => {
      if (!cancelled && saved) setScopeState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setScope = useCallback((next: TabScope) => {
    setScopeState(next);
    void saveState(TAB_SCOPE_STORAGE_KEY, next);
  }, []);

  return [scope, setScope];
}
