import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentTurn,
  ApprovalMode,
  AuditLogEntry,
  BrowserUseAction,
  ContextMode,
  RedactionTag,
  SuggestionIntent,
  TabContext,
  TabScope,
} from "../types.js";
import {
  buildApprovalRequest,
  buildInitialSteps,
  buildSummary,
  nextId,
} from "../lib/mockAgent.js";
import { getActiveTabContext, watchActiveTabContext } from "../lib/activeTab.js";
import { sendChatMessage, captureRedactedScreenshot, type ChatMessage } from "../lib/capture.js";
import { describeAction } from "../lib/actions.js";
import { resolveTurnMode } from "../lib/intent.js";
import { loadState, saveState, clearState } from "../lib/storage.js";
import { soundEngine } from "../lib/sound.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import {
  AgentConnection,
  type WsStepStart,
  type WsPageState,
  type WsScreenshot,
  type WsDescription,
  type WsAction,
  type WsStepComplete,
  type WsApprovalRequired,
  type WsRedactions,
  type WsStalled,
  type WsDoneRejected,
  type WsDoneVerified,
  type WsFinalResult,
  type WsError,
  type WsStopped,
  type BrowserUseActionPayload,
} from "../lib/agentWebSocket.js";

const STORAGE_KEY = "varma.session.v1";
/** Keep the persisted feed bounded — this is a UI transcript, not an archive. */
const MAX_PERSISTED_TURNS = 40;
const MAX_AUDIT_ENTRIES = 200;
/** Chat turns replayed as context to /chat. */
const CHAT_HISTORY_TURNS = 6;

interface PersistedState {
  turns: AgentTurn[];
  auditLog: AuditLogEntry[];
}

/** The agent's own redaction tag vocabulary, used to coerce server strings. */
const REDACTION_TAGS: readonly RedactionTag[] = [
  "CREDENTIAL",
  "COORDINATES",
  "FACE",
  "ID_NUMBER",
  "SIGNATURE",
];

function asRedactionTag(value: string): RedactionTag {
  const upper = String(value || "").toUpperCase() as RedactionTag;
  return REDACTION_TAGS.includes(upper) ? upper : "CREDENTIAL";
}

export interface VisualSettingsInput {
  showOverlay: boolean;
  showCursor: boolean;
  autoRedact: boolean;
}

import type { AuthUser } from "./useAuthUser.js";

