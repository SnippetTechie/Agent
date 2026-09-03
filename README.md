# V.A.R.M.A — Visual Anonymization & Redacted Mapping Agent

A Chrome side-panel extension, styled after Claude in Chrome's own panel, built for **SIH26171**
(ISRO problem statement — on-device redaction for browser agents).

**Read this first if you're picking this up from someone else on the team.** This repo currently
contains a complete, polished **frontend** — the whole side panel UI, the agent-run visualization,
approval flow, 10-language support, sound cues, and a first-run privacy notice. The actual
"AI agent doing things on a page" part is **simulated** — there is no backend yet. That's the next
piece to build, and §7 below tells you exactly where it plugs in.

---

## 1. What's in this repo

| Path | What it is |
|---|---|
| `extension/` | **The actual product.** A Manifest V3 Chrome side-panel extension (React + Tailwind). Fully built and installable today. |
| `Assets/` | Source logo file. |
| `shared/`, `server/`, `evaluation/`, `scripts/` | Empty placeholders reserved from an earlier architecture direction (see `CLAUDE.md`). **Not used by the current extension** — ignore these unless we deliberately revive that direction. |
| `CLAUDE.md` | The original SIH26171 problem-statement brief. Useful background, but the extension has moved past some of its specifics (no FastAPI server exists yet, no `/shared` types package is wired up). |

If you only care about running the app, you can ignore everything except `extension/`.

---

## 2. Prerequisites

- **Node.js 18+**
- **pnpm** — `corepack enable` (built into modern Node), or `npm install -g pnpm`
- **Google Chrome** (or another Chromium browser with side panel support — Chrome 114+)

---

## 3. Quick start — install and run the real extension

```bash
pnpm install
pnpm --filter extension build
```

Then in Chrome:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the **`extension/dist`** folder — not `extension/` itself, `dist` is the built output
5. Click the V.A.R.M.A icon in your Chrome toolbar

It opens as a real, docked side panel (not a popup, not a tab). At this point everything works:
the mock agent runs, the approval flow, all 10 languages, sound cues, mic dictation, and the
first-run privacy notice.

---

## 4. Development loop (live reload while editing)

```bash
pnpm --filter extension dev
```

This starts a Vite dev server on `http://localhost:5173`. Two ways to use it:

