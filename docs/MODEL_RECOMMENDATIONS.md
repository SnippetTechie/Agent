# Model Selection & Prompt Strategy for V.A.R.M.A

This document answers one question: **what LLM/VLM configuration should this
project run to score highest on the SIH26171 rubric?**

It is written against the measured behaviour of the code in `server/agent/`, not
against generic benchmarks. Every recommendation states its cost in the currency
that actually matters here: **output tokens per step** (decode time dominates).

---

## 1. The one number that decides everything

Per-step latency is almost entirely decode-bound:

```
step_latency ≈ output_tokens / decode_tokens_per_second + perceive + act
```

Measured on the reference A6000 with `gemma-3-12b-it` bf16: **14.3 tok/s**.
That is the anomaly to fix first — it is roughly 4–6× slower than the hardware
should deliver, which suggests power capping or host-memory weight reads.

| Model | Precision | Expected decode | Step time @ 21 out-tokens |
|---|---|---|---|
| `gemma-3-12b-it` (current) | bf16 | 14.3 tok/s | ~1.5 s (measured) |
| **`Qwen2.5-7B-Instruct-AWQ`** | AWQ 4-bit | 60–90 tok/s | ~0.3 s |
| `Qwen2.5-14B-Instruct-AWQ` | AWQ 4-bit | 40–60 tok/s | ~0.4 s |
| `gemma-3-4b-it` | bf16 | 50–80 tok/s | ~0.3 s |
| `Qwen2.5-3B-Instruct` | bf16 | 90–130 tok/s | ~0.2 s |

> **Recommendation:** `Qwen/Qwen2.5-7B-Instruct-AWQ`. It is the best accuracy
> per millisecond for UI-grounding work, and Qwen2.5's instruction-following on
> strict JSON is markedly more reliable than Gemma-3's at small sizes. Keep the
> `--served-model-name gemma-3` alias so nothing in the codebase has to change
> (`VLLM_MODEL` also works).

---

## 2. Should this be a VLM (vision model)?

**Not for the hot path. Yes for one specific fallback.**

The architecture is deliberately DOM-first: `dom.EXTRACT_SCRIPT` returns indexed
elements with labels and bounds in ~10–90 ms, and the model picks an index. A
screenshot-based VLM costs 300–1000 ms of capture/encode per step, plus far more
input tokens, and it *loses precision* — a VLM guesses coordinates, while this
pipeline hands the model a discrete index that the executor resolves back to a
live DOM node.

Keep the VLM for the case DOM text genuinely cannot describe:

| Use case | Recommended approach |
|---|---|
| Standard click/type/navigate | **DOM + text LLM** (current). Cheapest, most precise. |
| Canvas / WebGL apps, image-only buttons, CAPTCHA-adjacent UI | **Small VLM fallback**, opt-in per step. |
| On-device pixel PII (faces, signatures) | **Not an LLM.** Use a quantized detector (§4). |

For the VLM fallback, a 2–3B vision model is sufficient because the task is
localised ("what is at this box?"), not general reasoning:

| Model | Why |
|---|---|
| `Qwen2.5-VL-3B-Instruct` | Strong OCR + grounding per parameter; fits beside a 7B text model. |
| `moondream2` (1.8B) | Cheapest; good enough for "is there text/an icon here". |
| `SmolVLM2-2.2B` | Fastest to load; weak on dense UI text. |

**Do not** run a 30B+ MoE (`Gnani Evon v3.3-30B-A3B`) for this loop. A 3B-active
MoE still moves 30B of weights per token; per-step latency would regress badly
against the 15% rubric weight, and the extra reasoning depth does not help when
the schema is action-only.

---

## 3. Prompt/schema changes to make

The current prompt is well-tuned (action-only schema, no `thought` field, goal
last, byte-identical system block for prefix caching). Four changes are worth it:

### 3.1 Add `[SENSITIVE]` handling to the system prompt

`dom.py` now marks redacted fields with `SENSITIVE` and `[REDACTED]` values. The
model should be told what that means so it does not stall:

```
11. A field marked (SENSITIVE) or shown as value='[REDACTED]' is masked on the
    user's device. You may click and type into it normally - you simply cannot
    see its current contents. Never ask the user for the value.
```

Without this, a small model tends to either refuse or emit a `read` loop.

### 3.2 Tell the model the approval gate exists

In `manual`/`auto` mode the user sees the proposed action before it runs. The
model should therefore batch conservatively:

```
12. The user approves actions one step at a time. Propose exactly one
    state-changing action per step so approval stays meaningful.
```

### 3.3 Keep the schema action-only

