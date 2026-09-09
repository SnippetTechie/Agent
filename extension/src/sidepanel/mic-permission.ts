/**
 * Standalone page opened as a real browser tab (never as a side panel/popup)
 * whose only job is to trigger Chrome's microphone permission prompt.
 *
 * Chrome does not surface a working mic-permission prompt inside extension
 * side panels or popups — getUserMedia()/SpeechRecognition there silently
 * resolve as "dismissed" with no prompt ever shown, on any protocol; this
 * is a side-panel surface restriction, not an http-vs-https issue (a
 * chrome-extension:// page is always a secure context regardless). The
 * documented workaround is to request the permission once from a page
 * opened as a normal tab; the grant is stored per-origin
 * (chrome-extension://<id>), so every other page of this same extension —
 * including the side panel — can use the microphone afterward without
 * asking again.
 */

const titleEl = document.getElementById("title")!;
const detailEl = document.getElementById("detail")!;
const retryBtn = document.getElementById("retry") as HTMLButtonElement;

async function requestAccess() {
  titleEl.textContent = "Requesting microphone access…";
  titleEl.className = "";
  detailEl.textContent = "Allow it in the popup that appears at the top of this tab.";
  retryBtn.style.display = "none";

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());

    titleEl.textContent = "Microphone access granted";
    titleEl.className = "ok";
    detailEl.textContent = "You're all set — you can close this tab and use the mic in V.A.R.M.A.";

    setTimeout(() => window.close(), 1400);
  } catch (err) {
    titleEl.textContent = "Microphone access was not granted";
    titleEl.className = "err";
    detailEl.textContent =
      err instanceof Error
        ? `${err.name}: ${err.message}. If you dismissed the prompt, click the lock icon in the address bar to allow the microphone, then try again.`
        : "Please allow microphone access, then try again.";
    retryBtn.style.display = "inline-block";
  }
}

retryBtn.addEventListener("click", () => void requestAccess());
void requestAccess();
