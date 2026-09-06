/**
 * V.A.R.M.A Blue Mouse System
 *
 * Injects a virtual electric-blue cursor onto the active webpage to visually
 * represent V.A.R.M.A's autonomous agent interactions. Smoothly glides across
 * the screen to UI-TARS target coordinates and performs visual ripple clicks.
 */

export interface VarmaMouseParams {
  x: number;
  y: number;
  normalized?: boolean;
  target?: string;
  textToType?: string;
}

/**
 * Script injected into the page to animate the V.A.R.M.A blue cursor, click, and type.
 */
function runVirtualMouseOnPage(pos: VarmaMouseParams): Promise<void> {
  return new Promise((resolve) => {
    const MOUSE_ID = "varma-virtual-mouse-container";
    let container = document.getElementById(MOUSE_ID);

    // 1. Resolve target element in DOM if target name or search query is specified
    let foundElement: HTMLElement | null = null;
    let targetX = pos.x;
    let targetY = pos.y;

    const tgtLower = (pos.target || "").toLowerCase();

    // Check for search input on the page
    if (tgtLower.includes("search") || pos.textToType) {
      foundElement = document.querySelector(
        'input[type="search"], input[placeholder*="search" i], input[name*="search" i], input[aria-label*="search" i], textarea[placeholder*="search" i]'
      ) as HTMLElement | null;

      if (!foundElement) {
        // Fallback to first text input
        foundElement = document.querySelector('input[type="text"], input:not([type])') as HTMLElement | null;
      }
    }

    // If not search, check for button/link with matching text
    if (!foundElement && pos.target && pos.target.length > 1) {
      const candidates = Array.from(
        document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')
      );
      for (const el of candidates) {
        const text = (el.textContent || "").trim().toLowerCase();
        if (text && text.includes(tgtLower)) {
          foundElement = el as HTMLElement;
          break;
        }
      }
    }

    // Check for chess board squares on sites like lichess or chess.com
    if (!foundElement) {
      const chessMatch = tgtLower.match(/\b([a-h][1-8])\b/i);
      if (chessMatch && chessMatch[1]) {
        const sq = chessMatch[1].toLowerCase();
        foundElement = document.querySelector(`square.${sq}, [data-square="${sq}"], [data-coord="${sq}"]`) as HTMLElement | null;
      }
    }

    if (foundElement) {
      const rect = foundElement.getBoundingClientRect();
      targetX = rect.left + rect.width / 2;
      targetY = rect.top + rect.height / 2;
    } else if (pos.normalized) {
      // 0-1000 scale from UI-TARS
      targetX = (pos.x / 1000) * window.innerWidth;
      targetY = (pos.y / 1000) * window.innerHeight;
    }

    if (!container) {
      container = document.createElement("div");
      container.id = MOUSE_ID;
      container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        z-index: 2147483647;
        overflow: hidden;
      `;

      // Inject keyframes
      const style = document.createElement("style");
      style.textContent = `
        @keyframes varma-ping-wave {
          0% {
            transform: scale(0.2);
            opacity: 1;
            box-shadow: 0 0 0 0 rgba(0, 168, 255, 0.95);
          }
          65% {
            transform: scale(2.4);
            opacity: 0.7;
            box-shadow: 0 0 18px 8px rgba(0, 168, 255, 0.5);
          }
          100% {
            transform: scale(3.5);
            opacity: 0;
            box-shadow: 0 0 28px 14px rgba(0, 168, 255, 0);
          }
        }
        @keyframes varma-cursor-pulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 8px rgba(0, 168, 255, 0.95)); }
          50% { transform: scale(1.12); filter: drop-shadow(0 0 16px rgba(0, 220, 255, 1)); }
        }
      `;
      container.appendChild(style);
      document.body.appendChild(container);
    }

    // Initial cursor spawn position: start from bottom-right or offset
    const startX = Math.min(window.innerWidth - 60, Math.max(20, targetX + 180));
    const startY = Math.min(window.innerHeight - 60, Math.max(20, targetY + 160));

    // Remove old cursor if any
    const oldCursor = document.getElementById("varma-blue-pointer");
    if (oldCursor) oldCursor.remove();

    // Create the blue cursor element
    const cursor = document.createElement("div");
    cursor.id = "varma-blue-pointer";
    cursor.style.cssText = `
      position: absolute;
      top: ${startY}px;
      left: ${startX}px;
      transform: translate(-3px, -3px);
      transition: left 1.15s cubic-bezier(0.22, 1, 0.36, 1), top 1.15s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.6s ease-out;
      display: flex;
      align-items: center;
      gap: 7px;
      pointer-events: none;
      opacity: 1;
    `;

    cursor.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 0 10px #00a8ff); animation: varma-cursor-pulse 1.8s infinite ease-in-out;">
        <path d="M4 3L11.5 24L15.5 15.5L24 11.5L4 3Z" fill="#00a8ff" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
      </svg>
      <span style="
        background: rgba(4, 19, 36, 0.95);
        border: 1.5px solid #00a8ff;
        color: #38bdf8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.6px;
        padding: 3px 8px;
        border-radius: 6px;
        box-shadow: 0 4px 14px rgba(0, 168, 255, 0.45);
        white-space: nowrap;
      ">
        V.A.R.M.A
      </span>
    `;

    container.appendChild(cursor);

    // Force layout reflow so the starting position is rendered before transitioning
    void cursor.offsetWidth;

    // 1. Animate glide to target coordinate
    setTimeout(() => {
      cursor.style.left = `${targetX}px`;
      cursor.style.top = `${targetY}px`;
    }, 60);

    // 2. When movement completes (~1.2s), perform visual ripple click and interaction
    setTimeout(() => {
      const ripple = document.createElement("div");
      ripple.style.cssText = `
        position: absolute;
        left: ${targetX}px;
        top: ${targetY}px;
        width: 36px;
        height: 36px;
        margin-left: -18px;
        margin-top: -18px;
        border-radius: 50%;
        background: rgba(0, 168, 255, 0.4);
        border: 2.5px solid #00d2ff;
        animation: varma-ping-wave 0.9s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        pointer-events: none;
      `;
      container?.appendChild(ripple);

      // Perform real interaction on target
      try {
        const el = foundElement || (document.elementFromPoint(targetX, targetY) as HTMLElement | null);
        if (el) {
          el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: targetX, clientY: targetY }));
          el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: targetX, clientY: targetY }));
          el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: targetX, clientY: targetY }));
          el.click();

          // If text to type is provided (e.g. search query):
          if (pos.textToType) {
            const inputEl = (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
              ? el
              : el.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null;

            if (inputEl) {
              inputEl.focus();
              inputEl.value = pos.textToType;
              inputEl.dispatchEvent(new Event("input", { bubbles: true }));
              inputEl.dispatchEvent(new Event("change", { bubbles: true }));
              // Dispatch Enter to submit search
              inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
              inputEl.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }));
            }
          }
        }
      } catch (err) {
        console.warn("[varma-mouse] Interaction error:", err);
      }

      // Clean up ripple
      setTimeout(() => {
        ripple.remove();
      }, 1100);

      // Fade cursor after 3 seconds
      setTimeout(() => {
        cursor.style.opacity = "0";
        setTimeout(() => {
          cursor.remove();
        }, 700);
      }, 3000);

      resolve();
    }, 1300);
  });
}

/**
 * Commands V.A.R.M.A's electric-blue mouse to move to a location on the active tab and click.
 */
export async function animateVarmaMouse(
  tabId: number,
  x: number,
  y: number,
  options: { normalized?: boolean; target?: string; textToType?: string } = {}
): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.scripting?.executeScript) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: runVirtualMouseOnPage,
      args: [
        {
          x,
          y,
          normalized: options.normalized ?? true,
          target: options.target,
          textToType: options.textToType,
        },
      ],
    });
  } catch (err) {
    console.warn("[varma-mouse] Failed to animate virtual cursor:", err);
  }
}
