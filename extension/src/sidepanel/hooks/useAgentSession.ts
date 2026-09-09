import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentTurn,
  ApprovalMode,
  AuditLogEntry,
  BrowserUseAction,
  ContextMode,
  SuggestionIntent,
  TabContext,
} from "../types.js";
import {
  buildApprovalRequest,
  buildInitialSteps,
  buildSummary,
  nextId,
} from "../lib/mockAgent.js";
import { getActiveTabContext, watchActiveTabContext } from "../lib/activeTab.js";
import { sendChatMessage, type ChatMessage } from "../lib/capture.js";
import { describeAction } from "../lib/actions.js";
import { resolveTurnMode } from "../lib/intent.js";
import { loadState, saveState, clearState } from "../lib/storage.js";
import { soundEngine } from "../lib/sound.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import {
  AgentConnection,
  type WsStepStart,
  type WsPageState,
  type WsAction,
  type WsStepComplete,
  type WsApprovalRequired,
  type WsFinalResult,
  type WsError,
  type WsStopped,
  type BrowserUseActionPayload,
} from "../lib/agentWebSocket.js";

const STORAGE_KEY = "varma.session.v1";

interface PersistedState {
  turns: AgentTurn[];
  auditLog: AuditLogEntry[];
}

export function useAgentSession(
  approvalMode: ApprovalMode,
  persistEnabled: boolean,
  visuals: { showOverlay: boolean; showCursor: boolean } = {
    showOverlay: true,
    showCursor: true,
  }
) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [tabContext, setTabContext] = useState<TabContext>({ domain: null, isSecure: false });
  const [hydrated, setHydrated] = useState(false);

  const agentConnRef = useRef<AgentConnection | null>(null);
  const approvalResolvers = useRef<Map<string, (approved: boolean) => void>>(new Map());

  // Keep the latest visual settings reachable from the run loop without
  // re-creating its callbacks on every toggle.
  const visualsRef = useRef(visuals);
  visualsRef.current = visuals;

  // Push live changes to a run that is already in flight.
  useEffect(() => {
    agentConnRef.current?.setVisuals({
      overlay: visuals.showOverlay,
      cursor: visuals.showCursor,
    });
  }, [visuals.showOverlay, visuals.showCursor]);

  // ─── Hydration & Tab Context ─────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    if (persistEnabled) {
      loadState<PersistedState>(STORAGE_KEY).then((saved) => {
        if (cancelled) return;
        if (saved) {
          setTurns(saved.turns);
          setAuditLog(saved.auditLog);
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

  useEffect(() => {
    if (!hydrated || !persistEnabled) return;
    void saveState<PersistedState>(STORAGE_KEY, { turns, auditLog });
  }, [turns, auditLog, hydrated, persistEnabled]);

  // ─── State Helpers ───────────────────────────────────────────────────────

  const updateTurn = useCallback((turnId: string, patch: Partial<AgentTurn> | ((t: AgentTurn) => AgentTurn)) => {
    setTurns((prev) =>
      prev.map((turn) =>
        turn.id === turnId ? (typeof patch === "function" ? patch(turn) : { ...turn, ...patch }) : turn
      )
    );
  }, []);

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
    setAuditLog((prev) => [...entries, ...prev]);
  }, []);

  // ─── Chat Mode (unchanged — POST /chat to Gnani Evon) ───────────────────

  const runChatTurn = useCallback(
    async (turn: AgentTurn) => {
      const history: ChatMessage[] = [];
      for (const prev of turns.slice(-6)) {
        const assistantReply = prev.response || prev.analysis;
        if (assistantReply) {
          history.push({ role: "user", content: prev.prompt });
          history.push({ role: "assistant", content: assistantReply });
        }
      }
      history.push({ role: "user", content: turn.prompt });

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
        {
          id: nextId("audit"),
          timestamp: Date.now(),
          message: chatResult.ok
            ? `Chat response processed via ${chatResult.model || "Gnani Evon"}`
            : `Chat response (local standby mode)`,
          tag: "SESSION",
        },
      ]);

      soundEngine.playComplete();
    },
    [updateTurn, appendAudit, turns]
  );

  // ─── Vision Mode (WebSocket → native CDP agent) ─────────────────────────

  const runBrowserUseTurn = useCallback(
    async (turn: AgentTurn, domain: string) => {
      const steps = turn.steps;

      // Mark step 0 (Connecting) as active
      if (steps[0]) {
        updateStep(turn.id, steps[0].id, { status: "active" });
      }

      // Open WebSocket connection to the agent server
      const conn = new AgentConnection({
        onConnected: () => {
          if (steps[0]) updateStep(turn.id, steps[0].id, { status: "done" });
          if (steps[1]) updateStep(turn.id, steps[1].id, { status: "active" });
          soundEngine.playStepDone();
          appendAudit([{
            id: nextId("audit"),
            timestamp: Date.now(),
            message: "Connected to agent via CDP",
            tag: "SESSION",
          }]);
        },

        onStepStart: (msg: WsStepStart) => {
          if (steps[2]) {
            updateStep(turn.id, steps[2].id, {
              status: "active",
              detail: msg.status || "Reasoning...",
            });
          }
        },

        // The agent's own view of the page: how many elements it can see and
        // how long perception took. This is the "on-screen element" readout.
        onPageState: (msg: WsPageState) => {
          if (steps[1]) {
            updateStep(turn.id, steps[1].id, {
              status: "done",
              detail: `${msg.elements.length} interactive elements · ${Math.round(msg.observe_ms)}ms`,
            });
          }
          updateTurn(turn.id, (prev) => ({
            ...prev,
            analysis: `${msg.title || msg.url} — ${msg.elements.length} interactive elements`,
          }));
        },

        // One action executed. Streamed before the step finishes so the user
        // sees progress without waiting for the whole step.
        onAction: (msg: WsAction) => {
          const action = msg.action;
          const detail = describeAction(action);
          if (steps[2]) {
            updateStep(turn.id, steps[2].id, { status: "done" });
          }
          const dynamicStep = {
            id: nextId("step"),
            label: detail,
            detail: action.error ? `Failed: ${action.error}` : undefined,
            category: action.ok === false ? ("executing" as const) : ("executing" as const),
            status: action.ok === false ? ("error" as const) : ("done" as const),
            actions: [action as unknown as BrowserUseAction],
          };
          updateTurn(turn.id, (prev) => ({ ...prev, steps: [...prev.steps, dynamicStep] }));
          soundEngine.playStepDone();

          appendAudit([{
            id: nextId("audit"),
            timestamp: Date.now(),
            message: `Step ${msg.step}: ${detail}`,
            tag: "SESSION",
          }]);
        },

        onStepComplete: (msg: WsStepComplete) => {
          if (steps[1]) updateStep(turn.id, steps[1].id, { status: "done" });
          if (steps[2] && msg.is_done) updateStep(turn.id, steps[2].id, { status: "done" });
          soundEngine.playStepDone();

          if (msg.timing?.total_ms != null) {
            appendAudit([{
              id: nextId("audit"),
              timestamp: Date.now(),
              message:
                `Step ${msg.step} timing — total ${Math.round(msg.timing.total_ms)}ms ` +
                `(perceive ${Math.round(msg.timing.observe_ms ?? 0)}ms, ` +
                `think ${Math.round(msg.timing.llm_ms ?? 0)}ms, ` +
                `act ${Math.round(msg.timing.action_ms ?? 0)}ms)`,
              tag: "SESSION",
            }]);
          }

          if (msg.extracted_content) {
            appendAudit([{
              id: nextId("audit"),
              timestamp: Date.now(),
              message: `Extracted: ${msg.extracted_content.slice(0, 200)}`,
              tag: "SESSION",
            }]);
          }
        },

        onApprovalRequired: (msg: WsApprovalRequired) => {
          const actionDesc = msg.actions
            ?.map((a: BrowserUseActionPayload) => a.type || a.name || "action")
            .join(", ") || "browser action";

          const approval = buildApprovalRequest(
            t,
            domain,
            `V.A.R.M.A Action: ${actionDesc}`,
            msg.thought || "The agent wants to perform an action on the page."
          );
          updateTurn(turn.id, { status: "awaiting-approval", approval });
          soundEngine.playApprovalPrompt();

          if (approvalMode === "auto") {
            // Auto-approve after a brief visual pause
            setTimeout(() => {
              updateTurn(turn.id, (t2) =>
                t2.approval ? { ...t2, approval: { ...t2.approval, state: "approved" }, status: "running" } : t2
              );
              conn.approve();
            }, 600);
          } else {
            // Manual: register resolver so UI buttons can approve/deny
            approvalResolvers.current.set(turn.id, (approved) => {
              updateTurn(turn.id, (t2) =>
                t2.approval
                  ? { ...t2, approval: { ...t2.approval, state: approved ? "approved" : "denied" }, status: approved ? "running" : "denied" }
                  : t2
              );
              if (approved) {
                conn.approve();
              } else {
                conn.deny();
                soundEngine.playDeny();
              }
              approvalResolvers.current.delete(turn.id);
            });
          }
        },

        onFinalResult: (msg: WsFinalResult) => {
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.status === "pending" || s.status === "active"
                ? { ...s, status: "done" }
                : s
            ),
            status: msg.success ? "completed" : "error",
            summary: msg.result || buildSummary(t, "completed", 0),
            analysis: msg.result,
          }));
          soundEngine.playComplete();

          const avg = msg.metrics?.avg_step_ms;
          appendAudit([{
            id: nextId("audit"),
            timestamp: Date.now(),
            message:
              `Task ${msg.success ? "completed" : "failed"} in ${Math.round(msg.elapsed_ms ?? 0)}ms` +
              (typeof avg === "number" ? ` · avg ${Math.round(avg)}ms/step` : ""),
            tag: "SESSION",
          }]);
          conn.close();
          agentConnRef.current = null;
        },

        onError: (msg: WsError) => {
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.status === "active" ? { ...s, status: "error" } : s
            ),
            status: "error",
            summary: `Error: ${msg.error}`,
          }));
          appendAudit([{
            id: nextId("audit"),
            timestamp: Date.now(),
            message: `Agent error: ${msg.error}`,
            tag: "SESSION",
          }]);
          conn.close();
          agentConnRef.current = null;
        },

        onStopped: (msg: WsStopped) => {
          updateTurn(turn.id, (prev) => ({
            ...prev,
            steps: prev.steps.map((s) =>
              s.status === "active" ? { ...s, status: "error" } : s
            ),
            status: msg.reason?.includes("denied") ? "denied" : "stopped",
            summary: msg.reason || buildSummary(t, "stopped", 0),
          }));
          conn.close();
          agentConnRef.current = null;
        },

        onDisconnect: () => {
          updateTurn(turn.id, (prev) => {
            if (prev.status === "running" || prev.status === "awaiting-approval") {
              return {
                ...prev,
                status: "error",
                summary: "Lost connection to the agent server",
                steps: prev.steps.map((s) =>
                  s.status === "active" ? { ...s, status: "error" } : s
                ),
              };
            }
            return prev;
          });
          agentConnRef.current = null;
        },
      });

      agentConnRef.current = conn;

      try {
        const wsApprovalMode =
          approvalMode === "skip" ? "skip" : approvalMode === "auto" ? "auto" : "manual";
        await conn.connect(turn.prompt, wsApprovalMode, {
          showOverlay: visualsRef.current.showOverlay,
          showCursor: visualsRef.current.showCursor,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Connection failed";
        if (steps[0]) updateStep(turn.id, steps[0].id, { status: "error", detail: errorMsg });
        updateTurn(turn.id, {
          status: "error",
          summary: errorMsg,
        });
        appendAudit([{
          id: nextId("audit"),
          timestamp: Date.now(),
          message: `Agent connection failed: ${errorMsg}`,
          tag: "SESSION",
        }]);
        agentConnRef.current = null;
      }
    },
    [updateTurn, updateStep, appendAudit, t, approvalMode]
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
        steps: mode === "vision" ? buildInitialSteps(t, domain, trimmed, intent) : [],
        status: "running",
      };

      setTurns((prev) => [...prev, turn]);
      soundEngine.playSend();

      if (mode === "chat") {
        void runChatTurn(turn);
      } else {
        void runBrowserUseTurn(turn, domain);
      }
    },
    [tabContext.domain, runChatTurn, runBrowserUseTurn, t]
  );

  // ─── Controls ────────────────────────────────────────────────────────────

  const stopCurrentTurn = useCallback(() => {
    // Tell the server to stop the browser-use agent
    agentConnRef.current?.stop();
    agentConnRef.current?.close();
    agentConnRef.current = null;
  }, []);

  const resolveApproval = useCallback((approved: boolean) => {
    const runningTurnId = [...approvalResolvers.current.keys()].pop();
    if (!runningTurnId) return;
    approvalResolvers.current.get(runningTurnId)?.(approved);
  }, []);

  const approveCurrentTurn = useCallback(() => resolveApproval(true), [resolveApproval]);
  const denyCurrentTurn = useCallback(() => resolveApproval(false), [resolveApproval]);

  const clearSession = useCallback(() => {
    agentConnRef.current?.stop();
    agentConnRef.current?.close();
    agentConnRef.current = null;
    setTurns([]);
    setAuditLog([]);
    void clearState(STORAGE_KEY);
  }, []);

  const isRunning = turns.some((turn) => turn.status === "running" || turn.status === "awaiting-approval");

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
