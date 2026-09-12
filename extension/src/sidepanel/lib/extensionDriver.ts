/**
 * Extension Tab Driver
 *
 * Allows V.A.R.M.A to run on ANY browser without requiring Playwright or CDP
 * (--remote-debugging-port=9222).
 *
 * Executes DOM extraction, clicks, text typing, scrolling, and navigation
 * directly on the user's active tab via chrome.scripting and chrome.tabs.
 */

export interface DriverActionRequest {
  id: number;
  action:
    | "observe"
    | "click"
    | "type"
    | "navigate"
    | "scroll"
    | "read"
    | "cursor"
    | "task_border"
    | "refresh_visuals"
    | "clear_overlay"
    | "apply_visuals"
    | "set_visuals";
  index?: number;
  text?: string;
  url?: string;
  new_tab?: boolean;
  submit?: boolean;
  clear?: boolean;
  direction?: "up" | "down";
  amount?: number;
  show_overlay?: boolean;
  show_cursor?: boolean;
  x?: number;
  y?: number;
  instant?: boolean;
  ripple?: boolean;
}

export interface DriverActionResponse {
  type: "DRIVER_RESPONSE";
  id: number;
  result: Record<string, unknown>;
}

/** Get the currently active browser tab */
async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const currentWin = await chrome.tabs.query({ active: true, currentWindow: true });
    if (currentWin[0]?.id) return currentWin[0];

    const lastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (lastFocused[0]?.id) return lastFocused[0];

    const allActive = await chrome.tabs.query({ active: true });
    if (allActive[0]?.id) return allActive[0];

    const anyTabs = await chrome.tabs.query({});
    return anyTabs[0] ?? null;
  } catch {
    return null;
  }
}

/** Wait for tab loading to reach 'complete' status */
function waitForTabLoad(tabId: number, timeoutMs = 6000): Promise<void> {
  return new Promise((resolve) => {
    let timer: any = null;
    const listener = (tid: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (tid === tabId && changeInfo.status === "complete") {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => {
      try {
        chrome.tabs.onUpdated.removeListener(listener);
      } catch {}
      if (timer) clearTimeout(timer);
    };
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    try {
      chrome.tabs.onUpdated.addListener(listener);
    } catch {
      resolve();
    }
  });
}

// In-page extraction function injected into the target tab
function inPageExtract() {
  const MAX_ELEMENTS = 75;
  const INTERACTIVE = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=textbox]", "[role=checkbox]",
    "[role=radio]", "[role=tab]", "[role=menuitem]", "[role=option]",
    "[role=combobox]", "[role=switch]", "[role=searchbox]", "[role=slider]",
    "[contenteditable=true]", "[contenteditable='']", "[onclick]",
    "[tabindex]:not([tabindex='-1'])", "label[for]",
  ].join(",");

  const clamp = (s: string, n: number) => {
    s = (s || "").replace(/\s+/g, " ").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  };

  const vw = window.innerWidth, vh = window.innerHeight;
  const isVisible = (el: Element, rect: DOMRect) => {
    if (!rect || rect.width < 4 || rect.height < 4) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (parseFloat(style.opacity || "1") < 0.05) return false;
    if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) return false;
    return true;
  };

  const nodesByIndex: Element[] = [];
  const elements: Array<Record<string, unknown>> = [];
  const rawNodes = Array.from(document.querySelectorAll(INTERACTIVE));

  for (const el of rawNodes) {
    if (elements.length >= MAX_ELEMENTS) break;
    const rect = el.getBoundingClientRect();
    if (!isVisible(el, rect)) continue;

    const tag = el.tagName.toLowerCase();
    let label = "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      label = el.placeholder || el.name || el.getAttribute("aria-label") || "";
      if (!label && el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) label = lbl.textContent?.trim() || "";
      }
    }
    if (!label) {
      label = el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.textContent || "";
    }
    label = clamp(label, 70);

    const index = elements.length;
    elements.push({
      i: index,
      tag,
      label,
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      val: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) ? clamp(el.value, 40) : undefined,
    });
    nodesByIndex.push(el);
  }

  (window as any).__varmaNodes = nodesByIndex;

  const mainEl = document.querySelector("main, article, #mw-content-text, #content, [role='main']") || document.body;
  let text = "";
  if (mainEl) {
    const paras = Array.from(mainEl.querySelectorAll("p"))
      .map((p) => ((p as HTMLElement).innerText || p.textContent || "").trim())
      .filter((t) => t.length > 40 && !t.startsWith("{") && !t.startsWith("<"));
    if (paras.length > 0) {
      text = paras.slice(0, 10).join("\n\n");
    } else {
      text = ((mainEl as HTMLElement).innerText || mainEl.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    }
  }
  text = text.slice(0, 1500);

  const headings = Array.from(document.querySelectorAll("h1,h2,h3"))
    .slice(0, 10)
    .map((h) => (h.textContent || "").trim().slice(0, 70))
    .filter(Boolean);

  return {
    url: location.href,
    title: document.title,
    scroll: { y: Math.round(window.scrollY), max: Math.max(0, document.documentElement.scrollHeight - vh) },
    viewport: { w: vw, h: vh },
    headings,
    elements,
    text,
    redactions: [],
    redacted: false,
  };
}

