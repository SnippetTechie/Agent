# Recovered API surface of deleted `server/agent/*` modules

Reconstructed from surviving `.pyc` bytecode (sources deleted by `git clean -fd`).


## `server/agent/actions.py`

```
Action registry: risk classes, normalization and prompt rendering.

One place decides what an action *is*, whether it is risky, and how it is
described to the model and to the user. The transport (extension or CDP) only
executes; it never re-classifies.

Adding a capability means adding one entry here plus one branch in each
transport executor. Nothing else in the loop changes.
```

**Public names**

- `<genexpr>(.0)` — risk
- `normalize(action)` — Coerce a model-produced action into the canonical shape.
    - `.as_int(value)`
    - `.as_float(value)`
    - `.as_bool(value, default)`
- `validate(action)` — Return a human-readable reason the action is unusable, or None.
- `is_risky(action)`
- `needs_approval(actions)`
    - `.<genexpr>(.0)`
- `describe(action)` — Short human label. Never echoes typed text (it may be PII).
- `describe_all(actions)`
    - `.<genexpr>(.0)`
- `redact_for_ui(action)` — Strip typed text before an action is echoed to the panel or audit log.
- `_text_key(action)` — Comparable identity for typed text that never stores the text itself.
- `_signature_body(kind, action)` — The one place that decides what makes two actions "the same".
- `signature(action)` — Signature of an executed action, for no-progress loop detection.
- `describe_signature(sig)` — Turn a loop-detection signature back into something a model can read.
- `proposed_signature(action)` — Signature of a not-yet-executed action.


## `server/agent/bridge.py`

```
Extension bridge: the server's control channel to the user's real browser.

V.A.R.M.A never asks for a debugging port. The extension opens one WebSocket to
``/ws/tab``, and every page read and every action travels over it:

    agent loop  --call(op)-->  TabBridge  --ws-->  extension service worker
                                                     |  chrome.tabs.sendMessage
                                                     v
                                             content script (page)

Two independent connections are involved and must not be confused:

* **bridge socket** (this module) - one per connected browser profile. The
  extension opens it on startup and keeps it open with keepalives. When it is
  absent, no tab is reachable and the agent must fail fast with a message that
  tells the user to open the side panel.
* **agent socket** (``/ws/agent`` in ``receiver.py``) - one per task, created by
  the side panel. It carries step events and approval decisions.

Request/response is multiplexed over the single bridge socket with an id per
call, so several operations can be in flight without a second channel.
```

**Public names**

- `ExtensionUnavailable()` — ExtensionUnavailable
- `BridgeTimeout()` — BridgeTimeout
- `TabGone()` — TabGone
- `_Pending()` — _Pending
- `TabBridge()` — TabBridge
    - `.connected(self)`
    - `.attach(self, websocket)`
    - `.detach(self, websocket)`
    - `.status(self)`
    - `.handle_message(self, raw)`
    - `._send(self, payload)`
    - `.call(self, op, params, timeout)`
    - `._fail_all(self, reason)`


## `server/agent/criteria.py`

```
The done-criterion: what "finished" actually means for this run.

A browser agent that decides for itself when it is finished fails in two
directions at once:

* **it stops too early** - the first page that merely *looks* related is
  declared the answer, which is the classic small-model failure on a search or
  a multi-hop task;
* **it stops too late** - it keeps verifying, re-opening and re-reading, and
  burns the step budget on a task that was already done.

Both are the same missing thing: no explicit, checkable statement of what
success looks like. This module derives that statement from the task *before*
the run starts, checks it against every observation, and hands the result to the
loop as a veto - the model may only call ``done`` once the criterion is
satisfied or it has explicitly reported a dead end.

The check is deliberately cheap: substring and regex matching over text the page
already produced, run in the server process. It costs no model tokens and no
extra round trip, so it is affordable on *every* step.
```

**Public names**

- `DoneCriterion()` — DoneCriterion
    - `.as_dict(self)`
- `CriterionCheck()` — CriterionCheck
    - `.as_dict(self)`
- `_host(url)`
- `_phrases(task)` — Search anchors a results page is likely to contain.
    - `.<listcomp>(.0)`
    - `.<listcomp>(.0)`
    - `.<listcomp>(.0)`
