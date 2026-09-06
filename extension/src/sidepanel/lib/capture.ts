/**
 * Full-page scrolling screenshot engine.
 *
 * Captures the entire active tab from top to bottom (similar to native mobile/desktop
 * scrolling screenshots), stitches the slices on an in-memory canvas, hides duplicate
 * sticky headers on lower slices, restores the user's scroll position, and POSTs the
 * full image to the local receiver (http://127.0.0.1:8000/screenshot).
 *
 * Falls back gracefully to single-viewport capture when running on restricted browser
 * pages (e.g. chrome://) or outside an extension context.
 */

const RECEIVER_BASE = "http://127.0.0.1:8002";
const RECEIVER_URL = `${RECEIVER_BASE}/screenshot`;
const CHAT_URL = `${RECEIVER_BASE}/chat`;
const MAX_TOTAL_HEIGHT = 16000; // max canvas height in CSS px
const MAX_SCROLL_SLICES = 12;   // safety cap against infinite-scroll pages
const SLICE_PAINT_DELAY_MS = 120;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResponse {
  ok: boolean;
  response: string;
  error?: string;
  offline?: boolean;
  model?: string;
}

/**
 * Send conversational text message to local receiver without capturing any screenshot.
 */
export async function sendChatMessage(
  prompt: string,
  history: ChatMessage[] = [],
  signal?: AbortSignal
): Promise<ChatResponse> {
  try {
    const res = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, messages: history }),
      signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        response: `Local server returned error code ${res.status}.`,
        error: `HTTP ${res.status}`,
      };
    }

    const data = (await res.json()) as ChatResponse;
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err;
    }
    return {
      ok: false,
      response: "Could not connect to local receiver. Ensure receiver is running (`python server/receiver.py`).",
      error: err instanceof Error ? err.message : "Network error",
      offline: true,
    };
  }
}

export interface CaptureResult {
  ok: boolean;
  /** The captured image as a data URL ("" when capture failed). */
  dataUrl: string;
  /** Human-readable reason when ok is false. */
  error?: string;
  /** Path where the PNG was saved on the machine (e.g. screenshots/<timestamp>-<name>.png). */
  savedPath?: string;
  /** Number of bytes saved. */
  bytes?: number;
  /** UI-TARS vision analysis/description of the screenshot. */
  analysis?: string;
  /** Error message from UI-TARS/vLLM if analysis failed. */
  analysisError?: string;
  /** Status of the vLLM model connection. */
  vllmStatus?: "online" | "offline";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load captured image slice"));
    img.src = dataUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = comma >= 0 ? dataUrl.slice(0, comma) : "";
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const mime = meta.match(/data:(.*?);/)?.[1] ?? "image/png";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Capture visible tab viewport via chrome.tabs API.
 */
function captureVisibleTab(windowId?: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const cb = (dataUrl?: string) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!dataUrl) {
        reject(new Error("No image data captured"));
      } else {
        resolve(dataUrl);
      }
    };

    if (typeof windowId === "number") {
      chrome.tabs.captureVisibleTab(windowId, { format: "png" }, cb);
    } else {
      chrome.tabs.captureVisibleTab({ format: "png" }, cb);
    }
  });
}

interface PageMetrics {
  totalHeight: number;
  totalWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  originalX: number;
  originalY: number;
}

/**
 * Injected script: queries the document's total scroll dimensions and original position.
 */
function queryPageMetrics(): PageMetrics {
  const doc = document.documentElement;
  const body = document.body;
  const scrollEl = document.scrollingElement || doc || body;

  const originalX = window.scrollX ?? window.pageXOffset ?? doc?.scrollLeft ?? body?.scrollLeft ?? scrollEl?.scrollLeft ?? 0;
  const originalY = window.scrollY ?? window.pageYOffset ?? doc?.scrollTop ?? body?.scrollTop ?? scrollEl?.scrollTop ?? 0;

  return {
    totalHeight: Math.max(
      doc?.scrollHeight || 0,
      body?.scrollHeight || 0,
      doc?.offsetHeight || 0,
      body?.offsetHeight || 0,
      doc?.clientHeight || 0,
      scrollEl?.scrollHeight || 0
    ),
    totalWidth: Math.max(
      doc?.scrollWidth || 0,
      body?.scrollWidth || 0,
      doc?.offsetWidth || 0,
      body?.offsetWidth || 0,
      doc?.clientWidth || 0,
      scrollEl?.scrollWidth || 0
    ),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    originalX,
    originalY,
  };
}