// In-page click function
function inPageClick(index: number) {
  const nodes = (window as any).__varmaNodes || [];
  const el = nodes[index] as HTMLElement | undefined;
  if (!el) return { ok: false, action: "click", index, error: `Element [${index}] not found in DOM` };

  el.scrollIntoView({ block: "center", inline: "nearest" });
  el.focus();
  el.click();
  return { ok: true, action: "click", index, label: el.textContent?.trim().slice(0, 40) || "" };
}

// In-page type function
function inPageType(index: number, text: string, submit: boolean) {
  const nodes = (window as any).__varmaNodes || [];
  const el = nodes[index] as HTMLElement | undefined;
  if (!el) return { ok: false, action: "type", index, error: `Element [${index}] not found in DOM` };

  el.scrollIntoView({ block: "center", inline: "nearest" });
  el.focus();

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));

    if (submit) {
      if (el.form) {
        el.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        el.form.submit();
      } else {
        const enterEvent = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(enterEvent);
      }
    }
    return { ok: true, action: "type", index, text, label: el.placeholder || el.name || "" };
  }

  el.innerText = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return { ok: true, action: "type", index, text };
}

// In-page scroll function
function inPageScroll(direction: "up" | "down", amount: number) {
  const dy = direction === "up" ? -amount : amount;
  window.scrollBy({ top: dy, behavior: "smooth" });
  return { ok: true, action: "scroll", direction, amount };
}

