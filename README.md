<img width="1024" height="434" alt="image" src="https://github.com/user-attachments/assets/f67eebe9-512d-41a8-8bc0-574d8dd6f788" />


# V.A.R.M.A — On-Device Perception for a Light-Weight Browser Agent

A Chrome **side-panel** extension that perceives the page you are already on and
drives the tab you are actually looking at. Type a question and it answers; type
a task and it performs it on the real, visible page.

Built for **Smart India Hackathon — Problem SIH26171**
**"On-device Visual Perception for Light-weight Browser Agents"**
Indian Space Research Organisation (ISRO) / Department of Space.

| | |
|---|---|
| **Problem statement** | SIH26171 |
| **Organisation** | ISRO / Department of Space |
| **Theme** | Smart Automation (Software) |
| **Deliverable** | Privacy-preserving hybrid browser agent: client-side perception + redaction, server-side reasoning and action dispatch |
| **Repo layout** | `pnpm` workspace with one package (`extension`) plus a Python receiver (`server/`) |

---

## 1. What actually runs today (read this first)

This repository is a **working agent**, not a mock. It is honest about the
boundary between what is implemented and what is still on the roadmap.

| Capability | Status | Where |
|---|---|---|
| Chrome MV3 side panel (React) | ✅ implemented | `extension/` |
| Local perception of on-screen elements (DOM pass, no screenshot) | ✅ implemented | `server/agent/dom.py` |
| Structured action selection via vLLM guided JSON | ✅ implemented | `server/agent/llm.py`, `prompts.py` |
| Real browser control over CDP (click / type / navigate / scroll / press / hover) | ✅ implemented | `server/agent/session.py` |
| Streaming step events + approval gate + stop | ✅ implemented | `server/receiver.py`, `extension/.../agentWebSocket.ts` |
| Conversational chat mode (no page access) | ✅ implemented | `POST /chat` |
| On-page visual layer (numbered element boxes + animated cursor) | ✅ implemented | `server/agent/dom.py` |
| **Layer 1 — deterministic DOM PII redaction (0 ms)** | ✅ **implemented** | `server/agent/dom.py` |
| **Layer 2 — visual PII detection (faces, signatures) on WebGPU** | 🚧 roadmap | not yet wired into the loop |
| **Local VLM / OCR inference in the browser** | 🚧 roadmap | not yet wired into the loop |

