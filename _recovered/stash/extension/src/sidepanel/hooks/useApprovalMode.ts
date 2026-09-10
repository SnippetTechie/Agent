import { useCallback, useEffect, useState } from "react";
import type { ApprovalMode } from "../types.js";
import { loadLocalState, saveLocalState } from "../lib/storage.js";

const APPROVAL_MODE_STORAGE_KEY = "varma.approvalMode.v1";

const VALID: readonly ApprovalMode[] = ["manual", "auto", "skip"];

/**
 * Approval mode is a durable preference (chrome.storage.local), so it survives
 * a browser restart rather than silently reverting to the default.
 *
 * Default is "manual": the safe choice. A first-time user sees the gate and
 * consciously opts into "skip" instead of having it opted in for them.
 */
export function useApprovalMode(): [ApprovalMode, (mode: ApprovalMode) => void] {
  const [mode, setModeState] = useState<ApprovalMode>("manual");

  useEffect(() => {
    let cancelled = false;
    loadLocalState<ApprovalMode>(APPROVAL_MODE_STORAGE_KEY).then((saved) => {
      if (!cancelled && saved && VALID.includes(saved)) setModeState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ApprovalMode) => {
    setModeState(next);
    void saveLocalState(APPROVAL_MODE_STORAGE_KEY, next);
  }, []);

  return [mode, setMode];
}