- `build_criterion(task, start_url)` — Derive a checkable success condition from the task text.
    - `.<genexpr>(.0)`
- `_body_text(state)` — Text the page *renders*: title, page text, headings, control labels.
    - `.<genexpr>(.0)`
- `_form_text(state)` — Text the user (or the agent) put *into* controls.
- `check_criterion(criterion, state, changed, actions_since_start)` — Evaluate the criterion against the current page observation.
    - `.<listcomp>(.0)`
    - `.<listcomp>(.0)`
    - `.<genexpr>(.0)`
    - `.<genexpr>(.0)`
    - `.<listcomp>(.0)`


## `server/agent/game.py`

```
Game-mode loop: precision mouse control over a screenshot.

Why a second loop
-----------------
AgentLoop (loop.py) reasons over a DOM element list and picks an index. That is
exact, cheap and the right tool for browsing - but a chess board, a Sudoku grid
or a canvas game exposes no useful DOM nodes, so there is nothing to pick.

This loop swaps perception for pixels and the action space for a pointer:

    observe  - one screenshot of the viewport (CSS pixels, never device pixels)
    think    - one grounded action from the vision model, in 0-1000 coordinates
    act      - a real mouse click/drag/type via CDP at the mapped pixel

It keeps loop.py's shape deliberately: same event vocabulary, same approval
gate, same step budget, same stop handling. The extension therefore renders a
game run with no special casing beyond the mode badge.

Termination
-----------
The brief for game mode is "one prompt, then it plays until the game ends". Two
mechanisms enforce that, and both are load-bearing:

  * the model calls done, either because it won/lost/the puzzle is solved, or
    because it judged the goal met. This is the normal exit.
  * stall detection. A grounding model that cannot find its next move will
    happily re-emit the same coordinate forever. After stall_threshold identical
    consecutive placements the run is closed out as "no further progress"
    instead of burning the whole step budget.

Without the second mechanism a finished game would sit there clicking the same
square until max_steps ran out, which reads as a hang rather than an ending.

Every step carries a screenshot to the model, so this path is far more expensive
per step than the DOM loop (~1.1s of prefill and decode on the reference A6000).
That is the accepted cost of a mode that can drive things the DOM cannot
describe.
```

**Public names**

- `GameRunConfig()` — GameRunConfig
- `GameStepRecord()` — GameStepRecord
    - `.total_ms(self)`
- `GameLoop()` — GameLoop
    - `.__init__(self, session, llm, on_event)`
    - `.stop(self)`
    - `.approve(self)`
    - `.deny(self)`
    - `._resolve_approval(self, approved)`
    - `.stopped(self)`
    - `.denied(self)`
    - `.metrics(self)`
    - `.run(self, config)`
    - `._capture(self, config)`
    - `._ask_model(self, frame, user_prompt, config)`
    - `._await_approval(self, step, action, config)`
    - `._execute(self, point)`
    - `._stall_warning(self, recent, config)`
    - `._emit(self, event)`
- `_placement_key(point)` — Signature of a grounded placement, used for stall detection.
- `_describe_result(result)`
- `_render_history(history, window)`
- `_render_page_context(context)`
- `_finish_text(config, success, page_context)`


## `server/agent/grounding.py`

```
Grounding-model adapter: turn a GUI-grounding VLM's output into a coordinate.

Why this module exists
----------------------
`GroundNext-7B-V0` (and UI-TARS-style models) do not emit our action schema. They
emit a tool call:

    <tool_call>{"name": "computer_use", "arguments":
        {"action": "left_click", "coordinate": [742, 386]}}</tool_call>

The reasoning model (`gemma4`) emits our strict JSON action object. Those are two
different contracts, and the agent loop must not care which one it is holding.

This module is the single place that knows the grounding dialect. It:

  * extracts the tool call even when the model wraps it in prose,
  * normalises the action name into our vocabulary,
  * bounds-checks the coordinate against the real screenshot size,
  * returns a typed result rather than raising into the loop, so a bad grounding
    response degrades into a visible failure instead of a crashed step.

Coordinate contract
-------------------
GroundNext is documented as returning coordinates already scaled to the screen
dimensions it was told about via the system prompt. We therefore treat incoming
coordinates as absolute pixels in that screen space and validate them against the
same width/height. If a future model returns 0-1000 normalised values instead,
that model belongs behind a separate normaliser — silently auto-detecting units
is how clicks land in the wrong place.

Action space
------------
GroundNext's documented action space is mouse click only. We accept the click
family and the two drag-ish variants some grounding models emit, and reject
everything else explicitly rather than guessing.
```

