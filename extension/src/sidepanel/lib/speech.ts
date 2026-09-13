import type { LanguageCode } from "./i18n/translations.js";

/**
 * Deliberately not relying on ambient DOM lib types for SpeechRecognition,
 * since they're gated behind an unstable spec and not consistently present
 * across TS/lib.dom versions. window.SpeechRecognition /
 * webkitSpeechRecognition are read via a narrow cast instead.
 */
function getCtor(): (new () => unknown) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => unknown;
    webkitSpeechRecognition?: new () => unknown;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getCtor() !== null;
}

/** BCP-47 tags for the Web Speech API — not every browser build ships every locale; unsupported ones fall back to the browser's default. */
const SPEECH_LOCALE: Record<LanguageCode, string> = {
  en: "en-US",
  hi: "hi-IN",
  gu: "gu-IN",
  mr: "mr-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  ta: "ta-IN",
  te: "te-IN",
  or: "or-IN",
  bn: "bn-IN",
};

export interface SpeechController {
  stop(): void;
}

/**
 * Opens the mic-permission page as a real browser tab so Chrome can show its
 * microphone prompt at all — side panels/popups never surface it (the
 * getUserMedia() call there resolves as silently dismissed, no dialog shown,
 * on any protocol). The grant applies to this extension's whole origin, so
 * once accepted there, SpeechRecognition works from the side panel without
 * asking again.
 */
export function openMicPermissionTab(): void {
  if (typeof chrome === "undefined" || !chrome.tabs?.create || !chrome.runtime?.getURL) return;
  void chrome.tabs.create({ url: chrome.runtime.getURL("src/sidepanel/mic-permission.html") });
}

/**
 * Runs recognition in a hidden offscreen document instead of inline here —
 * SpeechRecognition started directly from the side panel never errors, but
 * never returns a result either. Chrome's Web Speech API doesn't reliably
 * attach to a side panel's WebContents the way it does a real tab or an
 * offscreen document (crbug.com/1077446). background/index.ts owns that
 * document's lifecycle; src/offscreen/dictation.ts owns the actual
 * SpeechRecognition instance. This just relays start/stop over
 * chrome.runtime messaging and listens for the broadcast results.
 */
export function startSpeechRecognition(opts: {
  lang: LanguageCode;
  onTranscript: (transcript: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}): SpeechController | null {
  if (getCtor() === null) return null;

  const listener = (message: { type?: string; transcript?: string; error?: string }) => {
    if (message?.type === "DICTATION_TRANSCRIPT") {
      opts.onTranscript(message.transcript ?? "");
    } else if (message?.type === "DICTATION_ERROR") {
      chrome.runtime.onMessage.removeListener(listener);
      opts.onError(message.error ?? "unknown");
    } else if (message?.type === "DICTATION_END") {
      chrome.runtime.onMessage.removeListener(listener);
      opts.onEnd();
    }
  };
  chrome.runtime.onMessage.addListener(listener);

  void chrome.runtime.sendMessage({ type: "DICTATION_START", lang: SPEECH_LOCALE[opts.lang] });

  return {
    // Deliberately doesn't remove `listener` here: the eventual
    // DICTATION_END broadcast (once the offscreen document's recognition
    // actually stops) is what tells InputDock to flip `listening` back to
    // false, and that message's own handler above removes the listener.
    // Removing it immediately here would leave the mic UI stuck "listening"
    // forever on every manual stop.
    stop: () => {
      void chrome.runtime.sendMessage({ type: "DICTATION_STOP" });
    },
  };
}
