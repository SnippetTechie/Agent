import { useCallback, useEffect, useState } from "react";
import { soundEngine } from "../lib/sound.js";
import { loadLocalState, saveLocalState } from "../lib/storage.js";

const MUTE_STORAGE_KEY = "varma.muted.v1";

/** Sound preference is durable (chrome.storage.local), not per-session. */
export function useMuted(): [boolean, () => void] {
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLocalState<boolean>(MUTE_STORAGE_KEY).then((saved) => {
      if (cancelled || saved === undefined) return;
      setMutedState(saved);
      soundEngine.setMuted(saved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    setMutedState((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      void saveLocalState(MUTE_STORAGE_KEY, next);
      return next;
    });
  }, []);

  return [muted, toggle];
}