**Public names**

- `GroundingResult()` — GroundingResult
    - `.as_dict(self)`
- `_extract_json_blob(raw)` — Pull the tool-call object out of the model's output.
- `_unwrap_arguments(blob)` — Accept both the wrapped and the already-flat tool-call shapes.
- `_coerce_point(value, width, height)` — Validate one coordinate pair against the screen it was grounded on.
- `parse_grounding_response(raw, width, height)` — Normalise a grounding model's output into a validated action record.
    - `.<genexpr>(.0)`
- `build_grounding_prompt(target, width, height)` — Build the grounding instruction, with the real screen size stated.


## `server/agent/journal.py`

```
Structured run journal.

One place records everything that happens during an agent run so a demo can be
explained after the fact: the exact prompt sent to the model at each step, the
actions it chose, what actually executed, how long each phase took, which
guards fired, whether vision was used, and the final answer.

Design notes
------------
* **Append-only and non-blocking.** ``record`` only mutates in-memory state and
  appends one JSON line. A journal failure must never break a run, so every
  write is guarded.
* **Two artefacts per run.** ``logs/runs/<stamp>-<id>.jsonl`` is the machine
  record (one event per line, then a summary line). ``logs/runs/<stamp>-<id>.md``
  is a human transcript for the demo walkthrough.
* **Never a new source of leakage.** Action payloads arrive already redacted by
  ``actions.redact_for_ui`` and page text arrives already scrubbed by the
  perception kernel. The journal does not add its own copies of secrets.
```

**Public names**

- `_ms(value)`
- `StepStats()` — StepStats
- `RunJournal()` — RunJournal
    - `.__init__(self, task, run_id, model, provider, browser, log_dir, persist, max_events)`
    - `.elapsed_ms(self)`
    - `._step(self, step)`
    - `.record(self, event)`
    - `._record(self, event)`
    - `._count_vision(self, step, stats)`
    - `.note_nudge(self, step, nudge)`
    - `.note_blocked(self, step, reasons)`
    - `.note_stall(self, step, reason)`
    - `._append(self, entry)`
    - `.summary(self)`
    - `.close(self)`
    - `._write_markdown(self, summary)`
- `RunRegistry()` — RunRegistry
    - `.__init__(self, limit)`
    - `.add(self, journal)`
    - `.summaries(self)`
    - `.get(self, run_id)`


## `server/agent/memory.py`

```
Persistent task memory: what the agent knows about this task and this site.

A browser agent that keeps everything in the conversation transcript has three
problems:

* the transcript is truncated to fit the context window, so early findings (the
  fact it was asked to collect, the query it typed, the page that had the data)
  are the first thing to be lost - exactly when they matter most;
* a new task starts from zero, so the agent re-navigates to a site it already
  knows and repeats an approach that already failed;
* nothing outside the run can say what happened - there is no artifact to audit
  or to resume from.

This module is that missing layer. It is a small, bounded, JSON-backed record of
the *current* task (goal, criterion, progress, what was tried, what was learned)
plus a short list of recent finished tasks, and it renders into one compact block
that goes into every step prompt. It is deliberately not a vector store or a
scraped page archive: it stores conclusions, not pages, and it is capped so a
long session cannot grow it without bound.

Everything here is on-device state owned by the server process; nothing is sent
anywhere, and no field is ever populated from a redacted value.
```

**Public names**

- `_now()`
- `_host(url)`
- `Attempt()` — Attempt
    - `.as_dict(self)`
    - `.render(self)`
