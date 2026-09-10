import { useCallback, useEffect, useState } from "react";
import { loadLocalState, saveLocalState } from "../lib/storage.js";

const STORAGE_KEY = "varma.visuals.v2";

export interface VisualSettings {
  /** Draw numbered bounding boxes over interactive elements on the page. */
  showOverlay: boolean;
  /** Animate the agent cursor and click ripples on the page. */
  showCursor: boolean;
  /** Mask deterministic PII (Layer 1) before any text reaches the model. */
  autoRedact: boolean;
}

const DEFAULTS: VisualSettings = { showOverlay: true, showCursor: true, autoRedact: true };

/**
 * Agent behaviour settings, persisted in chrome.storage.local (durable across
 * browser restarts — these are preferences, not conversation content) and
 * pushed to the server before each task and on every change mid-run.
 */
export function useVisualSettings(): [VisualSettings, (patch: Partial<VisualSettings>) => void] {
  const [settings, setSettings] = useState<VisualSettings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    loadLocalState<Partial<VisualSettings>>(STORAGE_KEY).then((saved) => {
      if (!cancelled && saved) setSettings({ ...DEFAULTS, ...saved });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<VisualSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      void saveLocalState(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [settings, update];
}
