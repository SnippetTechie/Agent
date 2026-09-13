/**
 * Hidden offscreen document that owns the actual SpeechRecognition instance.
 *
 * Running SpeechRecognition directly inside the side panel looked fine —
 * recognition.start() never throws, the mic icon animates — but no result
 * ever arrives and no error ever fires either. Chrome's Web Speech API
 * doesn't reliably attach to a side panel's WebContents the way it does a
 * real tab or an offscreen document (tracked upstream as
 * crbug.com/1077446, "SpeechRecognition should be supported in Extensions
 * Manifest V3"). Offscreen documents are a regular DOM page from the
 * platform's point of view, so recognition works normally here; the mic
 * permission itself is still granted once via a real tab
 * (sidepanel/mic-permission.ts) since offscreen documents can't show that
 * prompt either, but the grant is per-origin and covers this document too.
 *
 * background/index.ts creates/destroys this document and relays commands
 * into it; the side panel never talks to it directly (see
 * sidepanel/lib/speech.ts).
 */

type MinimalSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { results: { length: number; [i: number]: { [0]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => MinimalSpeechRecognition;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let recognition: MinimalSpeechRecognition | null = null;

/**
 * Silently drops a stale instance before starting a fresh one (e.g. a
 * START arriving while a previous session is still winding down). Handlers
 * are cleared first so the discarded instance's eventual onend doesn't fire
 * DICTATION_END for a session the side panel doesn't know exists anymore —
 * that's a different case from the user actually clicking stop, below.
 */
function discardExisting(): void {
  if (!recognition) return;
  const current = recognition;
  recognition = null;
  current.onresult = null;
  current.onerror = null;
  current.onend = null;
  try {
    current.stop();
  } catch {
    // already stopped
  }
}

chrome.runtime.onMessage.addListener((message: { type?: string; lang?: string }) => {
  if (message?.type === "OFFSCREEN_DICTATION_START") {
    discardExisting();
    const Ctor = getCtor();
    if (!Ctor) {
      void chrome.runtime.sendMessage({ type: "DICTATION_ERROR", error: "not-supported" });
      return;
    }
    const r = new Ctor();
    recognition = r;
    r.continuous = true;
    r.interimResults = true;
    r.lang = message.lang ?? "en-US";
    r.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i]?.[0]?.transcript ?? "";
      }
      void chrome.runtime.sendMessage({ type: "DICTATION_TRANSCRIPT", transcript });
    };
    r.onerror = (event) => {
      void chrome.runtime.sendMessage({ type: "DICTATION_ERROR", error: event.error });
    };
    r.onend = () => {
      recognition = null;
      void chrome.runtime.sendMessage({ type: "DICTATION_END" });
    };
    try {
      r.start();
    } catch (err) {
      void chrome.runtime.sendMessage({ type: "DICTATION_ERROR", error: String(err) });
    }
  } else if (message?.type === "OFFSCREEN_DICTATION_STOP") {
    // Deliberately leave onend wired up here: a user-initiated stop should
    // still let the real onend fire and broadcast DICTATION_END, or the
    // side panel's mic button never leaves "listening" state.
    try {
      recognition?.stop();
    } catch {
      // already stopped
    }
  }
});