export function useAgentSession(
  approvalMode: ApprovalMode,
  persistEnabled: boolean,
  visuals: VisualSettingsInput = {
    showOverlay: true,
    showCursor: true,
    autoRedact: true,
  },
  tabScope: TabScope = "single",
  user?: AuthUser | null
) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [tabContext, setTabContext] = useState<TabContext>({ domain: null, isSecure: false });
  const [hydrated, setHydrated] = useState(false);

  const agentConnRef = useRef<AgentConnection | null>(null);
  const approvalResolvers = useRef<Map<string, (approved: boolean) => void | Promise<void>>>(new Map());
  /** Timers that auto-resolve an "auto" approval; cleared on unmount. */
  const approvalTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const userRef = useRef(user);
  userRef.current = user;

  // Keep the latest visual settings reachable from the run loop without
  // re-creating its callbacks on every toggle.
  const visualsRef = useRef(visuals);
  visualsRef.current = visuals;

  // Keep the current approval mode reachable from a run already in flight, so
  // changing the menu mid-task affects the next gate rather than being ignored.
  const approvalModeRef = useRef(approvalMode);
  approvalModeRef.current = approvalMode;

  const tabScopeRef = useRef(tabScope);
  tabScopeRef.current = tabScope;

  const clearApprovalTimers = useCallback(() => {
    for (const timer of approvalTimers.current) clearTimeout(timer);
    approvalTimers.current.clear();
  }, []);

  // Push live changes to a run that is already in flight.
  useEffect(() => {
    agentConnRef.current?.setVisuals({
      overlay: visuals.showOverlay,
      cursor: visuals.showCursor,
      redact: visuals.autoRedact,
    });
  }, [visuals.showOverlay, visuals.showCursor, visuals.autoRedact]);

  useEffect(() => () => clearApprovalTimers(), [clearApprovalTimers]);

  // ─── Hydration & Tab Context ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    if (persistEnabled) {
      loadState<PersistedState>(STORAGE_KEY).then((saved) => {
        if (cancelled) return;
        if (saved) {
          setTurns(saved.turns ?? []);
          setAuditLog(saved.auditLog ?? []);
        }
        setHydrated(true);
      });
    } else {
      setHydrated(true);
    }
    getActiveTabContext().then((ctx) => {
      if (!cancelled) setTabContext(ctx);
    });
    const unwatch = watchActiveTabContext(setTabContext);
    return () => {
      cancelled = true;
      unwatch();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on a short debounce: a running task fires many state updates per
  // step, and writing to chrome.storage on each one is pure overhead.
  useEffect(() => {
    if (!hydrated || !persistEnabled) return;
    const timer = setTimeout(() => {
      void saveState<PersistedState>(STORAGE_KEY, {
        turns: turns.slice(-MAX_PERSISTED_TURNS),
        auditLog: auditLog.slice(0, MAX_AUDIT_ENTRIES),
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [turns, auditLog, hydrated, persistEnabled]);

  // ─── State Helpers ───────────────────────────────────────────────────────

  const updateTurn = useCallback(
    (turnId: string, patch: Partial<AgentTurn> | ((t: AgentTurn) => AgentTurn)) => {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === turnId
            ? typeof patch === "function"
              ? patch(turn)
              : { ...turn, ...patch }
            : turn
        )
      );
    },
    []
  );

  const updateStep = useCallback(
    (turnId: string, stepId: string, patch: Partial<AgentTurn["steps"][number]>) => {
      updateTurn(turnId, (turn) => ({
        ...turn,
        steps: turn.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
      }));
    },
    [updateTurn]
  );

  const appendAudit = useCallback((entries: AuditLogEntry[]) => {
    if (entries.length === 0) return;
    setAuditLog((prev) => [...entries, ...prev].slice(0, MAX_AUDIT_ENTRIES));
  }, []);

  const audit = useCallback(
    (message: string, tag: AuditLogEntry["tag"] = "SESSION"): AuditLogEntry => ({
      id: nextId("audit"),
      timestamp: Date.now(),
      message,
      tag,
    }),
    []
  );

  const takeRedactedScreenshotForTurn = useCallback(
    async (
      turnId: string,
      promptText: string,
      stepNumber = 0,
      label = "Pre-task analysis"
    ) => {
      try {
        const res = await captureRedactedScreenshot(promptText, userRef.current?.id);
        if (res.ok && res.dataUrl) {
          const item = {
            id: nextId("screenshot"),
            image: res.dataUrl,
            label,
            step: stepNumber,
            timestamp: Date.now(),
          };
          updateTurn(turnId, (prev) => {
            const existing = prev.screenshots ? [...prev.screenshots] : [];
            const filtered = existing.filter(
              (s) => !(s.step === stepNumber && s.label === label)
            );
            return {
              ...prev,
              screenshot: {
                image: res.dataUrl,
                width: 0,
                height: 0,
                bytes: res.dataUrl.length,
                step: stepNumber,
              },
              screenshots: [...filtered, item],
            };
          });
          if (res.appliedCount > 0) {
            appendAudit([
              audit(
                `In-DOM redaction (${label}): ${res.appliedCount} placeholder(s) applied (${res.tags.join(", ")})`,
                asRedactionTag(res.tags[0] || "CREDENTIAL")
              ),
            ]);
          }
          return res;
        }
      } catch (err) {
        console.warn("[varma] Redacted screenshot capture error:", err);
      }
      return null;
    },
    [updateTurn, appendAudit, audit]
  );

  // ─── Chat Mode (POST /chat) ──────────────────────────────────────────────

  const runChatTurn = useCallback(
    async (turn: AgentTurn, history: ChatMessage[]) => {
      if (visualsRef.current.autoRedact) {
        await takeRedactedScreenshotForTurn(turn.id, turn.prompt);
      }

      const chatResult = await sendChatMessage(turn.prompt, history);
      const answer =
        chatResult.response ||
        (chatResult.error ? `Error: ${chatResult.error}` : "I didn't receive a response.");

      updateTurn(turn.id, (prevTurn) => ({
        ...prevTurn,
        status: chatResult.ok || chatResult.response ? "completed" : "error",
        response: answer,
        summary: answer,
      }));

      appendAudit([
        audit(
          chatResult.ok
            ? `Chat response processed via ${chatResult.model || "the local model"}`
            : `Chat response (local standby mode)`
        ),
      ]);

      soundEngine.playComplete();
    },
    [updateTurn, appendAudit, audit, takeRedactedScreenshotForTurn]
  );

  // ─── Vision Mode (WebSocket → native CDP agent) ─────────────────────────

  const runBrowserUseTurn = useCallback(
    async (turn: AgentTurn, domain: string) => {
      const steps = turn.steps;
      // Order matches buildInitialSteps: connect, perceive, describe, reason.
      const [connectStep, perceiveStep, describeStep, reasonStep] = steps;

      if (connectStep) updateStep(turn.id, connectStep.id, { status: "active" });

      // Pre-screenshot in-DOM redaction: apply placeholders before capturing
      if (visualsRef.current.autoRedact) {
        await takeRedactedScreenshotForTurn(turn.id, turn.prompt);
      }

      const conn = new AgentConnection({
        onConnected: () => {
          if (connectStep) updateStep(turn.id, connectStep.id, { status: "done" });
          if (perceiveStep) updateStep(turn.id, perceiveStep.id, { status: "active" });
          soundEngine.playStepDone();
          appendAudit([audit("Connected to agent via CDP")]);
        },

        onStepStart: (msg: WsStepStart) => {
          // The server labels its own phases; use the label to move the matching
          // scaffold row to "active" so the list tracks the run, then fall back
          // to the reasoning row for any status the panel does not recognise.
          const status = (msg.status || "").toLowerCase();
          const target = status.includes("screen")
            ? describeStep
            : status.includes("read")
              ? perceiveStep
              : reasonStep;
          if (target) {
            updateStep(turn.id, target.id, {
              status: "active",
              detail: msg.status || "Reasoning...",
            });
          }
        },

        // The agent's own view of the page: how many elements it can see and
        // how long perception took. This is the "on-screen element" readout.
        onPageState: (msg: WsPageState) => {
          if (perceiveStep) {
            updateStep(turn.id, perceiveStep.id, {
              status: "done",
              detail: `${msg.elements.length} interactive elements · ${Math.round(msg.observe_ms)}ms`,
            });
          }
          // Keep analysis free for actual task summaries from onFinalResult
        },

        // Layer-1 redaction report: what was masked on-device before the model
        // saw anything. Rendered in the privacy audit log, never the values.
        onRedactions: (msg: WsRedactions) => {
          if (!msg.redactions?.length) return;
          appendAudit(
            msg.redactions.map((r) =>
              audit(
                `Masked ${r.count} ${r.label} field(s) on ${domain}`,
                asRedactionTag(r.tag)
              )
            )
          );
        },

        // The agent's opening read of the screen. Rendered before any action so
        // the user can see it understood the page before it starts clicking.
        onDescription: (msg: WsDescription) => {
          if (describeStep) {
            updateStep(turn.id, describeStep.id, {
              status: msg.ok === false ? "error" : "done",
              detail: msg.ok === false
                ? msg.error || "Could not read the screen."
                : `Described the screen · ${msg.plan?.length ?? 0} step plan`,
            });
          }
          updateTurn(turn.id, (prev) => ({
            ...prev,
            description: {
              screen: msg.screen || "",
              ready: msg.ready !== false,
              blockers: msg.blockers || undefined,
              plan: msg.plan ?? [],
              error: msg.ok === false ? msg.error || "Could not read the screen." : undefined,
            },
          }));
          if (msg.screen) appendAudit([audit(`Read the screen: ${msg.screen.slice(0, 160)}`)]);
        },

        // Keep only the newest frame: it is the one that explains the action
        // about to be taken, and a per-step gallery would grow without bound.
        onScreenshot: (msg: WsScreenshot) => {
          // If autoRedact is active, do not overwrite the pre-redacted screenshot
          if (visualsRef.current.autoRedact) return;

          updateTurn(turn.id, (prev) => ({
            ...prev,
            screenshot: {
              image: msg.image,
              width: msg.width,
              height: msg.height,
              bytes: msg.bytes,
              step: msg.step,
            },
          }));
        },

        // One action executed. Streamed before the step finishes so the user
        // sees progress without waiting for the whole step.
        onAction: (msg: WsAction) => {
          const action = msg.action;
          const rawDetail = describeAction(action);
          const detail = rawDetail.startsWith("Action:") ? rawDetail : `Action: ${rawDetail}`;
          if (reasonStep) updateStep(turn.id, reasonStep.id, { status: "done" });

          const dynamicStep = {
            id: nextId("step"),
            label: detail,
            detail: action.error ? `Failed: ${action.error}` : undefined,
            category: "executing" as const,
            status: action.ok === false ? ("error" as const) : ("done" as const),
            actions: [action as unknown as BrowserUseAction],
          };
          updateTurn(turn.id, (prev) => ({ ...prev, steps: [...prev.steps, dynamicStep] }));
          soundEngine.playStepDone();

          appendAudit([audit(`Step ${msg.step}: ${detail}`)]);
        },

        onStepComplete: (msg: WsStepComplete) => {
          if (perceiveStep) updateStep(turn.id, perceiveStep.id, { status: "done" });
          if (reasonStep && msg.is_done) updateStep(turn.id, reasonStep.id, { status: "done" });
          soundEngine.playStepDone();

          if (msg.timing?.total_ms != null) {
            appendAudit([
              audit(
                `Step ${msg.step} timing — total ${Math.round(msg.timing.total_ms)}ms ` +
                  `(perceive ${Math.round(msg.timing.observe_ms ?? 0)}ms, ` +
                  `think ${Math.round(msg.timing.llm_ms ?? 0)}ms, ` +
                  `act ${Math.round(msg.timing.action_ms ?? 0)}ms)`
              ),
            ]);
          }

          if (msg.extracted_content) {
            appendAudit([audit(`Extracted: ${msg.extracted_content.slice(0, 200)}`)]);
          }
        },

        onApprovalRequired: (msg: WsApprovalRequired) => {
          const actionDesc =
            msg.actions
              ?.map((a: BrowserUseActionPayload) => a.label || a.action || a.type || a.name || "action")
              .join(", ") || "browser action";

          // The server only raises a gate in manual/auto mode, so the mode that
          // arrives in the message is authoritative for this request.
          const requestMode: ApprovalMode = msg.mode === "auto" ? "auto" : "manual";
          const approval = buildApprovalRequest(
            t,
            domain,
            `V.A.R.M.A Action: ${actionDesc}`,
            msg.thought || "The agent wants to perform an action on the page.",
            requestMode,
            msg.step,
            msg.timeout_s
          );
          updateTurn(turn.id, { status: "awaiting-approval", approval });
          soundEngine.playApprovalPrompt();

          if (requestMode === "auto") {
            // Auto-approve after a brief visible pause so the banner registers
            // in the audit trail without requiring a click.
            const timer = setTimeout(() => {
              approvalTimers.current.delete(timer);
              updateTurn(turn.id, (prev) =>
                prev.approval
                  ? {
                      ...prev,
                      approval: { ...prev.approval, state: "approved" },
                      status: "running",
                    }
                  : prev
              );
              conn.approve();
              if (visualsRef.current.autoRedact) {
                void takeRedactedScreenshotForTurn(
                  turn.id,
                  turn.prompt,
                  msg.step,
                  `Post-Approval: ${actionDesc}`
                );
              }
            }, 600);
            approvalTimers.current.add(timer);
          } else {
            // Manual: register a resolver so the banner's buttons can decide.
            approvalResolvers.current.set(turn.id, (approved) => {
              updateTurn(turn.id, (prev) =>
                prev.approval
                  ? {
                      ...prev,
                      approval: { ...prev.approval, state: approved ? "approved" : "denied" },
                      status: approved ? "running" : "denied",
                    }
                  : prev
              );
              if (approved) {
                conn.approve();
                if (visualsRef.current.autoRedact) {
                  void takeRedactedScreenshotForTurn(
                    turn.id,
                    turn.prompt,
                    msg.step,
                    `Post-Approval: ${actionDesc}`
                  );
                }
              } else {
                conn.deny();
                soundEngine.playDeny();
              }
              approvalResolvers.current.delete(turn.id);
            });
          }
        },

        // The run was closed out because the page stopped changing. Surfaced as
        // a visible outcome rather than a silent stop, because "it gave up
        // because nothing was happening" is the useful thing to know.
        onStalled: (msg: WsStalled) => {
          const detail = `No page change for ${msg.streak} steps (limit ${msg.threshold})`;
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: [
              ...prev.steps,
              {
                id: nextId("step"),
                label: "Stopped: no progress",
                detail,
                category: "completed" as const,
                status: "error" as const,
              },
            ],
          }));
          appendAudit([audit(`Stalled — ${detail}`)]);
          soundEngine.playDeny();
        },

        // A completion claim with no usable evidence was refused and handed
        // back to the model. Shown as a step so the retry is not mysterious.
        onDoneRejected: (msg: WsDoneRejected) => {
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: [
              ...prev.steps,
              {
                id: nextId("step"),
                label: `Verification failed (${msg.attempts}/${msg.max_attempts})`,
                detail: msg.reason,
                category: "reasoning" as const,
                status: "error" as const,
              },
            ],
          }));
          appendAudit([audit(`Completion rejected: ${msg.reason}`)]);
        },

        // The claim passed verification, with the evidence that justified it.
        onDoneVerified: (msg: WsDoneVerified) => {
          if (!msg.evidence) return;
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: [
              ...prev.steps,
              {
                id: nextId("step"),
                label: "Completion verified",
                detail: msg.evidence,
                category: "completed" as const,
                status: "done" as const,
              },
            ],
          }));
          appendAudit([audit(`Verified: ${msg.evidence.slice(0, 160)}`)]);
        },

        onFinalResult: (msg: WsFinalResult) => {
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.status === "pending" || s.status === "active" ? { ...s, status: "done" } : s
            ),
            status: msg.success ? "completed" : "error",
            summary: msg.result || buildSummary(t, "completed", 0),
            analysis: msg.result,
          }));
          soundEngine.playComplete();

          const avg = msg.metrics?.avg_step_ms;
          appendAudit([
            audit(
              `Task ${msg.success ? "completed" : "failed"} in ${Math.round(msg.elapsed_ms ?? 0)}ms` +
                (typeof avg === "number" ? ` · avg ${Math.round(avg)}ms/step` : "")
            ),
          ]);
          conn.close();
          if (agentConnRef.current === conn) agentConnRef.current = null;
        },

        onError: (msg: WsError) => {
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)),
            status: "error",
            summary: `Error: ${msg.error}`,
          }));
          appendAudit([audit(`Agent error: ${msg.error}`)]);
          conn.close();
          if (agentConnRef.current === conn) agentConnRef.current = null;
        },

        onStopped: (msg: WsStopped) => {
          const denied = /denied/i.test(msg.reason || "");
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)),
            status: denied ? "denied" : "stopped",
            summary: msg.reason || buildSummary(t, denied ? "denied" : "stopped", 0),
            // A denial arrives while the banner is still pending; close it out
            // so the UI does not keep asking for a decision already made.
            approval:
              prev.approval && prev.approval.state === "pending"
                ? { ...prev.approval, state: denied ? "denied" : "expired" }
                : prev.approval,
          }));
          approvalResolvers.current.delete(turn.id);
          conn.close();
          if (agentConnRef.current === conn) agentConnRef.current = null;
        },

        onDisconnect: () => {
          updateTurn(turn.id, (prev) => {
            if (prev.status === "running" || prev.status === "awaiting-approval") {
              return {
                ...prev,
                status: "error",
                summary: "Lost connection to the agent server",
                approval:
                  prev.approval && prev.approval.state === "pending"
                    ? { ...prev.approval, state: "expired" }
                    : prev.approval,
                steps: prev.steps.map((s) =>
                  s.status === "active" ? { ...s, status: "error" } : s
                ),
              };
            }
            return prev;
          });
          approvalResolvers.current.delete(turn.id);
          if (agentConnRef.current === conn) agentConnRef.current = null;
        },
      });

      agentConnRef.current = conn;

      try {
        await conn.connect(turn.prompt, approvalModeRef.current, {
          showOverlay: visualsRef.current.showOverlay,
          showCursor: visualsRef.current.showCursor,
          autoRedact: visualsRef.current.autoRedact,
          tabScope: tabScopeRef.current,
          userId: userRef.current?.id,
          userEmail: userRef.current?.email,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Connection failed";
        if (connectStep) updateStep(turn.id, connectStep.id, { status: "error", detail: errorMsg });
        updateTurn(turn.id, {
          status: "error",
          summary: errorMsg,
          steps: turn.steps.map((s) =>
            s.status === "pending" || s.status === "active" ? { ...s, status: "error" } : s
          ),
        });
        appendAudit([audit(`Agent connection failed: ${errorMsg}`)]);
        if (agentConnRef.current === conn) agentConnRef.current = null;
      }
    },
    [updateTurn, updateStep, appendAudit, audit, t]
  );

  // ─── Submit Prompt ───────────────────────────────────────────────────────

  const submitPrompt = useCallback(
    (promptText: string, contextMode: ContextMode = "auto", intent?: SuggestionIntent) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;

      const domain = tabContext.domain ?? t("context.noActiveTab");
      const mode = intent ? "vision" : resolveTurnMode(trimmed, contextMode);

      const turn: AgentTurn = {
        id: nextId("turn"),
        prompt: trimmed,
        createdAt: Date.now(),
        mode,
        steps: mode === "vision" ? buildInitialSteps(t, domain) : [],
        status: "running",
      };

      // Build the chat history from the current turns before appending this one.
      const history: ChatMessage[] = [];
      if (mode === "chat") {
        for (const prev of turns.slice(-CHAT_HISTORY_TURNS)) {
          const assistantReply = prev.response || prev.analysis;
          if (assistantReply) {
            history.push({ role: "user", content: prev.prompt });
            history.push({ role: "assistant", content: assistantReply });
          }
        }
        history.push({ role: "user", content: trimmed });
      }

      setTurns((prev) => [...prev, turn]);
      soundEngine.playSend();

      if (mode === "chat") {
        void runChatTurn(turn, history);
      } else {
        void runBrowserUseTurn(turn, domain);
      }
    },
    [tabContext.domain, runChatTurn, runBrowserUseTurn, turns, t]
  );

  // ─── Controls ────────────────────────────────────────────────────────────

  /** Mark any in-flight turn as stopped so the UI never stays stuck "running". */
  const settleActiveTurns = useCallback((reason: string) => {
    setTurns((prev) =>
      prev.map((turn) => {
        if (turn.status !== "running" && turn.status !== "awaiting-approval") return turn;
        return {
          ...turn,
          status: "stopped",
          summary: reason,
          approval:
            turn.approval && turn.approval.state === "pending"
              ? { ...turn.approval, state: "expired" }
              : turn.approval,
          steps: turn.steps.map((s) =>
            s.status === "active" || s.status === "pending"
              ? { ...s, status: "error", detail: "Cancelled by user" }
              : s
          ),
        };
      })
    );
  }, []);

  const stopCurrentTurn = useCallback(() => {
    const conn = agentConnRef.current;
    clearApprovalTimers();
    approvalResolvers.current.clear();
    // Tell the server to stop the run, then close. The server's own STOPPED
    // event may never arrive if the socket is already gone, so settle the UI
    // here too — otherwise the turn spins forever.
    conn?.stop();
    conn?.close();
    agentConnRef.current = null;
    settleActiveTurns(t("summary.stopped"));
    soundEngine.playDeny();
  }, [clearApprovalTimers, settleActiveTurns, t]);

  const resolveApproval = useCallback((approved: boolean) => {
    const runningTurnId = [...approvalResolvers.current.keys()].pop();
    if (!runningTurnId) return;
    void approvalResolvers.current.get(runningTurnId)?.(approved);
  }, []);

  const approveCurrentTurn = useCallback(() => resolveApproval(true), [resolveApproval]);
  const denyCurrentTurn = useCallback(() => resolveApproval(false), [resolveApproval]);

  const clearSession = useCallback(() => {
    clearApprovalTimers();
    approvalResolvers.current.clear();
    agentConnRef.current?.stop();
    agentConnRef.current?.close();
    agentConnRef.current = null;
    setTurns([]);
    setAuditLog([]);
    void clearState(STORAGE_KEY);
  }, [clearApprovalTimers]);

  const isRunning = turns.some(
    (turn) => turn.status === "running" || turn.status === "awaiting-approval"
  );

  return {
    turns,
    auditLog,
    tabContext,
    isRunning,
    submitPrompt,
    stopCurrentTurn,
    approveCurrentTurn,
    denyCurrentTurn,
    clearSession,
  };
}
