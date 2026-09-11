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
  action: "observe" | "click" | "type" | "navigate" | "scroll" | "read" | "refresh_visuals" | "clear_overlay";
  index?: number;
  text?: string;
  url?: string;
  submit?: boolean;
  clear?: boolean;
  direction?: "up" | "down";
  amount?: number;
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

// In-page extraction function injected into the target tab
function inPageExtract() {
  const MAX_ELEMENTS = 120;
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
  text = text.slice(0, 5000);

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

/** Execute a driver action requested by the server on the active tab */
export async function executeDriverAction(
  req: DriverActionRequest
): Promise<DriverActionResponse> {
  let tab = await getActiveTab();

  // Special case: navigate can execute even if no tab exists (creates one) or on internal pages
  if (req.action === "navigate") {
    try {
      if (req.url) {
        if (tab?.id) {
          await chrome.tabs.update(tab.id, { url: req.url });
        } else {
          tab = await chrome.tabs.create({ url: req.url, active: true });
        }
        // Give navigation a moment to start loading
        await new Promise((resolve) => setTimeout(resolve, 1500));
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
          return {
            type: "DRIVER_RESPONSE",
            id: req.id,
            result: (res?.result as Record<string, unknown>) || {
              ok: true,
              url: tabUrl,
              title: tab.title || "",
              elements: [],
              text: "",
            },
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

      case "click": {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageClick,
          args: [req.index ?? 0],
        });
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: (res?.result as Record<string, unknown>) || { ok: true, action: "click" },
        };
      }

      case "type": {
        const [res] = await chrome.scripting.executeScript({
          target: { tabId },
          func: inPageType,
          args: [req.index ?? 0, req.text || "", req.submit ?? false],
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

      case "refresh_visuals":
      case "clear_overlay":
        return {
          type: "DRIVER_RESPONSE",
          id: req.id,
          result: { ok: true },
        };

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
