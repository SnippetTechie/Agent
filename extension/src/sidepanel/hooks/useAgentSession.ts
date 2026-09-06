import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentTurn, ApprovalMode, AuditLogEntry, ContextMode, SuggestionIntent, TabContext, VarmaMouseAction } from "../types.js";
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
import { captureAndSaveScreenshot, sendChatMessage, type ChatMessage } from "../lib/capture.js";
import { resolveTurnMode } from "../lib/intent.js";
import { animateVarmaMouse } from "../lib/varmaMouse.js";
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
    // Strip the heavy screenshot dataUrl before persisting: a captured
    // viewport is hundreds of KB–MB and would blow the session-storage
    // quota. The upload badge (uploaded/savedPath/error) is kept so the
    // status survives a panel reopen; the live image is session-only.
    const slimTurns = turns.map((turn) => {
      if (!turn.screenshot) return turn;
      const slimItems = turn.screenshot.items?.map((item) => ({
        ...item,
        dataUrl: "",
        url: item.url || (item.savedPath ? `http://127.0.0.1:8002/${item.savedPath}` : (turn.screenshot?.savedPath ? `http://127.0.0.1:8002/${turn.screenshot.savedPath}` : undefined)),
      }));
      return {
        ...turn,
        screenshot: {
          ...turn.screenshot,
          dataUrl: "",
          url: turn.screenshot.url || (turn.screenshot.savedPath ? `http://127.0.0.1:8002/${turn.screenshot.savedPath}` : undefined),
          items: slimItems,
        },
      };
    });
    void saveState<PersistedState>(STORAGE_KEY, { turns: slimTurns, auditLog });
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
        if (turn.mode === "chat") {
          // Pure conversational flow: Zero screenshot capture, zero page scrolling!
          const history: ChatMessage[] = [];
          for (const prev of turns.slice(-6)) {
            history.push({ role: "user", content: prev.prompt });
            if (prev.response) {
              history.push({ role: "assistant", content: prev.response });
            } else if (prev.analysis) {
              history.push({ role: "assistant", content: prev.analysis });
            }
          }
          history.push({ role: "user", content: turn.prompt });

          const chatResult = await sendChatMessage(turn.prompt, history, signal);
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
                ? `Chat response processed via ${chatResult.model || "vLLM"}`
                : `Chat response (local standby mode)`,
              tag: "SESSION",
            },
          ]);

          soundEngine.playComplete();
          return;
        }

        let detectedAction: VarmaMouseAction | undefined = undefined;

        for (let i = 0; i < turn.steps.length; i++) {
          const step = turn.steps[i];
          if (!step) continue;

          // Requirement: Skip local redaction step
          if (step.status === "skipped" || step.label.toLowerCase().includes("redaction")) {
            updateStep(turn.id, step.id, {
              status: "skipped",
              detail: "Skipped (local redaction bypassed)",
            });
            continue;
          }

          const isLastStep = i === turn.steps.length - 1;

          // Mouse Click Approval Gate: Prompt user to Agree / Decline before executing mouse clicks
          if ((step.category === "executing" || isLastStep) && detectedAction) {
            const targetDesc = detectedAction.target || "interactive element";
            const actionDesc = detectedAction.textToType
              ? `Click on "${targetDesc}" and type "${detectedAction.textToType}"`
              : `Click on "${targetDesc}"`;

            const approval = buildApprovalRequest(
              t,
              domain,
              `V.A.R.M.A Action: ${actionDesc}`,
              `V.A.R.M.A will animate its blue cursor across the page and execute the interaction.`
            );
            updateTurn(turn.id, { status: "awaiting-approval", approval });
            soundEngine.playApprovalPrompt();

            let approved: boolean;
            if (approvalMode === "auto") {
              await sleep(600, signal);
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
              updateStep(turn.id, step.id, { status: "error", detail: "Click action declined by user" });
              updateTurn(turn.id, { status: "denied", summary: "Mouse click was declined by user." });
              return;
            }

            updateTurn(turn.id, { status: "running" });
            updateStep(turn.id, step.id, {
              status: "active",
              detail: `V.A.R.M.A system moving blue mouse cursor to ${targetDesc}...`,
            });

            // Find the active tab across windows
            let activeTabId: number | undefined = undefined;
            try {
              const focusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
              if (focusedTabs[0]?.id) {
                activeTabId = focusedTabs[0].id;
              } else {
                const anyActive = await chrome.tabs.query({ active: true });
                if (anyActive[0]?.id) activeTabId = anyActive[0].id;
              }
            } catch (err) {
              console.warn("[varma] Error querying active tab:", err);
            }

            // Animate V.A.R.M.A blue cursor on active tab
            if (activeTabId) {
              try {
                await animateVarmaMouse(activeTabId, detectedAction.x, detectedAction.y, {
                  normalized: detectedAction.normalized,
                  target: detectedAction.target,
                  textToType: detectedAction.textToType,
                });
              } catch (err) {
                console.warn("[varma-mouse] Error executing mouse animation:", err);
              }
            }

            updateStep(turn.id, step.id, {
              status: "done",
              detail: `V.A.R.M.A clicked and interacted with "${targetDesc}"`,
            });
            soundEngine.playStepDone();
            continue;
          }

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

          // The first step is the "capturing" step — here we do the real
          // work: grab one screenshot of the active tab and save it to
          // the screenshots folder via chrome.downloads.
          if (i === 0) {
            const result = await captureAndSaveScreenshot(turn.prompt);
            detectedAction = result.action;
            // Attach the real screenshot + save status + UI-TARS analysis + mouse action to the turn.
            updateTurn(turn.id, {
              screenshot: {
                dataUrl: result.dataUrl,
                items: result.items,
                saved: result.ok,
                savedPath: result.savedPath,
                url: result.url,
                error: result.error,
                analysis: result.analysis,
                analysisError: result.analysisError,
              },
              analysis: result.analysis,
              mouseAction: result.action,
            });
            appendAudit([
              {
                id: nextId("audit"),
                timestamp: Date.now(),
                message: result.ok
                  ? `Screenshot saved to ${result.savedPath ?? "screenshots folder"}`
                  : `Screenshot capture failed: ${result.error ?? "unknown"}`,
                tag: "SESSION",
              },
            ]);
            if (result.analysis) {
              appendAudit([
                {
                  id: nextId("audit"),
                  timestamp: Date.now(),
                  message: "UI-TARS analyzed screenshot and generated simplified description",
                  tag: "SESSION",
                },
              ]);
            }
          }

          if (step.category === "reasoning") {
            updateStep(turn.id, step.id, {
              detail: "UI-TARS visual perception & scene analysis",
            });
          }

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
        const defaultSummary = buildSummary(t, "completed", maskedCount);
        updateTurn(turn.id, (prevTurn) => ({
          ...prevTurn,
          status: "completed",
          summary: prevTurn.analysis || defaultSummary,
        }));
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
    [updateTurn, updateStep, appendAudit, t, approvalMode, turns]
  );

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

      const controller = new AbortController();
      abortRef.current = controller;
      const isRisky = mode === "vision" && !intent && approvalMode !== "skip" && requiresApproval(trimmed);
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
