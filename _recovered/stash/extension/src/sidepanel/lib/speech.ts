import type { LanguageCode } from "./i18n/translations.js";

/**
 * Minimal local surface for the Web Speech API — deliberately not relying
 * on ambient DOM lib types for SpeechRecognition, since they're gated
 * behind an unstable spec and not consistently present across TS/lib.dom
 * versions. window.SpeechRecognition / webkitSpeechRecognition are read
 * via a narrow cast instead.
 */
interface MinimalSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultLike[] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}

type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
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

export function startSpeechRecognition(opts: {
  lang: LanguageCode;
  onTranscript: (transcript: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}): SpeechController | null {
  const Ctor = getCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = SPEECH_LOCALE[opts.lang];

  recognition.onresult = (event) => {
    // Rebuild from the full result list each event (not just the
    // resultIndex tail) — in continuous mode, results accumulate for the
    // whole session, and this is the simplest correct way to always hand
    // back the complete transcript-so-far.
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i]?.[0]?.transcript ?? "";
    }
    opts.onTranscript(transcript);
  };
  recognition.onerror = (event) => opts.onError(event.error);
  recognition.onend = () => opts.onEnd();

  try {
    recognition.start();
  } catch (err) {
    opts.onError(String(err));
    return null;
  }

  return { stop: () => recognition.stop() };
}
