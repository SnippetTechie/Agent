"""Compact on-screen element extraction.

The agent needs three things every step:
  1. WHAT is on screen (interactive elements, with stable indices)
  2. WHERE it is (viewport coordinates, so we can draw boxes + move a cursor)
  3. enough TEXT to reason about the page

Doing this in one in-page pass keeps a step at ~30-80ms of perception instead of
the ~300-1000ms a screenshot-based pipeline costs.

The extractor is deliberately opinionated:
  * only viewport-visible, hit-testable elements are indexed
  * coordinates are CSS pixels relative to the viewport (what CDP needs)
  * output is capped so a huge page cannot blow up the prompt
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# In-page extraction script
# ---------------------------------------------------------------------------

EXTRACT_SCRIPT = r"""
((opts) => {
  // opts.skipText lets the visual-only refresh skip the expensive full-text
  // clone, since the overlay only needs element boxes.
  const SKIP_TEXT = !!(opts && opts.skipText);
  const MAX_ELEMENTS = 150;
  const MAX_TEXT = 2500;
  const MAX_LABEL = 70;

  const INTERACTIVE = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'summary',
    '[role=button]', '[role=link]', '[role=textbox]', '[role=checkbox]',
    '[role=radio]', '[role=tab]', '[role=menuitem]', '[role=option]',
    '[role=combobox]', '[role=switch]', '[role=searchbox]', '[role=slider]',
    '[contenteditable=true]', '[contenteditable=""]', '[onclick]',
    '[tabindex]:not([tabindex="-1"])', 'label[for]',
  ].join(',');

  const clamp = (s, n) => {
    s = (s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
  };

  const isVisible = (el, rect, style) => {
    if (!rect || rect.width < 4 || rect.height < 4) return false;
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (parseFloat(style.opacity || '1') < 0.05) return false;
    if (el.hasAttribute('disabled')) return false;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (rect.bottom < 0 || rect.right < 0 || rect.top > vh || rect.left > vw) return false;
    return true;
  };

  const labelFor = (el) => {
    // Prefer what a human would read, then what is machine-actionable.
    const parts = [];
    const aria = el.getAttribute('aria-label');
    if (aria) parts.push(aria);
    const ph = el.getAttribute('placeholder');
    if (ph) parts.push(ph);
    const title = el.getAttribute('title');
    if (title) parts.push(title);
    const name = el.getAttribute('name');
    if (name) parts.push(name);
    if (el.id) parts.push('#' + el.id);

    let text = el.innerText || el.value || el.textContent || '';
    text = clamp(text, MAX_LABEL);
    if (text) parts.unshift(text);

    if (!parts.length) {
      const alt = el.querySelector('img[alt]');
      if (alt) parts.push(alt.getAttribute('alt'));
    }
    const seen = new Set();
    const merged = [];
    for (const p of parts) {
      const k = clamp(p, MAX_LABEL);
      if (k && !seen.has(k)) { seen.add(k); merged.push(k); }
    }
    return clamp(merged.join(' | '), MAX_LABEL);
  };

  const nodes = Array.from(document.querySelectorAll(INTERACTIVE));
  const vh = window.innerHeight, vw = window.innerWidth;
  const elements = [];
  const nodesByIndex = [];

  for (const el of nodes) {
    if (elements.length >= MAX_ELEMENTS) break;
    let rect;
    try { rect = el.getBoundingClientRect(); } catch { continue; }
    const style = window.getComputedStyle(el);
    if (!isVisible(el, rect, style)) continue;

    // Skip elements fully covered by a later sibling/overlay (cookie banners etc.
    // create invisible duplicates that mislead the model).
    let cx = Math.min(vw - 1, Math.max(0, rect.left + rect.width / 2));
    let cy = Math.min(vh - 1, Math.max(0, rect.top + rect.height / 2));
    let topEl = null;
    try { topEl = document.elementFromPoint(cx, cy); } catch { topEl = null; }
    if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
      const topStyle = window.getComputedStyle(topEl);
      if (topStyle.pointerEvents === 'none') { topEl = null; }
      else continue; // genuinely occluded -> not actionable
    }

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    let kind = tag;
    if (tag === 'input') kind = 'input:' + (type || 'text');
    if (el.getAttribute('contenteditable') !== null) kind = 'contenteditable';

    const entry = {
      i: elements.length,
      tag: kind,
      label: labelFor(el),
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      w: Math.round(rect.width),
      h: Math.round(rect.height),
    };
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      // Never leak typed secret values to the model.
      if (type === 'password') entry.val = '[REDACTED]';
      else if (el.value) entry.val = clamp(String(el.value), MAX_LABEL);
    }
    if (el.href && tag === 'a') {
      // The full href is long and mostly tracking parameters; the host+path is
      // enough for the model to decide whether a link is relevant.
      try {
        const u = new URL(el.href);
        entry.href = (u.host + u.pathname).slice(0, 80);
      } catch {}
    }
    if (el.getAttribute('aria-expanded') === 'true') entry.expanded = true;
    if (el.getAttribute('aria-checked') === 'true') entry.checked = true;
    if (el.hasAttribute('disabled')) entry.disabled = true;
    if (el.getAttribute('aria-required') === 'true' || el.required) entry.required = true;

    elements.push(entry);
    nodesByIndex.push(el);
  }

  // Stash the live nodes so later actions can resolve an index back to a DOM
  // node without re-running the whole visibility/filter pass.
  try {
    window.__varmaNodes = nodesByIndex;
    window.__varmaState = { url: location.href, at: Date.now() };
  } catch {}

  // Visible text, minus the interactive labels we already report.
  const body = document.body;
  let text = '';
  if (body && !SKIP_TEXT) {
    const clone = body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,svg,iframe,canvas').forEach(n => n.remove());
    text = (clone.innerText || clone.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  text = clamp(text, MAX_TEXT);

  const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
    .slice(0, 12)
    .map(h => clamp(h.innerText || h.textContent, 70))
    .filter(Boolean);

  return {
    url: location.href,
    title: document.title,
    scroll: { y: Math.round(window.scrollY), max: Math.max(0, (document.scrollingElement || document.documentElement).scrollHeight - vh) },
    viewport: { w: vw, h: vh },
    headings,
    elements,
    text,
  };
})
"""

# ---------------------------------------------------------------------------
# Overlay script: draw numbered boxes so the human can see what the agent sees
# ---------------------------------------------------------------------------

OVERLAY_SCRIPT = r"""
((payload) => {
  const ID = '__varma_overlay__';
  const old = document.getElementById(ID);
  if (old) old.remove();
  if (!payload || !payload.elements || !payload.elements.length) return 0;

  const root = document.createElement('div');
  root.id = ID;
  root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';

  // Element coordinates are viewport-relative and only valid for the scroll
  // position they were measured at. Repositioning on scroll keeps the boxes
  // glued to their elements instead of drifting off.
  const scrollY = window.scrollY || 0;
  const scrollX = window.scrollX || 0;

  const frag = document.createDocumentFragment();
  for (const el of payload.elements) {
    const box = document.createElement('div');
    const active = payload.activeIndex === el.i;
    box.style.cssText = [
      'position:absolute',
      'left:' + el.x + 'px',
      'top:' + el.y + 'px',
      'width:' + el.w + 'px',
      'height:' + el.h + 'px',
      'border:' + (active ? '2px solid #22d3ee' : '1px solid rgba(34,211,238,0.55)'),
      'border-radius:3px',
      'background:' + (active ? 'rgba(34,211,238,0.16)' : 'transparent'),
      'box-shadow:' + (active ? '0 0 0 2px rgba(34,211,238,0.25), 0 0 12px rgba(34,211,238,0.45)' : 'none'),
      'transition:opacity .12s linear',
      'will-change:transform',
    ].join(';');
    box.dataset.vx = el.x;
    box.dataset.vy = el.y;

    const tag = document.createElement('span');
    tag.style.cssText = [
      'position:absolute',
      'top:-8px',
      'left:-1px',
      'background:' + (active ? '#22d3ee' : 'rgba(8,20,26,0.85)'),
      'color:' + (active ? '#04222b' : '#22d3ee'),
      'font:600 10px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace',
      'padding:1px 4px',
      'border-radius:3px',
      'white-space:nowrap',
      'border:1px solid rgba(34,211,238,0.6)',
    ].join(';');
    tag.textContent = String(el.i);
    box.appendChild(tag);
    frag.appendChild(box);
  }
  root.appendChild(frag);
  (document.body || document.documentElement).appendChild(root);

  // Keep boxes aligned to their elements while the page scrolls.
  if (root.__varmaScrollHandler) {
    window.removeEventListener('scroll', root.__varmaScrollHandler, true);
  }
  const reposition = () => {
    const dy = (window.scrollY || 0) - scrollY;
    const dx = (window.scrollX || 0) - scrollX;
    for (const box of root.children) {
      box.style.transform = 'translate(' + (-dx) + 'px,' + (-dy) + 'px)';
    }
  };
  root.__varmaScrollHandler = reposition;
  window.addEventListener('scroll', reposition, { passive: true, capture: true });

  return payload.elements.length;
})
"""

CLEAR_OVERLAY_SCRIPT = r"""
(() => {
  const el = document.getElementById('__varma_overlay__');
  if (el) {
    if (el.__varmaScrollHandler) {
      window.removeEventListener('scroll', el.__varmaScrollHandler, true);
    }
    el.remove();
  }
  const cursor = document.getElementById('__varma_cursor__');
  if (cursor) cursor.remove();
  return true;
})()
"""

# ---------------------------------------------------------------------------
# Show / hide the overlay + cursor without re-reading the page.
#
# Driven by the side panel's settings toggle, so the user can turn the visual
# debug layer off (or back on) while the agent is running.
# ---------------------------------------------------------------------------

SET_VISUALS_SCRIPT = r"""
((opts) => {
  const overlay = document.getElementById('__varma_overlay__');
  const cursor = document.getElementById('__varma_cursor__');
  const wantOverlay = !!opts.overlay;
  const wantCursor = !!opts.cursor;

  if (overlay) overlay.style.display = wantOverlay ? '' : 'none';
  if (cursor) cursor.style.display = wantCursor ? '' : 'none';
  return {
    overlay: !!overlay && overlay.style.display !== 'none',
    cursor: !!cursor && cursor.style.display !== 'none',
  };
})
"""

# ---------------------------------------------------------------------------
# Wait for the page to stop changing after an action.
#
# This is what removes the model's urge to emit `wait` actions: instead of the
# model spending a whole LLM step (~3s) on "the page is still loading", we
# cheaply wait for DOM quiescence here (~300ms).
# ---------------------------------------------------------------------------

WAIT_STABLE_SCRIPT = r"""
((timeoutMs) => new Promise((resolve) => {
  const start = Date.now();
  let lastChange = Date.now();
  let observer = null;
  try {
    observer = new MutationObserver(() => { lastChange = Date.now(); });
    observer.observe(document.documentElement || document, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
  } catch (e) { /* observer unavailable */ }

  const quietMs = 250;
  const tick = () => {
    const now = Date.now();
    const quiet = now - lastChange;
    const ready = document.readyState === 'complete';
    if (now - start >= timeoutMs || (quiet >= quietMs && ready)) {
      if (observer) observer.disconnect();
      resolve({ waited: now - start, quiet: quiet, ready: ready });
      return;
    }
    setTimeout(tick, 40);
  };
  tick();
}))
"""

# ---------------------------------------------------------------------------
# Cursor animation + click ripple, so actions are visible on the active tab
# ---------------------------------------------------------------------------

CURSOR_SCRIPT = r"""
((payload) => {
  const ID = '__varma_cursor__';
  let cursor = document.getElementById(ID);
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = ID;
    // No CSS transition: Chromium throttles transitions when a window is
    // occluded or minimised, which left the cursor visually stuck. Animating
    // with requestAnimationFrame always lands on the exact target instead.
    cursor.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'width:22px', 'height:22px',
      'pointer-events:none', 'z-index:2147483647',
      'filter:drop-shadow(0 2px 4px rgba(0,0,0,.45))',
    ].join(';');
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none">' +
      '<path d="M4 2.5 L19.5 11.2 L12.4 12.6 L9.1 19.4 Z" fill="#22d3ee" stroke="#04222b" stroke-width="1.4" stroke-linejoin="round"/>' +
      '</svg>';
    (document.body || document.documentElement).appendChild(cursor);
  }
  cursor.style.display = '';

  const target = { x: payload.x, y: payload.y };
  const current = cursor.__varmaCur || target;

  const place = (x, y) => {
    cursor.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    cursor.__varmaCur = { x: x, y: y };
  };

  // Every move gets a token. A throttled requestAnimationFrame can fire late;
  // the token stops a stale callback from yanking the cursor back.
  cursor.__varmaToken = (cursor.__varmaToken || 0) + 1;
  const token = cursor.__varmaToken;

  if (cursor.__varmaRAF) {
    cancelAnimationFrame(cursor.__varmaRAF);
    cursor.__varmaRAF = null;
  }

  const dist = Math.hypot(target.x - current.x, target.y - current.y);
  if (payload.instant || dist < 3) {
    place(target.x, target.y);
  } else {
    // Keep the glide short: the agent acts immediately after this call.
    const duration = Math.max(110, Math.min(260, dist * 1.1));
    const start = performance.now();
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    const step = (now) => {
      if (cursor.__varmaToken !== token) return;
      const p = Math.min(1, (now - start) / duration);
      const e = ease(p);
      place(
        current.x + (target.x - current.x) * e,
        current.y + (target.y - current.y) * e
      );
      if (p < 1) {
        cursor.__varmaRAF = requestAnimationFrame(step);
      } else {
        cursor.__varmaRAF = null;
        place(target.x, target.y);
      }
    };
    cursor.__varmaRAF = requestAnimationFrame(step);

    // Guarantee the cursor lands on target even if rAF is throttled (background
    // window / occluded tab), where the frame callback may never run.
    setTimeout(() => {
      if (cursor.__varmaToken !== token) return;
      if (cursor.__varmaRAF) {
        cancelAnimationFrame(cursor.__varmaRAF);
        cursor.__varmaRAF = null;
      }
      place(target.x, target.y);
    }, duration + 60);
  }

  if (payload.ripple) {
    const r = document.createElement('div');
    r.style.cssText = [
      'position:fixed',
      'left:' + target.x + 'px',
      'top:' + target.y + 'px',
      'width:14px', 'height:14px',
      'margin:-7px 0 0 -7px',
      'border-radius:50%',
      'border:2px solid #22d3ee',
      'pointer-events:none',
      'z-index:2147483647',
      'animation:varma-ripple .5s ease-out forwards',
    ].join(';');
    if (!document.getElementById('__varma_style__')) {
      const st = document.createElement('style');
      st.id = '__varma_style__';
      st.textContent = '@keyframes varma-ripple{from{transform:scale(.4);opacity:.95}to{transform:scale(3.4);opacity:0}}';
      document.head.appendChild(st);
    }
    (document.body || document.documentElement).appendChild(r);
    setTimeout(() => r.remove(), 520);
  }
  return true;
})
"""

# ---------------------------------------------------------------------------

def format_state_for_prompt(state: dict, *, max_elements: int = 220) -> str:
    """Render extracted state as compact text for the LLM.

    Every line is `<index> <tag> "<label>" @(x,y wxh)` which is enough for the
    model to choose an index without needing a screenshot.
    """
    if not state:
        return "[no page state]"

    lines: list[str] = []
    lines.append(f"URL: {state.get('url', '')}")
    if state.get("title"):
        lines.append(f"TITLE: {state['title']}")
    scroll = state.get("scroll") or {}
    if scroll:
        lines.append(f"SCROLL: y={scroll.get('y', 0)} of {scroll.get('max', 0)}")
    headings = state.get("headings") or []
    if headings:
        lines.append("HEADINGS: " + " | ".join(headings[:8]))

    elements = state.get("elements") or []
    lines.append(f"\nINTERACTIVE ELEMENTS ({len(elements)} visible):")
    for el in elements[:max_elements]:
        parts = [f"[{el['i']}]", el.get("tag", "?")]
        label = el.get("label") or ""
        if label:
            parts.append(f'"{label}"')
        flags = []
        if el.get("disabled"):
            flags.append("disabled")
        if el.get("checked"):
            flags.append("checked")
        if el.get("expanded"):
            flags.append("expanded")
        if el.get("required"):
            flags.append("required")
        if el.get("val"):
            flags.append(f"value={el['val']!r}")
        if el.get("href"):
            flags.append(f"href={el['href']}")
        if flags:
            parts.append("(" + ", ".join(flags) + ")")
        parts.append(f"@({el['x']},{el['y']} {el['w']}x{el['h']})")
        lines.append(" ".join(parts))

    text = state.get("text") or ""
    if text:
        lines.append("\nPAGE TEXT:\n" + text)

    return "\n".join(lines)
