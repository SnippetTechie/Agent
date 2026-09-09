import { useCallback, useEffect, useState } from "react";
import type { ApprovalMode } from "../types.js";
import { loadState, saveState } from "../lib/storage.js";

const APPROVAL_MODE_STORAGE_KEY = "varma.approvalMode.v1";

export function useApprovalMode(): [ApprovalMode, (mode: ApprovalMode) => void] {
  // Default to "skip": the agent runs uninterrupted for minimum latency.
  // Users can switch to auto/manual from the dock for risky sites.
  const [mode, setModeState] = useState<ApprovalMode>("skip");

  useEffect(() => {
    let cancelled = false;
    loadState<ApprovalMode>(APPROVAL_MODE_STORAGE_KEY).then((saved) => {
      if (!cancelled && saved) setModeState(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ApprovalMode) => {
    setModeState(next);
    void saveState(APPROVAL_MODE_STORAGE_KEY, next);
  }, []);

  return [mode, setMode];
}