- **Fast iteration** — open `http://localhost:5173/src/sidepanel/sidepanel.html` directly in a
  normal Chrome tab. `chrome.tabs` / `chrome.storage` aren't available outside a real extension
  context, so a couple of things fall back gracefully (e.g. the tab-context label shows "No
  active tab"), but everything else — layout, the mock agent run, i18n, the approval flow —
  works and hot-reloads instantly as you edit.
- **Real extension context** — rebuild (`pnpm --filter extension build`) and hit the refresh icon
  on the V.A.R.M.A card in `chrome://extensions` whenever you need to test against real
  `chrome.tabs` / `chrome.storage` behavior (e.g. the active-tab pill, or persistence across
  panel reopens).

### Commands reference

| Command | What it does |
|---|---|
| `pnpm install` | Install all workspace dependencies |
| `pnpm --filter extension dev` | Start the dev server with hot reload |
| `pnpm --filter extension build` | Production build → `extension/dist` |
| `pnpm --filter extension exec tsc -p tsconfig.json --noEmit` | Type-check without building |

---

## 5. Project structure

```
extension/
├── manifest.config.ts        — MV3 manifest: side panel registration, permissions, icons
├── vite.config.ts            — build config (React + Tailwind v4 + CRXJS)
├── public/icons/              — toolbar icons (generated from Assets/ logo)
├── public/_locales/           — Chrome's own extension name/description i18n
│                                 (separate from the in-app language switcher below)
└── src/
    ├── background/index.ts    — opens the side panel when the toolbar icon is clicked
    ├── assets/varma-logo.png  — logo used in the header and empty state
    └── sidepanel/
        ├── SidePanel.tsx      — top-level layout; wires all the hooks together
        ├── main.tsx           — React mount point
        ├── types.ts           — core data model: AgentTurn, AgentStep, ApprovalMode, etc.
        ├── components/        — every UI piece:
        │   ├── Header.tsx / HeaderMenu.tsx     — top toolbar + overflow menu (language, mute)
        │   ├── InputDock.tsx                   — the message box: mic/send, approval-mode
        │   │                                      selector, auto-redact toggle
        │   ├── ApprovalModeMenu.tsx             — Manually / Automatically / Skip approvals
        │   ├── MessageFeed.tsx / MessageItem.tsx — the chat transcript
        │   ├── ActionCard.tsx / StatusChip.tsx  — the step-by-step run visualization
        │   ├── ConfirmationBanner.tsx           — the Approve/Deny gate for risky actions
        │   ├── SanitizedCanvasPreview.tsx        — the mock redacted-page preview
        │   ├── PrivacyAuditModal.tsx             — log of what's been "redacted" this session
        │   ├── PrivacyNoticeBanner.tsx           — first-run data notice
        │   └── PromptSuggestions.tsx             — empty-state suggestion chips
        ├── hooks/
        │   ├── useAgentSession.ts   — ⭐ the run loop (see §7 — this is what a backend replaces)
        │   ├── useApprovalMode.ts   — persisted approval-mode preference
        │   ├── useMuted.ts          — persisted sound preference
        │   └── usePrivacyNotice.ts  — first-run notice state
        └── lib/
            ├── mockAgent.ts    — ⭐ THE MOCK — fake steps, fake redaction boxes, fake summaries
            ├── i18n/           — translations for 10 languages + the React context/hook
            ├── sound.ts        — Web Audio UI sound cues (no audio files, synthesized)
            ├── speech.ts       — real Web Speech API mic-to-text
            ├── activeTab.ts    — real chrome.tabs lookup for the active tab's domain/favicon
            └── storage.ts      — chrome.storage wrappers (session vs. local)
```

---

## 6. What's real vs. what's mocked

| Piece | Status |
|---|---|
| UI, layout, animations, all 10 languages, sound cues | **Real** |
| Mic-to-text dictation | **Real** — browser's Web Speech API |
| Active-tab context (favicon, domain) | **Real** — via `chrome.tabs` |
| Session history / preferences storage | **Real** — `chrome.storage.session` / `chrome.storage.local` |
| First-run privacy notice + its Accept/Reject effect | **Real** — Reject genuinely disables local persistence |
| Redaction detection, "server reasoning," action execution | **Mocked** — `lib/mockAgent.ts` fakes this with keyword matching and timed delays. No real page is inspected, no backend is called. |
| Approval gate (manual / automatic / skip) | Real UI and state machine — but the thing being approved is fake |

---

## 7. Where the real backend plugs in

The one function that matters is `runTurn()` inside `hooks/useAgentSession.ts`. Right now it:

1. Calls into `lib/mockAgent.ts` (`buildInitialSteps`, `buildApprovalRequest`, `buildSummary`) to
   fabricate a plausible-looking 4-step run.
2. `await sleep(...)` between each step instead of waiting on a real response.

To wire in a real backend, replace that with actual calls to the reasoning service — sending the
real page content (respecting the auto-redact toggle already in `InputDock.tsx`) and receiving
back genuine step-by-step status instead of fabricated ones.

Keep the response shapes compatible with what's already in `types.ts` (`AgentTurn`, `AgentStep`,
`RedactionBox`, `ApprovalRequest`) and the existing components won't need to change. In
particular, `SanitizedCanvasPreview.tsx` already renders redaction boxes generically from
`{ tag, x, y, w, h }` (percentage-based) — feed it real coordinates and it should just work.

---

## 8. Known limitations

- No real network calls exist anywhere yet — everything client-side is simulated.
- `shared/`, `server/`, `evaluation/` are empty. If the original FastAPI-based architecture from
  `CLAUDE.md` gets revived, that's where it lives.
- Mic dictation needs a real microphone permission grant on first use — Chrome will prompt.
- The embedded logo asset is a large PNG (~580KB); worth compressing before a real release build.