/**
 * Injected script: scrolls the page to a specified Y coordinate using all scroll APIs.
 */
function scrollPage(y: number): void {
  window.scrollTo({ left: 0, top: y, behavior: "instant" as ScrollBehavior });
  window.scrollTo(0, y);
  if (document.documentElement) document.documentElement.scrollTop = y;
  if (document.body) document.body.scrollTop = y;
  if (document.scrollingElement) document.scrollingElement.scrollTop = y;
}

/**
 * Injected script: temporarily hides sticky and fixed elements on lower slices
 * so headers are not repeatedly pasted down the entire stitched image.
 */
function hideStickyElements(): void {
  const elements = document.querySelectorAll("*");
  for (const el of elements) {
    if (el instanceof HTMLElement) {
      const style = window.getComputedStyle(el);
      if (style.position === "fixed" || style.position === "sticky") {
        if (!el.hasAttribute("data-varma-orig-vis")) {
          el.setAttribute("data-varma-orig-vis", el.style.visibility || "visible");
        }
        el.style.visibility = "hidden";
      }
    }
  }
}

/**
 * Injected script: safely restores sticky elements and returns to the exact original scroll position.
 */
function restorePage(origX: number, origY: number): void {
  // 1. Restore sticky elements
  try {
    const elements = document.querySelectorAll("[data-varma-orig-vis]");
    for (const el of elements) {
      if (el instanceof HTMLElement) {
        const orig = el.getAttribute("data-varma-orig-vis");
        el.style.visibility = orig === "visible" || !orig ? "" : orig;
        el.removeAttribute("data-varma-orig-vis");
      }
    }
  } catch (err) {
    // Ignore sticky restore issues
  }

  // 2. Restore exact scroll position across all scroll containers
  try {
    window.scrollTo({ left: origX, top: origY, behavior: "instant" as ScrollBehavior });
    window.scrollTo(origX, origY);
    if (document.documentElement) {
      document.documentElement.scrollLeft = origX;
      document.documentElement.scrollTop = origY;
    }
    if (document.body) {
      document.body.scrollLeft = origX;
      document.body.scrollTop = origY;
    }
    if (document.scrollingElement) {
      document.scrollingElement.scrollLeft = origX;
      document.scrollingElement.scrollTop = origY;
    }
  } catch (err) {
    // Ignore scroll restore issues
  }
}

/**
 * Captures full-page scrolling screenshot of the active tab.
 */