// In-page read function
function inPageRead() {
  const mainEl = document.querySelector("main, article, #mw-content-text, #content, [role='main']") || document.body;
  let text = "";
  if (mainEl) {
    const paras = Array.from(mainEl.querySelectorAll("p"))
      .map((p) => ((p as HTMLElement).innerText || p.textContent || "").trim())
      .filter((t) => t.length > 40 && !t.startsWith("{") && !t.startsWith("<"));
    if (paras.length > 0) {
      text = paras.slice(0, 15).join("\n\n");
    } else {
      text = ((mainEl as HTMLElement).innerText || mainEl.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
    }
  }
  return { ok: true, action: "read", text: text.slice(0, 8000), url: location.href };
}

// In-page overlay function: draws numbered bounding boxes
function inPageDrawOverlay(payload: {
  elements: Array<{ i: number; x: number; y: number; w: number; h: number }>;
  activeIndex?: number;
}) {
  const ID = "__varma_overlay__";
  const old = document.getElementById(ID);
  if (old) old.remove();
  if (!payload || !payload.elements || !payload.elements.length) return 0;

  const root = document.createElement("div");
  root.id = ID;
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;";

  const scrollY = window.scrollY || 0;
  const scrollX = window.scrollX || 0;

  const frag = document.createDocumentFragment();
  for (const el of payload.elements) {
    const box = document.createElement("div");
    const active = payload.activeIndex === el.i;
    box.style.cssText = [
      "position:absolute",
      `left:${el.x}px`,
      `top:${el.y}px`,
      `width:${el.w}px`,
      `height:${el.h}px`,
      active ? "border:2px solid #22d3ee" : "border:1px solid rgba(34,211,238,0.65)",
      "border-radius:3px",
      active ? "background:rgba(34,211,238,0.2)" : "background:transparent",
      active ? "box-shadow:0 0 0 2px rgba(34,211,238,0.3), 0 0 14px rgba(34,211,238,0.5)" : "box-shadow:none",
      "transition:opacity .12s linear",
      "will-change:transform",
    ].join(";");
    box.dataset.vx = String(el.x);
    box.dataset.vy = String(el.y);
    box.dataset.index = String(el.i);

    const tag = document.createElement("span");
    tag.style.cssText = [
      "position:absolute",
      "top:-8px",
      "left:-1px",
      active ? "background:#22d3ee" : "background:rgba(8,20,26,0.92)",
      active ? "color:#04222b" : "color:#22d3ee",
      "font:600 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace",
      "padding:1px 4px",
      "border-radius:3px",
      "white-space:nowrap",
      "border:1px solid rgba(34,211,238,0.7)",
    ].join(";");
    tag.textContent = String(el.i);
    box.appendChild(tag);
    frag.appendChild(box);
  }
  root.appendChild(frag);
  (document.documentElement || document.body).appendChild(root);

  const reposition = () => {
    const dy = (window.scrollY || 0) - scrollY;
    const dx = (window.scrollX || 0) - scrollX;
    for (const box of Array.from(root.children)) {
      (box as HTMLElement).style.transform = `translate(${-dx}px,${-dy}px)`;
    }
  };
  (root as any).__varmaScrollHandler = reposition;
  window.addEventListener("scroll", reposition, { passive: true, capture: true });

  return payload.elements.length;
}

// In-page cursor function: draws SVG cyan cursor with gliding animation and ripple
function inPageDrawCursor(payload: { x: number; y: number; instant?: boolean; ripple?: boolean }) {
  const ID = "__varma_cursor__";
  let cursor = document.getElementById(ID);
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = ID;
    cursor.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:28px",
      "height:28px",
      "pointer-events:none",
      "z-index:2147483647",
      "filter:drop-shadow(0 0 10px rgba(34,211,238,0.95)) drop-shadow(0 2px 6px rgba(0,0,0,0.8))",
      "transition:transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)",
      "will-change:transform",
    ].join(";");
    cursor.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none">' +
      '<path d="M4 2.5 L19.5 11.2 L12.4 12.6 L9.1 19.4 Z" fill="#22d3ee" stroke="#04222b" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="4" cy="2.5" r="2" fill="#ffffff"/>' +
      "</svg>";
    (document.documentElement || document.body).appendChild(cursor);
  }
  cursor.style.display = "";

  if (payload.instant) {
    cursor.style.transition = "none";
    cursor.style.transform = `translate(${payload.x}px,${payload.y}px)`;
    void cursor.offsetHeight;
    cursor.style.transition = "transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)";
  } else {
    cursor.style.transition = "transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)";
    cursor.style.transform = `translate(${payload.x}px,${payload.y}px)`;
  }

  if (payload.ripple) {
    const r = document.createElement("div");
    r.style.cssText = [
      "position:fixed",
      `left:${payload.x}px`,
      `top:${payload.y}px`,
      "width:18px",
      "height:18px",
      "margin:-9px 0 0 -9px",
      "border-radius:50%",
      "border:2px solid #22d3ee",
      "pointer-events:none",
      "z-index:2147483647",
      "animation:varma-ripple .42s ease-out forwards",
    ].join(";");
    const s = document.createElement("style");
    s.textContent =
      "@keyframes varma-ripple { 0% { transform:scale(.4); opacity:1; } 100% { transform:scale(2.5); opacity:0; } }";
    r.appendChild(s);
    (document.documentElement || document.body).appendChild(r);
    setTimeout(() => r.remove(), 480);
  }
}

