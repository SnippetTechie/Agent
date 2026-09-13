// @types/chrome@0.0.278 doesn't ship chrome.offscreen typings yet. Minimal
// ambient surface for the one call site that needs it (background/index.ts).
declare namespace chrome.offscreen {
  type Reason = "USER_MEDIA" | "AUDIO_PLAYBACK" | "CLIPBOARD" | "DOM_PARSER" | "DOM_SCRAPING";

  interface CreateParameters {
    url: string;
    reasons: Reason[];
    justification: string;
  }

  function createDocument(params: CreateParameters): Promise<void>;
  function closeDocument(): Promise<void>;
}
