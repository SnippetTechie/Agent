// Opens the side panel on the toolbar icon click instead of a popup — the
// side panel persists across navigations/tab switches, matching the
// Claude-in-Chrome sidebar interaction model this UI mirrors.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[V.A.R.M.A] setPanelBehavior failed:", err));

// --- Dictation relay ---------------------------------------------------
//
// The side panel can't run SpeechRecognition itself and get results back
// (see src/offscreen/dictation.ts for why), so it asks the background to
// spin up a hidden offscreen document that owns the actual recognizer, and
// this file relays start/stop commands into it. Transcript/error/end
// events flow the other way as a plain runtime broadcast straight from the
// offscreen document to the side panel — the background only needs to see
// DICTATION_END / DICTATION_ERROR to know when to tear the document down.

const DICTATION_DOC_URL = "src/offscreen/dictation.html";

async function ensureDictationDocument(): Promise<void> {
  try {
    await chrome.offscreen.createDocument({
      url: DICTATION_DOC_URL,
      reasons: ["USER_MEDIA"],
      justification: "Runs SpeechRecognition for mic dictation in the side panel.",
    });
  } catch (err) {
    // "Only a single offscreen document may be created" means it's already
    // up — everything else is a real failure worth surfacing.
    if (!String(err).includes("single offscreen")) throw err;
  }
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;

chrome.runtime.onMessage.addListener((message: { type?: string; lang?: string }) => {
  if (message?.type === "DICTATION_START") {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    void ensureDictationDocument()
      .then(() => chrome.runtime.sendMessage({ type: "OFFSCREEN_DICTATION_START", lang: message.lang }))
      .catch((err) => {
        console.error("[V.A.R.M.A] failed to start dictation offscreen document:", err);
        void chrome.runtime.sendMessage({ type: "DICTATION_ERROR", error: "offscreen-unavailable" });
      });
  } else if (message?.type === "DICTATION_STOP") {
    void chrome.runtime.sendMessage({ type: "OFFSCREEN_DICTATION_STOP" });
  } else if (message?.type === "DICTATION_END" || message?.type === "DICTATION_ERROR") {
    // Delay the teardown briefly rather than closing immediately: a user
    // re-clicking the mic right after a stop shouldn't pay the
    // create-document cost twice in a row.
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      closeTimer = null;
      chrome.offscreen.closeDocument().catch(() => {
        // already closed, nothing to do
      });
    }, 1500);
  }
});