// Moves cursor to target element and highlights its bounding box
function inPageMoveCursorToElement(index: number, ripple: boolean) {
  const nodes = (window as any).__varmaNodes || [];
  const el = nodes[index] as HTMLElement | undefined;
  if (!el) return;
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {}
  const rect = el.getBoundingClientRect();
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);

  const overlay = document.getElementById("__varma_overlay__");
  if (overlay) {
    for (const box of Array.from(overlay.children) as HTMLElement[]) {
      const isTarget = box.dataset.index === String(index);
      box.style.border = isTarget ? "2px solid #22d3ee" : "1px solid rgba(34,211,238,0.55)";
      box.style.background = isTarget ? "rgba(34,211,238,0.22)" : "transparent";
      box.style.boxShadow = isTarget ? "0 0 0 2px rgba(34,211,238,0.3), 0 0 14px rgba(34,211,238,0.5)" : "none";
    }
  }

  const ID = "__varma_cursor__";
  let cursor = document.getElementById(ID);
  if (!cursor) {
    cursor = document.createElement("div");
    cursor.id = ID;
    cursor.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:28px",
      "height:28px",
      "pointer-events:none",
      "z-index:2147483647",
      "filter:drop-shadow(0 0 10px rgba(34,211,238,0.95)) drop-shadow(0 2px 6px rgba(0,0,0,0.8))",
      "transition:transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)",
      "will-change:transform",
    ].join(";");
    cursor.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none">' +
      '<path d="M4 2.5 L19.5 11.2 L12.4 12.6 L9.1 19.4 Z" fill="#22d3ee" stroke="#04222b" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="4" cy="2.5" r="2" fill="#ffffff"/>' +
      "</svg>";
    (document.documentElement || document.body).appendChild(cursor);
  }
  cursor.style.display = "";
  cursor.style.transition = "transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)";
  cursor.style.transform = `translate(${x}px,${y}px)`;

  if (ripple) {
    const r = document.createElement("div");
    r.style.cssText = [
      "position:fixed",
      `left:${x}px`,
      `top:${y}px`,
      "width:18px",
      "height:18px",
      "margin:-9px 0 0 -9px",
      "border-radius:50%",
      "border:2px solid #22d3ee",
      "pointer-events:none",
      "z-index:2147483647",
      "animation:varma-ripple .42s ease-out forwards",
    ].join(";");
    const s = document.createElement("style");
    s.textContent =
      "@keyframes varma-ripple { 0% { transform:scale(.4); opacity:1; } 100% { transform:scale(2.5); opacity:0; } }";
    r.appendChild(s);
    (document.documentElement || document.body).appendChild(r);
    setTimeout(() => r.remove(), 480);
  }
}

// In-page task border indicating V.A.R.M.A is actively controlling the page
function inPageDrawTaskBorder() {
  const ID = "__varma_task_border__";
  if (document.getElementById(ID)) return;

  const root = document.createElement("div");
  root.id = ID;
  root.style.cssText =
    "position:fixed;inset:0;z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .35s ease;";

  const style = document.createElement("style");
  style.textContent = `
    @keyframes varma-border-pulse { 0%, 100% { opacity: .7; } 50% { opacity: 1; } }
    #${ID} .vtb-glow {
      position: fixed;
      inset: 0;
      pointer-events: none;
      box-shadow:
        inset 0 0 0 3px rgba(56, 224, 245, 0.85),
        inset 0 0 22px 3px rgba(56, 224, 245, 0.55),
        inset 0 0 90px 14px rgba(56, 224, 245, 0.32);
      animation: varma-border-pulse 2.6s ease-in-out infinite;
    }
    #${ID} .vtb-topbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, transparent, #38e0f5, transparent);
      box-shadow: 0 0 14px 2px rgba(56, 224, 245, 0.7);
      pointer-events: none;
    }
  `;
  root.appendChild(style);

  const glow = document.createElement("div");
  glow.className = "vtb-glow";
  root.appendChild(glow);

  const topbar = document.createElement("div");
  topbar.className = "vtb-topbar";
  root.appendChild(topbar);

  (document.documentElement || document.body).appendChild(root);
  requestAnimationFrame(() => {
    root.style.opacity = "1";
  });
}