- `TaskRecord()` — TaskRecord
    - `.touch(self)`
    - `.note(self, text)`
    - `.fact(self, key, value)`
    - `.saw_site(self, url)`
    - `.tried(self, step, action, ok, detail)`
    - `.finish(self, status, result, error)`
    - `.as_dict(self)`
    - `.from_dict(cls, raw)`
    - `.running(self)`
    - `.render(self, detailed)`
- `TaskMemory()` — TaskMemory
    - `.__init__(self, path, enabled, max_records)`
    - `._load(self)`
    - `.save(self)`
    - `.start(self, task, criterion)`
    - `.finish(self, status, result, error, step)`
    - `.recent(self, limit, exclude)`
    - `.prompt_block(self, record, recent)`
    - `.as_dict(self, recent)`
    - `.forget(self, task_id)`


## `server/agent/perception.py`

```
Server-side view of the shared perception kernel.

The browser-side script lives in shared/perception.js and is the single source
of truth: the extension injects it verbatim, and the CDP fallback path evaluates
the same bytes here. Nothing about perception is duplicated.

Only the *visual debug layer* (numbered boxes + cursor) is defined here,
because it is server-driven decoration rather than page understanding, and the
extension has no use for it.
```

**Public names**

- `perception_source()` — The perception kernel as plain (non-module) JavaScript.
- `perceive_script()` — JS function (opts) => state, for page.evaluate().
- `format_script()` — JS function (args) => string rendering a state for the prompt.


## `server/agent/provider.py`

```
Browser providers: one interface, two transports.

The agent loop must not care whether the user's browser is a normal window with
the extension installed or a Chromium instance exposed on a CDP port. Both look
like this:

    state, tabs = await provider.observe()
    result      = await provider.execute(action, last_observation=state)
    tabs        = await provider.tabs()

  * ExtensionProvider - the default. The extension IS the actuator: it perceives
    and executes inside the user's real tab with chrome.scripting and
    chrome.debugger. No launch flags, no separate profile, works in any
    Chromium browser and (without native input) in Firefox.
  * CDPProvider - the fallback used by headless/CI runs and by demo.py.
    Requires the browser to have been started with --remote-debugging-port.

The loop is written against this interface only.
```

**Public names**

- `ProviderError()` — ProviderError
- `BrowserProvider()` — BrowserProvider
    - `.observe(self, redact, skip_text, tab_id)`
    - `.execute(self, action, last_observation, tab_id)`
    - `.tabs(self)`
    - `.activate(self, tab_id)`
    - `.capture(self, tab_id)`
    - `.apply_visuals(self, overlay, cursor, redact)`
    - `.aclose(self)`
- `ExtensionProvider()` — ExtensionProvider
    - `.__init__(self, call, browser, timeout)`
    - `._request(self, kind, payload)`
    - `.observe(self, redact, skip_text, tab_id)`
    - `.execute(self, action, last_observation, tab_id)`
    - `.tabs(self)`
    - `.activate(self, tab_id)`
    - `.capture(self, tab_id)`
    - `.apply_visuals(self, overlay, cursor, redact)`
    - `.aclose(self)`
- `CDPProvider()` — CDPProvider
    - `.__init__(self, session, browser)`
    - `.last_observe_ms(self)`
    - `.last_action_ms(self)`
    - `.observe(self, redact, skip_text, tab_id)`
    - `.execute(self, action, last_observation, tab_id)`
    - `.tabs(self)`
    - `.activate(self, tab_id)`
    - `.capture(self, tab_id)`
    - `.apply_visuals(self, overlay, cursor, redact)`
    - `.aclose(self)`


## `server/agent/state.py`

```
Progress tracking, planning and done-verification.

The failure modes this module exists to kill, all of which show up the moment a
browser agent meets a real site:

  * **No-op loops** - clicking the same button while the page never changes.
  * **Oscillation** - A -> B -> A -> B, each step looking locally sensible.
  * **Popup blindness** - a cookie banner or modal swallows every click, so the
    agent keeps "clicking the right element" and nothing happens.
  * **Premature done** - the model announces success because the page *looks*
    finished, without ever reading the result.
  * **Context amnesia** - after 8 steps the model has forgotten the goal, or
    has forgotten that it already extracted the answer.

The ledger is deterministic and cheap: no model call is spent on any of it.
It produces (a) hard blocks on repeated actions, (b) a short nudge appended to
the next prompt, and (c) a verified/unverified decision for done.
```

