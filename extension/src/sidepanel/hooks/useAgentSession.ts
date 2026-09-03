import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentTurn, ApprovalMode, AuditLogEntry, SuggestionIntent, TabContext } from "../types.js";
import {
  buildApprovalRequest,
  buildInitialSteps,
  buildSummary,
  nextId,
  requiresApproval,
  sleep,
  tagLabel,
} from "../lib/mockAgent.js";
import { getActiveTabContext, watchActiveTabContext } from "../lib/activeTab.js";
import { loadState, saveState, clearState } from "../lib/storage.js";
import { soundEngine } from "../lib/sound.js";
import { useI18n } from "../lib/i18n/I18nContext.js";

const STORAGE_KEY = "varma.session.v1";
const STEP_DELAY_MS = [650, 900, 1100, 850];

interface PersistedState {
  turns: AgentTurn[];
  auditLog: AuditLogEntry[];
}

export function useAgentSession(approvalMode: ApprovalMode, persistEnabled: boolean) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [tabContext, setTabContext] = useState<TabContext>({ domain: null, isSecure: false });
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const approvalResolvers = useRef<Map<string, (approved: boolean) => void>>(new Map());

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

  const runTurn = useCallback(
    async (turn: AgentTurn, domain: string, isRisky: boolean, controller: AbortController) => {
      const { signal } = controller;
      try {
        for (let i = 0; i < turn.steps.length; i++) {
          const step = turn.steps[i];
          if (!step) continue;
          const isLastStep = i === turn.steps.length - 1;

          if (isLastStep && isRisky) {
            const approval = buildApprovalRequest(t, domain);
            updateTurn(turn.id, { status: "awaiting-approval", approval });
            soundEngine.playApprovalPrompt();

            let approved: boolean;
            if (approvalMode === "auto") {
              // Still surfaces the banner (so it's visible in the transcript
              // and audit trail) but resolves it without waiting on a click.
              await sleep(500, signal);
              approved = true;
            } else {
              approved = await new Promise<boolean>((resolve) => {
                approvalResolvers.current.set(turn.id, resolve);
              });
              approvalResolvers.current.delete(turn.id);
            }

            updateTurn(turn.id, (t2) =>
              t2.approval ? { ...t2, approval: { ...t2.approval, state: approved ? "approved" : "denied" } } : t2
            );

            if (!approved) {
              soundEngine.playDeny();
              updateStep(turn.id, step.id, { status: "error" });
              updateTurn(turn.id, { status: "denied", summary: buildSummary(t, "denied", 0) });
              return;
            }
            updateTurn(turn.id, { status: "running" });
          }

          updateStep(turn.id, step.id, { status: "active" });
          await sleep(STEP_DELAY_MS[i % STEP_DELAY_MS.length] ?? 800, signal);
          updateStep(turn.id, step.id, { status: "done" });
          soundEngine.playStepDone();

          if (step.preview && step.preview.boxes.length > 0) {
            appendAudit(
              step.preview.boxes.map((box) => ({
                id: nextId("audit"),
                timestamp: Date.now(),
                message: t("audit.maskedMessage", { tag: tagLabel(t, box.tag), domain }),
                tag: box.tag,
              }))
            );
          }
        }

        const maskedCount = turn.steps.find((s) => s.preview)?.preview?.boxes.length ?? 0;
        updateTurn(turn.id, { status: "completed", summary: buildSummary(t, "completed", maskedCount) });
        soundEngine.playComplete();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          updateTurn(turn.id, (t2) => ({
            ...t2,
            status: "stopped",
            summary: buildSummary(t, "stopped", 0),
            steps: t2.steps.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)),
          }));
        } else {
          updateTurn(turn.id, { status: "error", summary: buildSummary(t, "error", 0) });
        }
      }
    },
    [updateTurn, updateStep, appendAudit, t, approvalMode]
  );

  const submitPrompt = useCallback(
    (promptText: string, intent?: SuggestionIntent) => {
      const trimmed = promptText.trim();
      if (!trimmed) return;

      const domain = tabContext.domain ?? t("context.noActiveTab");
      const turn: AgentTurn = {
        id: nextId("turn"),
        prompt: trimmed,
        createdAt: Date.now(),
        steps: buildInitialSteps(t, domain, trimmed, intent),
        status: "running",
      };

      setTurns((prev) => [...prev, turn]);
      soundEngine.playSend();

      const controller = new AbortController();
      abortRef.current = controller;
      const isRisky = intent || approvalMode === "skip" ? false : requiresApproval(trimmed);
      void runTurn(turn, domain, isRisky, controller);
    },
    [tabContext.domain, runTurn, t, approvalMode]
  );

  const stopCurrentTurn = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const resolveApproval = useCallback((approved: boolean) => {
    const runningTurnId = [...approvalResolvers.current.keys()].pop();
    if (!runningTurnId) return;
    approvalResolvers.current.get(runningTurnId)?.(approved);
  }, []);

  const approveCurrentTurn = useCallback(() => resolveApproval(true), [resolveApproval]);
  const denyCurrentTurn = useCallback(() => resolveApproval(false), [resolveApproval]);

  const clearSession = useCallback(() => {
    abortRef.current?.abort();
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
