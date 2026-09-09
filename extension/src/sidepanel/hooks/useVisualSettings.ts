import { useCallback, useEffect, useState } from "react";
import { loadState, saveState } from "../lib/storage.js";

const STORAGE_KEY = "varma.visuals.v1";

export interface VisualSettings {
  /** Draw numbered bounding boxes over interactive elements on the page. */
  showOverlay: boolean;
  /** Animate the agent cursor and click ripples on the page. */
  showCursor: boolean;
}

const DEFAULTS: VisualSettings = { showOverlay: true, showCursor: true };

/**
 * On-page visual debug layer settings.
 *
 * These are persisted so the choice survives a panel reload, and pushed to the
 * server before each task starts (see useAgentSession → AgentConnection).
 */
export function useVisualSettings(): [VisualSettings, (patch: Partial<VisualSettings>) => void] {
  const [settings, setSettings] = useState<VisualSettings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    loadState<VisualSettings>(STORAGE_KEY).then((saved) => {
      if (!cancelled && saved) setSettings({ ...DEFAULTS, ...saved });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<VisualSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveState(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [settings, update];
}
