/**
 * V.A.R.M.A task-in-progress overlay.
 *
 * Injects a full-viewport cyan glow (V.A.R.M.A's brand color, not a
 * borrowed one) plus a floating "Stop V.A.R.M.A" pill onto the active page
 * while a vision turn is capturing/reasoning/acting on it — the same idea
 * as other Chrome-hosted agents that outline the tab they currently have
 * access to. Shown/hidden alongside the existing blue cursor in
 * lib/varmaMouse.ts, using the same chrome.scripting.executeScript
 * injection approach.
 */

/**
 * Injected into the page. Must be fully self-contained — chrome.scripting
 * re-serializes this function and runs it standalone in the target page,
 * so it cannot close over anything from this module's outer scope.
 */
function injectVarmaOverlay(): void {
  const OVERLAY_ID = "varma-task-overlay";
  if (document.getElementById(OVERLAY_ID)) return;

  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    pointer-events: none;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes varma-overlay-pulse {
      0%, 100% { opacity: 0.55; }
      50% { opacity: 0.95; }
    }
    #${OVERLAY_ID} .varma-glow {
      position: fixed;
      inset: 0;
      pointer-events: none;
      box-shadow:
        inset 0 0 70px 6px rgba(56, 224, 245, 0.28),
        inset 0 0 22px 2px rgba(56, 224, 245, 0.55);
      animation: varma-overlay-pulse 2.6s ease-in-out infinite;
    }
    #${OVERLAY_ID} .varma-topbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, transparent, #38e0f5, transparent);
      pointer-events: none;
    }
    #${OVERLAY_ID} .varma-stop-pill {
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px 9px 14px;
      border-radius: 999px;
      border: 1px solid rgba(56, 224, 245, 0.4);
      background: rgba(8, 9, 13, 0.92);
      color: #e7ecf3;
      font: 600 12.5px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35), 0 0 18px rgba(56, 224, 245, 0.25);
      cursor: pointer;
    }
    #${OVERLAY_ID} .varma-stop-pill:hover {
      border-color: rgba(56, 224, 245, 0.75);
    }
    #${OVERLAY_ID} .varma-stop-dot {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      background: #38e0f5;
      box-shadow: 0 0 8px rgba(56, 224, 245, 0.9);
    }
  `;
  root.appendChild(style);

  const glow = document.createElement("div");
  glow.className = "varma-glow";
  root.appendChild(glow);

  const topbar = document.createElement("div");
  topbar.className = "varma-topbar";
  root.appendChild(topbar);

  const pill = document.createElement("button");
  pill.type = "button";
  pill.className = "varma-stop-pill";
  pill.innerHTML = '<span class="varma-stop-dot"></span><span>Stop V.A.R.M.A</span>';
  pill.addEventListener("click", () => {
    try {
      chrome.runtime.sendMessage({ type: "varma:stop-requested" });
    } catch {
      // Side panel may already be closed — nothing to notify.
    }
    root.remove();
  });
  root.appendChild(pill);

  document.documentElement.appendChild(root);
}

function removeVarmaOverlay(): void {
  document.getElementById("varma-task-overlay")?.remove();
}

export async function showVarmaOverlay(tabId: number): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.scripting?.executeScript) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: injectVarmaOverlay });
  } catch (err) {
    console.warn("[varma-overlay] Failed to show overlay:", err);
  }
}

export async function hideVarmaOverlay(tabId: number): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.scripting?.executeScript) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: removeVarmaOverlay });
  } catch {
    // Tab may have navigated or closed in the meantime — nothing to clean up.
  }
}