// In-page clear overlay function
function inPageClearOverlay() {
  const el = document.getElementById("__varma_overlay__");
  if (el) {
    if ((el as any).__varmaScrollHandler) {
      window.removeEventListener("scroll", (el as any).__varmaScrollHandler, true);
    }
    el.remove();
  }
  const taskBorder = document.getElementById("__varma_task_border__");
  if (taskBorder) taskBorder.remove();
  const cursor = document.getElementById("__varma_cursor__");
  if (cursor) cursor.remove();
  return true;
}

// Show/hide overlay and cursor dynamically
function inPageSetVisuals(opts: { overlay?: boolean; cursor?: boolean }) {
  const overlay = document.getElementById("__varma_overlay__");
  const cursor = document.getElementById("__varma_cursor__");
  if (overlay && opts.overlay !== undefined) {
    overlay.style.display = opts.overlay ? "" : "none";
  }
  if (cursor && opts.cursor !== undefined) {
    cursor.style.display = opts.cursor ? "" : "none";
  }
  return {
    overlay: !!overlay && overlay.style.display !== "none",
    cursor: !!cursor && cursor.style.display !== "none",
  };
}

/** Execute a driver action requested by the server on the active tab */
export async function executeDriverAction(
  req: DriverActionRequest
): Promise<DriverActionResponse> {
  let tab = await getActiveTab();

  // Special case: navigate can execute even if no tab exists (creates one) or on internal pages
  if (req.action === "navigate") {
    try {
      if (req.url) {
        if (req.new_tab) {
          tab = await chrome.tabs.create({ url: req.url, active: true });
          if (tab?.id) {
            await waitForTabLoad(tab.id, 6000);
          }
        } else if (tab?.id) {
          await chrome.tabs.update(tab.id, { url: req.url });
          await waitForTabLoad(tab.id, 6000);
        } else {
          tab = await chrome.tabs.create({ url: req.url, active: true });
          if (tab?.id) {
            await waitForTabLoad(tab.id, 6000);
          }
        }
        // Brief settle time after DOM complete
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return {
        type: "DRIVER_RESPONSE",
        id: req.id,
        result: { ok: true, action: "navigate", url: req.url },
      };
    } catch (err: any) {
      return {
        type: "DRIVER_RESPONSE",
        id: req.id,
        result: { ok: false, action: "navigate", error: err?.message || String(err) },
      };
    }
  }

  // If no tab exists at all
  if (!tab?.id) {
    if (req.action === "observe") {
      return {
        type: "DRIVER_RESPONSE",
        id: req.id,
        result: {
          ok: true,
          url: "about:blank",
          title: "New Tab",
          scroll: { y: 0, max: 0 },
          viewport: { w: 1280, h: 800 },
          headings: [],
          elements: [],
          text: "No webpage is currently open. Propose 'navigate' to go to a website (e.g. google.com or wikipedia.org).",
          redactions: [],
          redacted: false,
        },
      };
    }
    return {
      type: "DRIVER_RESPONSE",
      id: req.id,
      result: { ok: false, error: "No active webpage tab found" },
    };
  }

  const tabId = tab.id;
  const tabUrl = tab.url || "";
  const isRestricted =
    tabUrl.startsWith("chrome://") ||
    tabUrl.startsWith("edge://") ||
    tabUrl.startsWith("about:") ||
    tabUrl.startsWith("devtools://") ||
    tabUrl.startsWith("chrome-extension://");

  // Handle restricted browser internal pages (new tab, settings, extensions)
  if (isRestricted) {
    if (req.action === "observe") {
      return {
        type: "DRIVER_RESPONSE",
        id: req.id,
        result: {
          ok: true,
          url: tabUrl || "about:blank",
          title: tab.title || "New Tab",
          scroll: { y: 0, max: 0 },
          viewport: { w: 1280, h: 800 },
          headings: [],
          elements: [],
          text: `Browser is currently on an internal page (${tabUrl || "New Tab"}). Propose 'navigate' with the URL to visit the target website.`,
          redactions: [],
          redacted: false,
        },
      };
    }
    if (req.action === "refresh_visuals" || req.action === "clear_overlay") {
      return {
        type: "DRIVER_RESPONSE",
        id: req.id,
        result: { ok: true },
      };
    }
    return {
      type: "DRIVER_RESPONSE",
      id: req.id,
      result: {
        ok: false,
        action: req.action,
        error: `Cannot interact with browser internal page (${tabUrl}). Propose 'navigate' to open a website first.`,
      },
    };
  }

  try {
    switch (req.action) {
      case "observe": {
        try {
          const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageExtract,
          });
          const result = (res?.result as Record<string, unknown>) || {
            ok: true,
            url: tabUrl,
            title: tab.title || "",
            elements: [],
            text: "",
          };

          // Draw bounding boxes if overlay is enabled
          const elements = (result.elements as Array<{ i: number; x: number; y: number; w: number; h: number }>) || [];
          if (elements.length > 0 && req.show_overlay !== false) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                func: inPageDrawOverlay,
                args: [{ elements }],
              });
            } catch {}
          }

          // Keep cursor always visible on screen
          if (req.show_cursor !== false) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                func: inPageDrawCursor,
                args: [{ x: 180, y: 180, instant: false }],
              });
            } catch {}
          }

          return {
            type: "DRIVER_RESPONSE",
            id: req.id,
            result,
          };
        } catch (err: any) {
          return {
            type: "DRIVER_RESPONSE",
            id: req.id,
            result: {
              ok: true,
              url: tabUrl,
              title: tab.title || "",
              elements: [],
              text: "",
              warning: String(err?.message || err),
            },
          };
        }
      }

      case "cursor": {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageDrawCursor,
            args: [{ x: req.x ?? 150, y: req.y ?? 150, instant: req.instant ?? true }],
          });
        } catch {}
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };
      }

      case "task_border": {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageDrawTaskBorder,
          });
        } catch {}
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };
      }

      case "click": {
        const index = req.index ?? 0;
        if (req.show_cursor !== false) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: inPageMoveCursorToElement,
              args: [index, true],
            });
            await new Promise((resolve) => setTimeout(resolve, 650));
          } catch {}
        }
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageClick,
          args: [index],
        });
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: (res?.result as Record<string, unknown>) || { ok: true, action: "click" },
        };
      }

      case "type": {
        const index = req.index ?? 0;
        if (req.show_cursor !== false) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: inPageMoveCursorToElement,
              args: [index, false],
            });
            await new Promise((resolve) => setTimeout(resolve, 650));
          } catch {}
        }
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageType,
          args: [index, req.text || "", req.submit ?? false],
        });
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: (res?.result as Record<string, unknown>) || { ok: true, action: "type" },
        };
      }

      case "scroll": {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageScroll,
          args: [req.direction || "down", req.amount || 400],
        });
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: (res?.result as Record<string, unknown>) || { ok: true, action: "scroll" },
        };
      }

      case "read": {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageRead,
        });
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: (res?.result as Record<string, unknown>) || { ok: true, action: "read" },
        };
      }

      case "refresh_visuals": {
        try {
          const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageExtract,
          });
          const result = res?.result as Record<string, unknown> | undefined;
          const elements = (result?.elements as any[]) || [];
          if (elements.length > 0 && req.show_overlay !== false) {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: inPageDrawOverlay,
              args: [{ elements }],
            });
          }
        } catch {}
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };
      }

      case "clear_overlay": {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageClearOverlay,
          });
        } catch {}
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };
      }

      case "apply_visuals":
      case "set_visuals": {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: inPageSetVisuals,
            args: [{ overlay: req.show_overlay, cursor: req.show_cursor }],
          });
          if (req.show_overlay) {
            const [res] = await chrome.scripting.executeScript({
              target: { tabId },
              func: inPageExtract,
            });
            const result = res?.result as Record<string, unknown> | undefined;
            const elements = (result?.elements as any[]) || [];
            if (elements.length > 0) {
              await chrome.scripting.executeScript({
                target: { tabId },
                func: inPageDrawOverlay,
                args: [{ elements }],
              });
            }
          }
        } catch {}
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };
      }

      default:
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };
    }
  } catch (err) {
    return {
      type: "DRIVER_RESPONSE",
      id: req.id,
      result: { ok: false, error: err instanceof Error ? err.message : String(err) },
    };
  }
}
