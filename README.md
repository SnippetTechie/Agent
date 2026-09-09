# V.A.R.M.A — Browser Agent

A Chrome side-panel extension that talks to a local **vLLM** model and drives the
browser you already have open. Type a question and it answers; type a task and it
performs it on the real, visible tab.

Built for **SIH26171** (ISRO — on-device perception for light-weight browser agents).

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Chrome Side Panel (React)                                │
│  chat  → POST /chat                                      │
│  task  → WS /ws/agent  (step events stream back)         │
└───────────────┬──────────────────────────────▲───────────┘
                │                              │ PAGE_STATE / ACTION / STEP_COMPLETE
                ▼                              │
┌──────────────────────────────────────────────┴───────────┐
│ FastAPI receiver  :8002                                  │
│  server/agent/  — the agent loop                         │
│    observe  → one in-page DOM pass (elements + text)     │
│    think    → one vLLM structured-output call            │
│    act      → CDP: click / type / navigate / scroll      │
└───────┬──────────────────────────────┬───────────────────┘
        ▼                              ▼
┌──────────────────┐        ┌──────────────────────────────┐
│ Chrome via CDP   │        │ vLLM  :8000                  │
│ :9222            │        │ OpenAI-compatible API        │
│ (your real tab)  │        │ guided JSON decoding         │
└──────────────────┘        └──────────────────────────────┘
```

**No screenshots are sent to the model.** Each step reads the DOM in one
in-page pass (~10–90 ms), which is both faster and cheaper than a screenshot
round-trip, and gives the model exact element indices to act on.

### Why not browser-use?

The original prototype used browser-use. It was replaced because:

| Issue | Effect |
|---|---|
| Always captures a screenshot per step, even with vision off | ~300–1000 ms wasted per step |
| Default output schema includes planning + thinking fields | 42 output tokens instead of 21 |
| Rebuilds the browser session per run | hundreds of ms of reconnection |

The measured difference on the reference server: **3.16 s → 1.57 s per step**.

---

## 2. Prerequisites

- **Node.js 18+** and **pnpm**
- **Python 3.11+**
- **Chrome or Brave**, running with a debugging port
- **A vLLM server** exposing an OpenAI-compatible API

```bash
pnpm install
pip install -r server/requirements.txt
python -m playwright install chromium
```

---

## 3. Quick start

### Step 1 — Start the browser with CDP

The agent attaches to a browser you launch; it does not start its own.

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\ChromeDevProfile"

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-dev"

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="/tmp/chrome-dev"
```

> Use a dedicated `--user-data-dir`. Chrome refuses the debugging port on the
> default profile.

### Step 2 — Start the model

On the GPU box:

```bash
vllm serve ./models/gemma-3-12b-it \
  --served-model-name gemma-3 \
  --trust-remote-code \
  --dtype bfloat16 \
  --max-model-len 32768
```

If the GPU box is remote, tunnel it on the machine running the extension:

```bash
ssh -L 8000:localhost:8000 user@gpu-host
```

### Step 3 — Start the receiver

```bash
python scripts/start_server.py     # or: python server/receiver.py
```

### Step 4 — Build and load the extension

```bash
pnpm --filter extension build
```

Then in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** →
select `extension/dist` → click the V.A.R.M.A icon to open the side panel.

---

## 4. Usage

| You type | Mode | What happens |
|---|---|---|
| "hello", "how are you" | chat | Plain conversational reply, no browser access |
| "Search for ISRO on Google" | task | The agent drives your tab and reports back |
| "Open wikipedia.org and search for ISRO" | task | Multi-step navigation + typing |

The side panel shows, per step: how many elements the agent could see, how long
perception took, and exactly which action it executed.

**Approval gate** (dock menu): `skip` (default, fastest) · `auto` · `manual`.

---

## 5. Measured latency

Reference server: single A6000, Gemma-3-12B bf16, vLLM 0.24, ~14.3 tok/s decode.

| Stage | Time |
|---|---|
| Perceive (DOM extract + overlay) | **10–90 ms** |
| Think (vLLM, ~21 output tokens) | **1.5–3.0 s** |
| Act (click/type/navigate) | **0.4–1.0 s** |
| **Per step** | **≈ 2.2–4.0 s** |

Decode speed dominates: a step costs roughly `output_tokens / 14.3` seconds.
The schema is therefore action-only — no `thought`, no plan, no evaluation — and
the UI label is synthesised locally for free.

