/**
 * DOM In-Page Placeholder Redactor
 *
 * Runs inside the user's active tab via chrome.scripting.executeScript.
 * Replaces sensitive text and form inputs directly in the live DOM
 * with high-visibility semantic placeholder badges BEFORE screenshots are taken.
 *
 * Guarantees zero raw PII leaks: Chrome's screenshot API captures the placeholders,
 * never the real sensitive pixels. The DOM is restored immediately after capture.
 */

export interface RedactionTarget {
  text: string;
  tag: string;
  label?: string;
}

export interface DomRedactionResult {
  appliedCount: number;
  tags: string[];
}

/**
 * Extracts visible text and all form inputs (with associated labels and values)
 * from the webpage for comprehensive PII analysis.
 */
export function inPageExtractPageContext(): string {
  const parts: string[] = [];

  // 1. Explicitly inspect all input and textarea elements first (form data is most critical)
  try {
    const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    inputs.forEach((el) => {
      const val = (el.value || "").trim();
      if (!val || val.length < 2) return;

      // Find label
      let labelText = "";
      if (el.id) {
        const lbl = document.querySelector(`label[for="${el.id}"]`);
        if (lbl) labelText = lbl.textContent?.trim() || "";
      }
      if (!labelText && el.closest("label")) {
        labelText = el.closest("label")?.textContent?.trim() || "";
      }
      if (!labelText) {
        labelText = el.getAttribute("aria-label") || el.placeholder || el.name || "";
      }
      if (!labelText) {
        const prev = el.previousElementSibling;
        if (prev && prev.textContent) labelText = prev.textContent.trim();
      }
      if (!labelText) {
        const container = el.closest("div, td, fieldset, li, p, tr");
        if (container) {
          const rowLbl = container.querySelector("label, .label, [class*='label'], [class*='title'], dt, th");
          if (rowLbl && rowLbl.textContent) labelText = rowLbl.textContent.trim();
        }
      }

      if (labelText) {
        parts.push(`${labelText}: ${val}`);
      } else {
        parts.push(val);
      }
    });
  } catch (err) {
    console.warn("[varma] Error reading inputs:", err);
  }

  // 2. Extract static page text
  try {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, svg, iframe, canvas, [hidden]").forEach((n) => n.remove());
    const bodyText = (clone.innerText || clone.textContent || "").replace(/\s+/g, " ").trim();
    if (bodyText) parts.push(bodyText);
  } catch (err) {
    console.warn("[varma] Error reading body text:", err);
  }

  return parts.join("\n").slice(0, 15000);
}

/**
 * In-page function injected into the target tab to apply placeholder badges.
 * Stashes original nodes and values on window.__varmaPlaceholders for restoration.
 */