**Public names**

- `_is_perception_only(signature)`
- `StepOutcome()` — StepOutcome
- `PlanTracker()` — PlanTracker
    - `.set(self, goal, steps)`
    - `.mark(self, step_id, status)`
    - `.next_pending(self)`
    - `.render(self)`
    - `.event(self, step)`
- `ProgressLedger()` — ProgressLedger
    - `.observe(self, state)`
    - `.record(self, step, action, changed_page, note)`
    - `.note_done_claim(self)`
    - `.counts(self)`
    - `.failures(self, signature)`
    - `.is_blocked(self, proposed)`
    - `.stuck_on_page(self)`
    - `.stalled(self, max_no_change, max_done_rejections)`
    - `.oscillating(self)`
    - `.no_change_streak(self)`
    - `.no_progress_streak(self)`
    - `.nudge(self)`
    - `.summary_lines(self, limit)`
    - `.evidence(self, limit)`
    - `.metrics(self)`
- `DoneVerdict()` — DoneVerdict
- `verify_done(claimed, state, ledger, plan, task, step, min_steps)` — Decide whether a done claim may end the run.
    - `.<listcomp>(.0)`
    - `.<genexpr>(.0)`
    - `.<genexpr>(.0)`
- `is_goal_satisfied_hint(task, state)` — Cheap heuristic used only to phrase the reminder, never to end a run.


## `server/agent/vision.py`

```
Visual grounding: turn a screenshot plus a text target into a click point.

Why this module exists
----------------------
The DOM loop in loop.py picks an *index* from a list of real DOM nodes, which is
exact and cheap. It cannot drive anything that is not in the DOM: chess boards,
Sudoku grids, canvases, WebGL, PDFs, custom widgets.

Game mode therefore runs a different contract: the model is shown a screenshot
and answers with a point. That point is worthless unless the coordinate space is
pinned down on both sides of the call, so this module owns that contract
explicitly rather than leaving it implicit in a prompt string.

The measured coordinate contract
--------------------------------
Probed live against the model actually serving on the GPU box (gemma4-12b, the
encoder-free gemma4_unified architecture) on synthetic 3x3 colour grids:

    image 600x400   mean error  2.1 px   (max  3.4)
    image 800x600   mean error  4.2 px   (max 10.6)
    image 1000x700  mean error 10.9 px   (max 22.3)

That model emits a 0-1000 normalised square: x is scaled by the image WIDTH and
y by the image HEIGHT, independently. The same model also answers the
UI-TARS-style {"action": ..., "coordinate": [x, y]} convention, which
grounding.py already parses; parse_grounding_json below is the structured form
the prompt actually asks for, and grounding.py stays as the fallback adapter.

Error grows with image size, so the caller screenshots at CSS scale, never at
device scale: a 2x device-pixel-ratio capture doubles the coordinate error.

Keeping this honest
-------------------
A grounding call that cannot be validated is worse than no call at all - a wrong
click in a game is indistinguishable from a right one. Every failure mode
(unparseable output, target reported absent, coordinate outside the frame)
returns ok=False with a reason, and the executor refuses to click.
```

**Public names**

- `GroundedPoint()` — GroundedPoint
    - `.as_dict(self)`
- `normalise_action(raw)`
- `image_size(data)` — Read (width, height) straight out of the encoded image header.
- `detect_media_type(data)`
- `encode_data_uri(data, media_type)`
- `build_grounding_user_prompt(task, step, max_steps, page_context, history, warning)` — Assemble the volatile user block for one grounding step.
- `describe_grounded(point)` — Human-readable label for the UI, synthesised without spending tokens.
- `_extract_object(raw)`
- `_to_pixels(value, extent)` — Map one normalised coordinate onto a pixel axis.
- `parse_grounding_json(raw, width, height)` — Validate a grounding reply against the frame it was grounded on.
    - `.<genexpr>(.0)`