async function captureFullPageScreenshot(): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    throw new Error("captureVisibleTab is unavailable outside extension context");
  }

  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.id) {
    throw new Error("No active tab found");
  }

  const tabId = activeTab.id;
  const windowId = activeTab.windowId;

  // 1. Try to query dimensions via chrome.scripting
  let metrics: PageMetrics | null = null;
  if (chrome.scripting?.executeScript) {
    try {
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        func: queryPageMetrics,
      });
      metrics = res?.result ?? null;
    } catch {
      // Scripting not supported on this page (e.g. chrome://) -> fallback to visible viewport
    }
  }

  // If we can't inspect the DOM or the page fits in one screen, take a single viewport snapshot
  if (!metrics || metrics.totalHeight <= metrics.viewportHeight + 25) {
    return captureVisibleTab(windowId);
  }

  const { viewportHeight, originalX, originalY } = metrics;
  const targetHeight = Math.min(
    metrics.totalHeight,
    viewportHeight * MAX_SCROLL_SLICES,
    MAX_TOTAL_HEIGHT
  );

  try {
    // 2. Scroll to top for slice 0
    await chrome.scripting.executeScript({
      target: { tabId },
      func: scrollPage,
      args: [0],
    });
    await sleep(SLICE_PAINT_DELAY_MS);

    const firstDataUrl = await captureVisibleTab(windowId);
    const firstImg = await loadImage(firstDataUrl);

    // Calculate pixel scale (for Retina / Windows display scaling, e.g. 1.25x / 1.5x)
    const scale = firstImg.naturalHeight / viewportHeight;
    const canvasWidth = firstImg.naturalWidth;
    const canvasHeight = Math.round(targetHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return firstDataUrl;
    }

    // Draw first slice
    ctx.drawImage(firstImg, 0, 0);

    // Hide sticky/fixed elements so they don't duplicate on subsequent scrolls
    await chrome.scripting.executeScript({
      target: { tabId },
      func: hideStickyElements,
    });

    // 3. Scroll down chunk by chunk
    let currentY = viewportHeight;
    while (currentY < targetHeight) {
      const isLastSlice = currentY + viewportHeight >= targetHeight;
      const scrollY = isLastSlice ? targetHeight - viewportHeight : currentY;

      await chrome.scripting.executeScript({
        target: { tabId },
        func: scrollPage,
        args: [scrollY],
      });
      await sleep(SLICE_PAINT_DELAY_MS);

      const sliceDataUrl = await captureVisibleTab(windowId);
      const sliceImg = await loadImage(sliceDataUrl);

      if (isLastSlice) {
        // Draw only the bottom non-overlapping portion
        const remainingHeight = targetHeight - currentY;
        const sourceY = Math.round((viewportHeight - remainingHeight) * scale);
        const sourceH = Math.round(remainingHeight * scale);
        const destY = Math.round(currentY * scale);

        ctx.drawImage(
          sliceImg,
          0, sourceY, sliceImg.naturalWidth, sourceH,
          0, destY, sliceImg.naturalWidth, sourceH
        );
        break;
      } else {
        const destY = Math.round(currentY * scale);
        ctx.drawImage(sliceImg, 0, destY);
        currentY += viewportHeight;
      }
    }

    return canvas.toDataURL("image/png");
  } finally {
    // 4. Always restore sticky elements and return to the exact original scroll position
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: restorePage,
        args: [originalX, originalY],
      });
    } catch {
      // Ignore restoration errors
    }
  }
}

/**
 * Capture the full tab page and send the screenshot directly to the local receiver.
 * `prompt` is sanitized and used as the filename hint.
 */
export async function captureAndSaveScreenshot(prompt: string): Promise<CaptureResult> {
  if (typeof chrome === "undefined" || !chrome.tabs?.captureVisibleTab) {
    return {
      ok: false,
      dataUrl: "",
      error: "Capture unavailable outside extension context",
    };
  }

  let dataUrl: string;
  try {
    dataUrl = await captureFullPageScreenshot();
  } catch (err) {
    return {
      ok: false,
      dataUrl: "",
      error: err instanceof Error ? err.message : "Tab capture failed",
    };
  }

  const safeName = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  const blob = dataUrlToBlob(dataUrl);

  try {
    const res = await fetch(`${RECEIVER_URL}?name=${encodeURIComponent(safeName)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Prompt": encodeURIComponent(prompt),
      },
      body: blob,
    });

    if (!res.ok) {
      return {
        ok: false,
        dataUrl,
        error: `Receiver error (${res.status})`,
      };
    }

    const json = (await res.json()) as {
      ok: boolean;
      path?: string;
      bytes?: number;
      analysis?: string;
      analysis_error?: string;
      vllm_status?: "online" | "offline";
    };

    return {
      ok: true,
      dataUrl,
      savedPath: json.path,
      bytes: json.bytes,
      analysis: json.analysis,
      analysisError: json.analysis_error,
      vllmStatus: json.vllm_status,
    };
  } catch (err) {
    return {
      ok: false,
      dataUrl,
      error: "Local receiver offline (start with: python server/receiver.py)",
    };
  }
}