**To reach 1–2 s per step, make the model faster** (see §7).

---

## 6. Project structure

```
extension/src/
  background/index.ts              opens the side panel
  sidepanel/
    SidePanel.tsx                  layout
    hooks/useAgentSession.ts       ⭐ run loop (chat + task)
    lib/agentWebSocket.ts          ⭐ WS client for /ws/agent
    lib/actions.ts                 action → UI label
    lib/intent.ts                  chat vs task routing
    lib/capture.ts                 screenshot preview (not sent to the model)
    lib/i18n/                      UI translations

server/
  receiver.py                      ⭐ FastAPI: /chat, /health, /ws/agent
  agent/
    loop.py                        ⭐ observe → think → act
    session.py                     CDP connection + action execution
    dom.py                         in-page element extraction + overlay
    prompts.py                     system prompt + JSON schema
    llm.py                         vLLM client (guided JSON)

scripts/
  start_server.py                  start the receiver
  probe_llm.py                     one-call latency probe
  probe_latency.py                 prompt/output size sweep
  probe_throughput.py              raw decode tok/s
  probe_schema.py                  schema cost comparison
  test_agent.py                    end-to-end agent test
demo.py                            run a task from the terminal
```

---

## 7. Choosing a model

Decode throughput is the single biggest lever on per-step latency. On the
reference A6000 (48 GB), `gemma-3-12b-it` in bf16 runs at **14.3 tok/s**, which
is far below what the hardware can do — the weights are unquantized and the
model is large for the task.

Recommended, in order:

| Option | Command | Expected decode | Notes |
|---|---|---|---|
| **Qwen2.5-7B-Instruct AWQ** | `vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ --served-model-name gemma-3` | 60–90 tok/s | Best balance; strong structured-output reliability |
| **Gemma-3-4B-IT** | `vllm serve google/gemma-3-4b-it --served-model-name gemma-3` | 50–80 tok/s | Keeps the current family |
| **Qwen2.5-14B-Instruct AWQ** | `vllm serve Qwen/Qwen2.5-14B-Instruct-AWQ --served-model-name gemma-3` | 40–60 tok/s | Better reasoning, still ~3× faster than now |
| Gemma-3-12B bf16 | current | 14.3 tok/s | Baseline |

Also try, in order of impact:

1. **Check GPU clocks** — 14 tok/s suggests the GPU is power-capped or the
   weights are being re-read from host memory. `nvidia-smi -q -d CLOCK,PERFORMANCE`
   during a request. A healthy A6000 with AWQ 7B should exceed 60 tok/s.
2. `--quantization awq` (or serve a pre-quantized checkpoint).
3. `--enforce-eager` is **not** recommended — leave CUDA graphs on.
4. Keep `--enable-prefix-caching` on (it is by default in recent vLLM). The
   agent's system prompt is byte-identical across steps, so it is cached.

The server tells you which model it is using: `curl http://127.0.0.1:8000/v1/models`.

---

## 8. Configuration

| Variable | Default | Description |
|---|---|---|
| `RECEIVER_HOST` | `127.0.0.1` | Receiver bind address |
| `RECEIVER_PORT` | `8002` | Receiver port |
| `VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | vLLM endpoint |
| `VLLM_MODEL` | `gemma-3` | Served model name |
| `VLLM_MAX_TOKENS` | `512` | Max output tokens per step |
| `CDP_URL` | `http://localhost:9222` | Browser debugging endpoint |
| `AGENT_MAX_STEPS` | `15` | Step cap per task |
| `AGENT_MAX_ACTIONS_PER_STEP` | `3` | Actions the model may emit |
| `AGENT_SHOW_OVERLAY` | `1` | Draw numbered boxes on the page |
| `AGENT_SHOW_CURSOR` | `1` | Animate a cursor on actions |

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `Cannot reach the browser on ...9222` | Launch Chrome/Brave with `--remote-debugging-port=9222` and a dedicated `--user-data-dir` |
| `Cannot reach vLLM` | Start the server, or open the SSH tunnel |
| Agent repeats the same click | It is already blocked after 3 repeats; the model is too small — see §7 |
| Steps feel slow | Check decode tok/s with `python scripts/probe_throughput.py` |
| Wrong element clicked | The page changed between read and act; indexes are per-step |