Already correct. Adding a `thought` field costs ~15–25 output tokens — at
14 tok/s that is +1–2 s per step for a string the UI synthesises for free in
`prompts.describe_actions`. If you move to a 60+ tok/s model, a *short* `reason`
field becomes affordable; re-measure before adding it.

### 3.4 Cap and shrink the page text

`MAX_TEXT = 2500` chars is reasonable, but `format_state_for_prompt` sends it in
full. Input tokens are cheap under prefix caching *except* the page dump, which
changes every step. Consider truncating to ~1200 chars centred on the viewport
and relying on element labels — input prefill is not free once the prefix breaks.

---

## 4. Do you need a local model for the PII layer?

**No LLM. Use a small, purpose-built detector.** The rubric gives 20% to PII
recall/precision and 20% to client-side resource use — a generative model is the
wrong tool for both.

| Layer | Tool | Cost | Rationale |
|---|---|---|---|
| **L1 deterministic** | Regex + field heuristics (**implemented**) | ~0 ms | Catches passwords, cards, Aadhaar/PAN/SSN, JWTs, coordinates, emails. Zero false negatives on structured data, which is what the rubric rewards. |
| **L2 visual** | `YOLOv8n-face` / `blazeface` (ONNX, WebGPU) | 5–15 MB, ~10 ms | Faces, signatures, QR codes. These have no textual signature. |
| **L2 OCR** | `tesseract.js` or `PaddleOCR-mobile` | 3–10 MB | Rendered text in canvas/images that DOM inspection cannot see. |

Rules for L2 in the extension:

1. Run in an **offscreen document**, never the service worker (MV3 workers have
   no DOM/WebGPU canvas).
2. `OffscreenCanvas` only — redact in memory, then `transferToImageBitmap()`.
3. Dispose tensors every frame (`tf.tidy()` / explicit `dispose()`); the rubric
   penalises memory growth and tab crashes.
4. Emit **semantic tags**, not just black boxes (`[REDACTED_FACE]`,
   `[REDACTED_INPUT_FIELD: ID_102]`) so the reasoning model is not blinded.
5. Frame-diff or pause-and-capture for animated content — a single snapshot
   misses scrolling tickers and toasts.

---

## 5. Serving configuration

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct-AWQ \
  --served-model-name gemma-3 \
  --quantization awq \
  --max-model-len 32768 \
  --enable-prefix-caching \
  --max-num-seqs 4
```

- **Leave CUDA graphs on.** Do not pass `--enforce-eager`; it typically costs
  20–40% of decode throughput.
- **Prefix caching is essential.** The system prompt is byte-identical across
  steps, so it is prefilled once per task.
- **`--max-num-seqs 4`** keeps a single demo client's latency stable; a large
  batch window trades latency for throughput you do not need.
- **Check clocks first.** 14.3 tok/s on an A6000 for a 12B bf16 model indicates
  a hardware/config problem, not a model problem. Run
  `nvidia-smi -q -d CLOCK,PERFORMANCE` during a request.

Verify with the included probe:

```bash
python scripts/probes/probe_throughput.py    # raw decode tok/s
python scripts/probes/probe_llm.py           # one-call latency + JSON validity
python scripts/probes/probe_schema.py        # schema-cost comparison
```

---

## 6. Fallback if there is no GPU on demo day

| Option | Setting |
|---|---|
| Remote OpenAI-compatible endpoint | `VLLM_BASE_URL=https://... VLLM_MODEL=<name>` |
| Ollama locally | `VLLM_BASE_URL=http://127.0.0.1:11434/v1 VLLM_MODEL=qwen2.5:7b` |
| llama.cpp server | `VLLM_BASE_URL=http://127.0.0.1:8080/v1` |

The panel degrades cleanly: `/chat` reports `offline` and `/ws/agent` sends an
`ERROR` naming the unreachable endpoint. `guided JSON` support varies by server —
if `response_format: json_schema` is unsupported, `llm._parse_json` already
tolerates fences and trailing prose, so the loop still functions.

---

## 7. Summary of recommended changes

| # | Change | Expected effect |
|---|---|---|
| 1 | Switch to `Qwen2.5-7B-Instruct-AWQ` | 4–6× faster decode; step time ~0.3 s |
| 2 | Fix GPU clocks / enable AWQ | Recovers the missing throughput |
| 3 | Add `SENSITIVE` + approval rules to the system prompt | Fewer stalls on masked fields |
| 4 | Keep the schema action-only; no `thought` | Saves 1–2 s/step at current decode speed |
| 5 | Add ONNX face/signature detector in an offscreen document | Directly targets the 20% PII + 20% resource criteria |
| 6 | Truncate page text to ~1200 chars | Lower prefill cost on the volatile block |
| 7 | Keep DOM-first perception; VLM only as opt-in fallback | Preserves the accuracy and latency advantages |