export function inPageApplyPlaceholders(externalTargets: RedactionTarget[] = []): DomRedactionResult {
  const win = window as any;
  if (!win.__varmaPlaceholders) {
    win.__varmaPlaceholders = {
      inputs: [] as {
        element: HTMLInputElement | HTMLTextAreaElement;
        origType?: string;
        origValue: string;
        origBg: string;
        origColor: string;
        origBorder: string;
        origFontWeight: string;
        origFontFamily: string;
      }[],
      textSpans: [] as HTMLElement[],
    };
  }

  const state = win.__varmaPlaceholders;
  let appliedCount = 0;
  const appliedTags = new Set<string>();

  // On-device deterministic regex patterns
  const REGEX_PATTERNS = [
    // Aadhaar (12 digits, strictly 3 groups of 4, or masked XXXX XXXX 4471)
    { tag: "AADHAAR", re: /\b[0-9]{4}[\s-][0-9]{4}[\s-][0-9]{4}(?![\s-][0-9])\b/g },
    { tag: "AADHAAR", re: /\b[xX]{4}[\s-][xX]{4}[\s-][0-9]{4}(?![\s-][0-9])\b/g },
    // Bank Account Numbers (spaced 4 groups or 10-18 digits, e.g. 0345 1122 3344 55)
    { tag: "FINANCIAL", re: /\b\d{3,5}(?:[\s-]\d{2,5}){3,4}\b|\b\d{10,18}\b/g },
    // PAN Number (5 letters + 4 digits + 1 letter)
    { tag: "PAN", re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
    // Credit Card (16 digits)
    { tag: "FINANCIAL", re: /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|6(?:011|5[0-9]{2}))(?:[-\s]?[0-9]{4}){3}\b/g },
    // Mobile / Phone (Indian + International)
    { tag: "CONTACT", re: /(?:\+91[\s-]?)?[6789]\d{4}[\s-]?\d{5}\b|\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g },
    // Email (handles standard & local domains)
    { tag: "CONTACT", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\b/g },
    // Date of birth / Date patterns (DD-MM-YYYY or YYYY-MM-DD)
    { tag: "DOB", re: /\b(?:\d{2}[-/]\d{2}[-/]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})\b/g },
  ];

  // Sensitive Field label / name hints
  const SENSITIVE_LABEL_HINTS = [
    { tag: "PERSON_NAME", re: /(name|full[-_]?name|first[-_]?name|last[-_]?name|holder)/i },
    { tag: "DOB", re: /(dob|birth|date[-_]?of[-_]?birth)/i },
    { tag: "AADHAAR", re: /(aadhaar|aadhar)/i },
    { tag: "PAN", re: /\bpan\b|pan[-_]?no|pan[-_]?card/i },
    { tag: "ID_NUMBER", re: /(ssn|id[-_]?no|identity|license|licence|passport)/i },
    { tag: "CONTACT", re: /(mobile|phone|contact|tel|email|mail)/i },
    { tag: "ADDRESS", re: /(address|residential|street|city|state|pincode|zip)/i },
    { tag: "FINANCIAL", re: /(account|bank|ifsc|card|cvv|cvc|amount|balance)/i },
    { tag: "CREDENTIAL", re: /(pass|passwd|pwd|pin|otp|secret|token|key|auth)/i },
  ];

  // Helper to find associated label for an input
  const findInputLabel = (el: HTMLInputElement | HTMLTextAreaElement): string => {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${el.id}"]`);
      if (lbl && lbl.textContent) return lbl.textContent.trim();
    }
    const parentLbl = el.closest("label");
    if (parentLbl && parentLbl.textContent) return parentLbl.textContent.trim();
    const prev = el.previousElementSibling;
    if (prev && prev.textContent) return prev.textContent.trim();
    const container = el.closest("div, td, fieldset, li, p, tr");
    if (container) {
      const rowLbl = container.querySelector("label, .label, [class*='label'], [class*='title'], dt, th");
      if (rowLbl && rowLbl.textContent) return rowLbl.textContent.trim();
    }
    return [el.name, el.id, el.getAttribute("aria-label") || "", el.placeholder].join(" ");
  };

  // 1. REDACT INPUTS & TEXTAREAS
  const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  inputs.forEach((el) => {
    const val = (el.value || "").trim();
    if (!val || val.startsWith("[REDACTED")) return;

    const labelText = findInputLabel(el);
    let matchedTag: string | null = null;

    // Check A: Label hints
    for (const hint of SENSITIVE_LABEL_HINTS) {
      if (hint.re.test(labelText)) {
        matchedTag = hint.tag;
        break;
      }
    }

    // Check B: Input value regex
    if (!matchedTag) {
      for (const p of REGEX_PATTERNS) {
        p.re.lastIndex = 0;
        if (p.re.test(val)) {
          matchedTag = p.tag;
          break;
        }
      }
    }

    // Check C: External LFM2.5 targets
    if (!matchedTag && externalTargets.length > 0) {
      for (const t of externalTargets) {
        if (t.text && (val.toLowerCase().includes(t.text.toLowerCase()) || t.text.toLowerCase().includes(val.toLowerCase()))) {
          matchedTag = t.tag || "PII";
          break;
        }
      }
    }

    // Check D: Password input type
    if (!matchedTag && (el.getAttribute("type") || "").toLowerCase() === "password") {
      matchedTag = "CREDENTIAL";
    }

    if (matchedTag) {
      const origType = (el as HTMLInputElement).type;
      const isHtml5Input = el.tagName.toLowerCase() === "input" && origType && !["text", "password"].includes(origType.toLowerCase());

      state.inputs.push({
        element: el,
        origType,
        origValue: el.value,
        origBg: el.style.backgroundColor,
        origColor: el.style.color,
        origBorder: el.style.border,
        origFontWeight: el.style.fontWeight,
        origFontFamily: el.style.fontFamily,
      });

      if (isHtml5Input) {
        try {
          (el as HTMLInputElement).type = "text";
        } catch {}
      }

      el.value = `[REDACTED: ${matchedTag.toUpperCase()}]`;
      el.style.setProperty("background-color", "#18181b", "important");
      el.style.setProperty("color", "#f87171", "important");
      el.style.setProperty("border", "2px solid #ef4444", "important");
      el.style.setProperty("font-weight", "bold", "important");
      el.style.setProperty("font-family", "monospace", "important");
      appliedCount++;
      appliedTags.add(matchedTag.toUpperCase());
    }
  });

  // 2. REDACT STATIC TEXT NODES (e.g. Identity Cards, paragraphs, headings)
  // Build target list from both LFM2.5 external targets and deterministic regexes
  const allStringTargets: Array<{ text: string; tag: string }> = [];

  // Add valid external targets
  for (const t of externalTargets) {
    if (t.text && t.text.trim().length >= 3) {
      allStringTargets.push({ text: t.text.trim(), tag: t.tag || "PII" });
    }
  }

  // Walk all visible text nodes
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript" || tag === "textarea") {
          return NodeFilter.FILTER_REJECT;
        }
        if (parent.classList.contains("__varma_badge")) {
          return NodeFilter.FILTER_REJECT;
        }
        const text = node.textContent || "";
        return text.trim().length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    }
  );

  const textNodes: Text[] = [];
  let cur = walker.nextNode();
  while (cur) {
    textNodes.push(cur as Text);
    cur = walker.nextNode();
  }

  for (const node of textNodes) {
    const content = node.textContent || "";
    if (content.includes("[REDACTED:")) continue;

    const matches: { start: number; end: number; tag: string }[] = [];

    // Match A: External string targets (names, addresses from LFM2.5) - case-insensitive
    for (const target of allStringTargets) {
      if (!target.text || target.text.length < 2) continue;
      const escaped = target.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "gi");
      let match: RegExpExecArray | null = null;
      while ((match = re.exec(content)) !== null) {
        const found = match.index;
        const end = found + match[0].length;
        const overlap = matches.some((m) => (found >= m.start && found < m.end) || (end > m.start && end <= m.end));
        if (!overlap) {
          matches.push({ start: found, end, tag: target.tag });
        }
      }
    }

    // Match B: Deterministic regexes on text nodes (Aadhaar, masked Aadhaar, PAN, phone, DOB)
    for (const p of REGEX_PATTERNS) {
      p.re.lastIndex = 0;
      let match: RegExpExecArray | null = null;
      while ((match = p.re.exec(content)) !== null) {
        const found = match.index;
        const end = found + match[0].length;
        const overlap = matches.some((m) => (found >= m.start && found < m.end) || (end > m.start && end <= m.end));
        if (!overlap) {
          matches.push({ start: found, end, tag: p.tag });
        }
      }
    }

    if (matches.length === 0) continue;

    matches.sort((a, b) => a.start - b.start);

    const parent = node.parentNode;
    if (!parent) continue;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;

    for (const m of matches) {
      if (m.start > lastIdx) {
        frag.appendChild(document.createTextNode(content.slice(lastIdx, m.start)));
      }

      const badge = document.createElement("span");
      badge.className = "__varma_badge";
      badge.dataset.origText = content.slice(m.start, m.end);
      badge.textContent = `[REDACTED: ${m.tag.toUpperCase()}]`;

      badge.setAttribute(
        "style",
        "display: inline-block !important; " +
          "background-color: #18181b !important; " +
          "color: #f87171 !important; " +
          "border: 1px solid #ef4444 !important; " +
          "border-radius: 4px !important; " +
          "padding: 1px 5px !important; " +
          "margin: 0 2px !important; " +
          "font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; " +
          "font-size: 11px !important; " +
          "font-weight: 700 !important; " +
          "line-height: 1.3 !important; " +
          "box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important; " +
          "vertical-align: middle !important; " +
          "z-index: 999999 !important;"
      );

      frag.appendChild(badge);
      state.textSpans.push(badge);

      appliedCount++;
      appliedTags.add(m.tag.toUpperCase());
      lastIdx = m.end;
    }

    if (lastIdx < content.length) {
      frag.appendChild(document.createTextNode(content.slice(lastIdx)));
    }

    parent.replaceChild(frag, node);
  }

  return { appliedCount, tags: Array.from(appliedTags) };
}