> **Perception today is DOM-based, not pixel-based.** The agent reads the
> accessibility/DOM structure in a single in-page pass and sends **text only** to
> the model — no screenshots leave the client. **Layer 1 redaction now runs on
> that text before it is serialized** (passwords, card numbers, Aadhaar/PAN/SSN,
> JWTs, coordinates, emails). Layer 2 (visual detection of faces/signatures over
> an in-memory `OffscreenCanvas`) is the next milestone. See
> [§10](#10-privacy--redaction-architecture).

---

## 2. How the demo works

```
┌──────────────────────────────────────────────────────────────┐
│ Chrome Side Panel (React, MV3)                               │
│   chat  → POST /chat                                         │
│   task  → WS /ws/agent   ← step events stream back           │
└──────────────┬─────────────────────────────────▲─────────────┘
               │                                 │ PAGE_STATE / ACTION / STEP_COMPLETE
               ▼                                 │
┌────────────────────────────────────────────────┴─────────────┐
│ FastAPI receiver   http://127.0.0.1:8002                     │
│   server/agent/  — the agent loop                            │
│     observe → one in-page DOM pass (elements + text)         │
│     think   → one vLLM structured-output call                │
│     act     → CDP: click / type / navigate / scroll / press  │
└───────┬───────────────────────────────┬──────────────────────┘
        ▼                               ▼
┌─────────────────────┐     ┌──────────────────────────────────┐
│ Chrome via CDP      │     │ vLLM  http://127.0.0.1:8000/v1   │
│ http://localhost:9222│    │ OpenAI-compatible + guided JSON  │
│ (your real tab)     │     │ (remote GPU box over SSH tunnel) │
└─────────────────────┘     └──────────────────────────────────┘
```

The receiver **attaches to a browser you launch** — it never starts or replaces
your browser, and it never resizes the window. The agent drives whichever tab is
active, so the audience watches the real page being operated.

**Why not browser-use for the hot path?** The original prototype used it, but it
captures a screenshot every step, emits planning/thinking fields, and rebuilds
the browser session per run. Replacing it with a purpose-built loop took the
reference server from **3.16 s → 1.57 s per step**.

---

## 3. Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** and **pnpm** | `npm i -g pnpm` |
| **Python 3.11+** | used by the receiver |
| **Chrome or Brave** | must be launchable with `--remote-debugging-port` |
| **A vLLM server** | OpenAI-compatible API; may run on a remote GPU box |

```bash
pnpm install
pip install -r server/requirements.txt
python -m playwright install chromium
```

> Playwright is installed even though the agent does not launch a browser: it is
> the CDP client used to drive your existing Chrome.

---

## 4. Launch runbook (how to present the project)

Run the four components **in this order**. Use four terminals.

### Step 1 — Launch Chrome with a debugging port

Close every running Chrome window first, then:

```powershell
# Windows
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\ChromeDevProfile"
```

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-dev"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-dev"
```

> **A dedicated `--user-data-dir` is mandatory.** Chrome refuses to open the
> debugging port on your default profile. Sign in / set up the profile once; it
> persists.

Verify the port is live: <http://localhost:9222/json/version> should return JSON.

### Step 2 — Start the model (vLLM)

On the GPU box:

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \
  --served-model-name gemma-3 \
  --trust-remote-code \
  --max-model-len 32768
```

If the GPU box is remote, tunnel port 8000 to the machine running the extension:

```bash
ssh -L 8000:localhost:8000 <user>@<gpu-host>
```

Then confirm from the demo machine:

```bash
curl http://127.0.0.1:8000/v1/models
```

> Keep the served model name as `gemma-3` (the code's default) or set
> `VLLM_MODEL` to whatever you serve — the receiver auto-resolves it.

### Step 3 — Start the receiver

```powershell
# Windows PowerShell
python scripts/start_server.py
```

```bash
# any platform
python scripts/start_server.py     # or: python server/receiver.py
```

It listens on `http://127.0.0.1:8002`. Check it:

```bash
curl http://127.0.0.1:8002/health
```

A healthy response reports `vllm.reachable: true` and `cdp.reachable: true`.
`start_server.py` is idempotent — if a healthy receiver already owns the port it
reuses it instead of starting a second one.

### Step 4 — Build and load the extension

```bash
pnpm build          # type-checks, then bundles to extension/dist
```

In Chrome:

1. open `chrome://extensions`
2. enable **Developer mode** (top-right)
3. **Load unpacked** → select the **`extension/dist`** folder
4. pin **V.A.R.M.A** to the toolbar and **click its icon** — the side panel opens
   (it is a side panel, not a popup, so it survives navigation and tab switches)

### Step 5 — Connect and verify

1. Navigate the Chrome tab to a page (e.g. `https://www.google.com`).
2. Keep that tab **active** — the agent drives the active tab.
3. In the panel, type `hello` → should get a chat reply (proves `/chat` + vLLM).
4. Type `Search for ISRO on Google` → the agent should attach, box the elements,
   type, submit, and stream steps back.

**Everything is connected when:** the header shows the active domain, chat replies
come back, and a task run streams `perceive → think → act` steps.

### Two ways to run

| Workflow | Command | Behaviour |
|---|---|---|
| **Dev (recommended while presenting)** | `pnpm dev` | Vite dev server **plus an auto-started receiver** (via `extension/vite.config.ts`). HMR on the panel. Load `extension/dist` once. |
| **Clean / production** | `pnpm build` + `pnpm start` | Static bundle + standalone receiver. No dev server, no HMR. |

> Do not run `pnpm dev` and `pnpm start` at the same time — both try to own
> port `8002`. `start_server.py` will detect and reuse a healthy one, but pick
> one workflow to avoid confusion.

### Pre-demo checklist

- [ ] No other Chrome instance is running (Step 1 needs the port).
- [ ] `http://localhost:9222/json/version` returns JSON.
- [ ] `curl http://127.0.0.1:8000/v1/models` returns the model.
- [ ] `curl http://127.0.0.1:8002/health` shows `vllm.reachable` and `cdp.reachable` = true.
- [ ] Extension loaded from `extension/dist`, icon pinned.
- [ ] Demo tab is open, signed in if needed, and **focused**.
- [ ] Approval mode chosen deliberately — `manual` to demonstrate the safety
      gate on stage, `skip` for the fastest uninterrupted run.

### If there is no GPU on demo day

- Point `VLLM_BASE_URL` at any OpenAI-compatible endpoint and set `VLLM_MODEL`
  accordingly, **or**
- run a small local server (e.g. Ollama's OpenAI-compatible endpoint) and set
  `VLLM_BASE_URL=http://127.0.0.1:11434/v1`.
- The panel degrades gracefully: `/chat` reports `offline`, and `/ws/agent`
  sends an `ERROR` event naming exactly which endpoint is unreachable.

---

## 5. Usage

| You type | Mode | What happens |
|---|---|---|
| `hello`, `how are you` | chat | Plain conversational reply — no page access, no browser control |
| `Search for ISRO on Google` | task | The agent drives the active tab and reports back |
| `Open wikipedia.org and search for ISRO` | task | Multi-step navigation + typing |

Per step the panel shows how many elements the agent could see, how long
perception took, and exactly which action it executed.

**Approval gate** (dock menu) — enforced **server-side** in `AgentLoop._await_approval`:

| Mode | Behaviour |
|---|---|
| `skip` | bypass the gate entirely — no prompt, fastest |
| `auto` | shows the banner for the audit trail, then self-approves after ~1 s |
| `manual` | pauses the loop and waits for an explicit Approve / Decline click (default) |

Only state-changing actions are gated (`click`, `type`, `navigate`, `press`,
`go_back`). Perception-only actions (`scroll`, `hover`, `wait`, `wait_for`,
`read`) never interrupt the run. A denial leaves the page untouched and stops the
task; if the panel never answers, the server gives up after
`AGENT_APPROVAL_TIMEOUT` (default 180 s) rather than hanging forever.

---

## 6. Measured latency

Reference server: single A6000, Gemma-3-12B bf16, vLLM, ~14.3 tok/s decode.

| Stage | Time |
|---|---|
| Perceive (DOM extract + overlay) | **10–90 ms** |
| Think (vLLM, ~21 output tokens) | **1.5–3.0 s** |
| Act (click / type / navigate) | **0.4–1.0 s** |
| **Per step** | **≈ 2.2–4.0 s** |

Decode speed dominates: a step costs roughly `output_tokens / 14.3` seconds. The
output schema is therefore **action-only** — no `thought`, no plan, no
evaluation — and the human-readable UI label is synthesised locally for free.

**To reach 1–2 s per step, make the model faster** (see [§11](#11-choosing-a-model)).

---

## 7. Project structure

```
extension/                         Manifest V3 side-panel extension
  manifest.config.ts               MV3 manifest (side panel, permissions, CSP)
  vite.config.ts                   CRXJS build + auto-start of the receiver in dev
  public/
    _locales/{en,es,fr,hi}/        extension-level i18n (chrome://extensions strings)
    icons/                         16 / 48 / 128 px icons
  src/
    background/index.ts            opens the side panel on toolbar click
    assets/varma-logo.png          panel logo
    sidepanel/
      sidepanel.html, main.tsx     entry points
      SidePanel.tsx                layout
      types.ts                     shared UI types (turns, actions, redaction tags)
      components/                  14 React components (feed, dock, cards, menus)
      hooks/
        useAgentSession.ts         ⭐ run loop (chat + task), approval, persistence
        useApprovalMode.ts         approval-mode persistence
        useVisualSettings.ts       overlay/cursor toggles
        useMuted.ts, useTabScope.ts, usePrivacyNotice.ts
      lib/
        agentWebSocket.ts          ⭐ WS client for /ws/agent
        capture.ts                 HTTP client for /chat + /health
        actions.ts                 action → human-readable UI label
        intent.ts                  chat vs task routing
        activeTab.ts               active-tab domain / favicon context
        storage.ts, sound.ts, speech.ts
        mockAgent.ts               step scaffolding + summaries (UI labels only)
        i18n/                      in-app language switching

server/                            Python reasoning bridge
  receiver.py                      ⭐ FastAPI: /health, /chat, /screenshot, WS /ws/agent
  requirements.txt
  .env.example                     template for local overrides (copy to .env)
  agent/
    __init__.py                    package exports
    loop.py                        ⭐ observe → think → act
    session.py                     CDP connection + action execution + visuals
    dom.py                         in-page element extraction + overlay + cursor
    prompts.py                     system prompt + action JSON schema
    llm.py                         vLLM client (guided JSON, connection reuse)

scripts/
  start_server.py                  start the receiver with sane defaults
  probes/                          latency / throughput / schema experiments
    probe_llm.py, probe_latency.py, probe_throughput.py, probe_schema.py
  debug/                           on-page visual layer diagnostics
    check_overlay.py, debug_cursor.py, debug_visibility.py, test_refresh.py
  tests/                           end-to-end checks against a live browser
    test_agent.py, test_ws.py, capture_visuals.py
    test_approval.py               approval gate (stubbed — no browser needed)
    test_redaction.py              Layer-1 redaction (shipped script under Node)

docs/
  MODEL_RECOMMENDATIONS.md         which LLM/VLM to run, and why

demo.py                            run a task from the terminal (no extension)
CLAUDE.md                          project constitution, architecture, guardrails
```

---

## 8. Scripts reference

All commands assume the repo root as the working directory.

| Command | Purpose |
|---|---|
| `pnpm dev` | Vite dev server **+ auto-started receiver** (HMR) |
| `pnpm build` | type-check + bundle extension to `extension/dist` |
| `pnpm test` | run the approval-gate and redaction suites (no browser/GPU) |
| `pnpm start` / `pnpm server` | start the receiver standalone |
| `python demo.py "<task>"` | run the agent loop from the terminal (watches the real tab) |
| `python scripts/probes/probe_throughput.py` | raw decode tok/s of the vLLM server |
| `python scripts/probes/probe_llm.py` | one-call latency + JSON validity probe |
| `python scripts/probes/probe_latency.py` | latency vs prompt / output size sweep |
| `python scripts/probes/probe_schema.py` | compare action-schema cost options |
| `python scripts/tests/test_agent.py "<task>" [steps]` | end-to-end agent test (in-process) |
| `python scripts/tests/test_ws.py "<task>"` | end-to-end test through `WS /ws/agent` |
| `python scripts/tests/test_approval.py` | **approval-gate tests — stubbed, no browser or GPU needed** |
| `python scripts/tests/test_redaction.py` | **Layer-1 redaction tests — runs the shipped in-page script under Node** |
| `python scripts/tests/capture_visuals.py "<task>"` | capture before/after screenshots of the visual layer |
| `python scripts/debug/check_overlay.py` | verify overlay boxes + cursor render on the page |
| `python scripts/debug/debug_cursor.py` | inspect cursor transform / DOM state |
| `python scripts/debug/debug_visibility.py` | confirm CSS transition throttling on a background tab |
| `python scripts/debug/test_refresh.py` | verify visuals are re-drawn after a navigating submit |

The probes and end-to-end tests require a live browser on `:9222` and (except
`probe_throughput.py`) a live vLLM on `:8000`.

---

## 9. Configuration

The receiver reads **process environment variables**. It does not auto-load
`server/.env`; export the variables in your shell (see `server/.env.example`).

| Variable | Default | Description |
|---|---|---|
| `RECEIVER_HOST` | `127.0.0.1` | Receiver bind address |
| `RECEIVER_PORT` | `8002` | Receiver port |
| `VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | vLLM endpoint |
| `VLLM_MODEL` | `gemma-3` | Served model name (auto-resolved) |
| `VLLM_MAX_TOKENS` | `512` | Max output tokens per step |
| `CDP_URL` | `http://localhost:9222` | Browser debugging endpoint |
| `AGENT_MAX_STEPS` | `15` | Step cap per task |
| `AGENT_MAX_ACTIONS_PER_STEP` | `3` | Actions the model may emit |
| `AGENT_SHOW_OVERLAY` | `1` | Draw numbered boxes on the page (`0` to disable) |
| `AGENT_SHOW_CURSOR` | `1` | Animate a cursor on actions (`0` to disable) |
| `AGENT_AUTO_REDACT` | `1` | Layer-1 DOM PII redaction before text reaches the model |
| `AGENT_APPROVAL_MODE` | `manual` | Fallback gate mode when a client sends none |
| `AGENT_APPROVAL_TIMEOUT` | `180` | Seconds a `manual` gate waits for a decision |
| `AGENT_AUTO_APPROVE_DELAY` | `1.2` | Seconds the `auto` gate waits before self-approving |
| `PYTHON_BIN` | `python` / `python3` | Interpreter used by the Vite dev plugin |

Example override (PowerShell):

```powershell
$env:VLLM_BASE_URL = "http://127.0.0.1:8000/v1"
$env:VLLM_MODEL = "gemma-3"
python scripts/start_server.py
```

---

## 10. Privacy & redaction architecture

SIH26171 asks for privacy-preserving perception. This is the design the
codebase is built around, and its current implementation status.

### What is implemented now

- **No screenshots leave the client.** Perception is a DOM/accessibility pass
  that produces structured text (element index, tag, label, bounds). The model
  never receives pixels. This is both faster and a hard reduction in exposure.
- **Layer 1 — deterministic DOM redaction (0 ms), implemented.** Before anything
  is serialized, `dom.EXTRACT_SCRIPT` masks:
  - password / OTP / CVV / card / API-key fields, by `type`, `autocomplete`, and
    field-name heuristics — the value is replaced with `[REDACTED]` and the field
    is flagged `SENSITIVE` so the model still knows *what* it is;
  - structured PII in page text and labels: Aadhaar, PAN, SSN, card numbers,
    JWTs, coordinates, emails → `[REDACTED_<TAG>]`;
  - a filled secret field's live value can never become its label (this was a
    real leak, now covered by `scripts/tests/test_redaction.py`).
  Every redaction is reported to the panel's privacy audit log as a semantic tag
  (`CREDENTIAL`, `ID_NUMBER`, `COORDINATES`) — never as a value.
- **Trust boundary between goal and page.** The system prompt is a fixed,
  byte-identical block; page text is delivered as clearly separated untrusted
  content, and the prompt explicitly forbids following instructions found in it
  (`server/agent/prompts.py`, rule 10).
- **Action validation on the client side.** The model may only reference element
  indices that the client actually observed; invented indices are rejected, and
  repeated failing actions are blocked after a threshold.
- **Approval gate, enforced server-side.** Risky actions pause the loop until
  the panel approves (`manual`), self-approve after a visible pause (`auto`), or
  run immediately (`skip`). A denial stops the task without touching the page.
- **Privacy surface in the UI.** A privacy audit log, privacy notice banner, and
  a stable redaction-tag vocabulary (`CREDENTIAL`, `ID_NUMBER`, `FACE`,
  `SIGNATURE`, `COORDINATES`) are wired to real server events.

### What is planned (not yet wired into the loop)

1. **Layer 2 — visual PII detection on WebGPU / Wasm:** a quantized detector
   (YOLO-nano / small ViT) for faces, signatures, QR codes, and rendered text
   that DOM inspection cannot see, over an in-memory `OffscreenCanvas`.
2. **Semantic masking of pixels:** blacken/blur pixels **before** any
   `fetch` / `WebSocket` dispatch, while preserving the semantic tag.
3. **A small VLM fallback** for canvas/WebGL UIs where DOM text is insufficient
   (see `docs/MODEL_RECOMMENDATIONS.md` §2).

### Guardrails to preserve when building those layers

- Redaction must complete strictly in memory before any network dispatch.
- Animated/ticker/toast content must not leak via single-frame snapshots —
  frame-diff or pause-and-capture.
- Over-masking blinds the reasoning model; keep semantic tags on redacted regions.
- Dispose GPU tensors after every inference cycle to avoid tab crashes.
- Separate user-goal instructions from parsed page text with system-level
  delimiters plus a client-side action validator (prompt-injection defence).

---

## 11. Choosing a model

Decode throughput is the single biggest lever on per-step latency. On the
reference A6000 (48 GB), `gemma-3-12b-it` in bf16 runs at **14.3 tok/s** — far
below what the hardware can do.

| Option | Command | Expected decode | Notes |
|---|---|---|---|
| **Qwen2.5-7B-Instruct AWQ** | `vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ --served-model-name gemma-3` | 60–90 tok/s | Best balance; reliable structured output |
| **Gemma-3-4B-IT** | `vllm serve google/gemma-3-4b-it --served-model-name gemma-3` | 50–80 tok/s | Keeps the current family |
| **Qwen2.5-14B-Instruct AWQ** | `vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ --served-model-name gemma-3` | 40–60 tok/s | Better reasoning, still ~3× faster |
| Gemma-3-12B bf16 | current | 14.3 tok/s | Baseline |

Also try, in order of impact:

1. **Check GPU clocks** — 14 tok/s suggests power-capping or host-memory
   weight reads. Inspect `nvidia-smi -q -d CLOCK,PERFORMANCE` during a request.
2. `--quantization awq`, or serve a pre-quantized checkpoint.
3. Leave CUDA graphs on — do **not** use `--enforce-eager`.
4. Keep prefix caching on (default): the system prompt is byte-identical across
   steps and is cached.

---

## 12. SIH scoring rubric — how this maps

| Criterion | Weight | Where it is addressed |
|---|---|---|
| Accuracy of visual context from screen | 25% | `server/agent/dom.py` — one in-page pass yields indexed elements + labels + bounds; the model acts on exact indices rather than guessed coordinates |
| Recall / precision for sensitive / PII detection | 20% | ✅ Layer 1 in `dom.py` (password/card/Aadhaar/PAN/SSN/JWT/coords/email + secret-field heuristics), verified by `scripts/tests/test_redaction.py`; 🚧 Layer 2 visual detector is the next milestone |
| Precision of redaction | 20% | Masking is value-level (`[REDACTED]` / `[REDACTED_<TAG>]`) while the element, its role and its bounds are preserved — the model keeps full interactive context and is never blinded |
| Client-side resource utilisation | 20% | Panel is a thin React UI; perception runs in one in-page pass; no per-step screenshot decode or client tensor allocation; redaction is regex-only (~0 ms) |
| End-to-end task latency | 15% | Action-only schema, guided JSON, kept-alive HTTP/CDP connections, prefix-cached prompt; measured in [§6](#6-measured-latency) |

---

## 13. Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot reach the browser on http://localhost:9222` | Launch Chrome/Brave with `--remote-debugging-port=9222` **and** a dedicated `--user-data-dir`; make sure no other Chrome instance is running |
| `Cannot reach vLLM` | Start the server, or open the SSH tunnel; verify with `curl http://127.0.0.1:8000/v1/models` |
| Panel replies "local standby" / offline | `/chat` could not reach vLLM — check `VLLM_BASE_URL` and the tunnel |
| Port `8002` already in use | `pnpm dev` and `pnpm start` are both running — use one |
| Agent repeats the same click | It is blocked after 3 repeats; the model is likely too small — see [§11](#11-choosing-a-model) |
| Steps feel slow | Measure decode speed: `python scripts/probes/probe_throughput.py` |
| Wrong element clicked | The page changed between read and act; element indices are per-step |
| Overlay boxes / cursor not visible | `python scripts/debug/check_overlay.py`; also check `AGENT_SHOW_OVERLAY` / `AGENT_SHOW_CURSOR` |
| `server/.env` changes have no effect | The receiver reads process env, not the file — export the variables or use `.env.example` as a reference |

---

## 14. Development notes

- **Type-checking:** `pnpm build` runs `tsc --noEmit` before bundling, so a type
  error fails the build.
- **Adding an action type:** update the enum in `server/agent/prompts.py`, the
  executor in `server/agent/session.py`, the label mapping in
  `extension/src/sidepanel/lib/actions.ts`, and the payload type in
  `extension/src/sidepanel/lib/agentWebSocket.ts`.
- **Architecture rules** live in `CLAUDE.md` — read it before changing the
  client/server partition, the redaction pipeline, or the action schema.