/**
 * Restores live DOM inputs and text nodes to their exact original state.
 */
export function inPageRestorePlaceholders(): { restored: boolean } {
  const win = window as any;
  if (!win.__varmaPlaceholders) return { restored: false };

  const state = win.__varmaPlaceholders;

  // 1. Restore inputs
  if (state.inputs && state.inputs.length > 0) {
    for (const item of state.inputs) {
      try {
        if (item.origType && (item.element as HTMLInputElement).type !== item.origType) {
          try {
            (item.element as HTMLInputElement).type = item.origType;
          } catch {}
        }
        item.element.value = item.origValue;
        item.element.style.backgroundColor = item.origBg;
        item.element.style.color = item.origColor;
        item.element.style.border = item.origBorder;
        item.element.style.fontWeight = item.origFontWeight;
        item.element.style.fontFamily = item.origFontFamily;
      } catch (err) {
        // Element may have unmounted
      }
    }
  }

  // 2. Restore text nodes
  if (state.textSpans && state.textSpans.length > 0) {
    for (const badge of state.textSpans) {
      try {
        const origText = badge.dataset.origText ?? "";
        const parent = badge.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(origText), badge);
        }
      } catch (err) {
        // Ignore
      }
    }
  }

  win.__varmaPlaceholders = null;
  return { restored: true };
}
