import { memo, useState } from "react";
import { ChevronDown, Circle, CircleCheck, CircleX, LoaderCircle, Zap } from "lucide-react";
import type { AgentStep, AgentTurn } from "../types.js";
import { StatusChip } from "./StatusChip.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { TranslationKey } from "../lib/i18n/I18nContext.js";

const STATUS_KEY: Record<AgentTurn["status"], TranslationKey> = {
  running: "card.statusRunning",
  "awaiting-approval": "card.statusAwaitingApproval",
  completed: "card.statusCompleted",
  denied: "card.statusDenied",
  stopped: "card.statusStopped",
  error: "card.statusError",
};

function StepIndicator({ status }: { status: AgentStep["status"] }) {
  if (status === "done") return <CircleCheck className="h-4 w-4 text-varma-verified shrink-0" strokeWidth={2} />;
  if (status === "active") return <LoaderCircle className="h-4 w-4 animate-spin text-varma-signal shrink-0" strokeWidth={2} />;
  if (status === "error") return <CircleX className="h-4 w-4 text-varma-redact shrink-0" strokeWidth={2} />;
  return <Circle className="h-4 w-4 text-varma-text-faint shrink-0" strokeWidth={2} />;
}

function StepRow({ step, index }: { step: AgentStep; index?: number }) {
  return (
    <li className="relative flex items-start gap-2.5 rounded-lg border border-varma-border/50 bg-varma-surface/60 px-3 py-2 transition-colors hover:bg-varma-surface">
      <div className="mt-0.5 shrink-0">
        <StepIndicator status={step.status} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p
            className={`text-[12.5px] font-medium leading-tight ${
              step.status === "pending"
                ? "text-varma-text-dim"
                : "text-varma-text"
            }`}
          >
            {step.label}
          </p>
          <div className="flex items-center gap-1.5">
            {index !== undefined && (
              <span className="rounded bg-varma-border/70 px-1.5 py-0.5 text-[10px] font-mono text-varma-text-dim">
                #{index}
              </span>
            )}
            <StatusChip category={step.category} status={step.status} />
          </div>
        </div>
        {step.detail && (
          <p className="mt-0.5 text-[11px] leading-snug text-varma-text-dim break-words">
            {step.detail}
          </p>
        )}
      </div>
    </li>
  );
}

function ActionCardInner({ turn }: { turn: AgentTurn }) {
  const { t } = useI18n();
  // Keep collapsed by default so executing or completed actions don't stack 11 rows tall.
  // The user can toggle expand/minimize anytime with one click.
  const [expanded, setExpanded] = useState(false);

  const isRunning = turn.status === "running" || turn.status === "awaiting-approval";

  // Filter executed action steps vs setup steps
  const executedActions = turn.steps.filter(
    (s) => s.category === "executing" || Boolean(s.actions?.length)
  );
  const setupSteps = turn.steps.filter(
    (s) => s.category !== "executing" && !s.actions?.length
  );

  // Identify currently active step
  const activeStep = turn.steps.find((s) => s.status === "active");
  const latestAction = executedActions[executedActions.length - 1];

  const totalActions = executedActions.length;
  const currentActionText = activeStep
    ? activeStep.label
    : latestAction
      ? latestAction.label
      : isRunning
        ? "Executing browser action..."
        : t(STATUS_KEY[turn.status]);

  return (
    <div className="space-y-2">
      {/* 1. Active Executing Action Banner: Only shows the single active action while running, never stacks */}
      {isRunning && (
        <div className="flex items-center gap-2.5 rounded-xl border border-varma-signal/30 bg-varma-signal/[0.08] px-3.5 py-2.5 shadow-sm backdrop-blur-sm animate-pulse">
          <LoaderCircle className="h-4 w-4 animate-spin text-varma-signal shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-varma-signal">
              <span>ACTIVE ACTION</span>
            </div>
            <p className="truncate text-[13px] font-medium text-varma-text">
              {currentActionText}
            </p>
          </div>
        </div>
      )}

      {/* 2. Collapsible Group: Maximisable / Minimisable container for all executed actions */}
      <div className="rounded-xl border border-varma-border bg-varma-surface/70 backdrop-blur-sm transition-shadow overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-varma-surface/90 transition-colors"
        >
          <div className="flex min-w-0 items-center gap-2">
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-varma-text-dim transition-transform duration-200 ${
                expanded ? "" : "-rotate-90"
              }`}
            />
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <Zap className="h-3.5 w-3.5 text-varma-signal shrink-0" />
              <span className="text-[12.5px] font-medium text-varma-text">
                {totalActions > 0
                  ? `Executed Actions (${totalActions})`
                  : `Steps (${turn.steps.length})`}
              </span>
              {!expanded && (
                <span className="truncate text-[12px] text-varma-text-dim">
                  · {latestAction ? latestAction.label : t(STATUS_KEY[turn.status])}
                </span>
              )}
            </div>
          </div>
          <span className="shrink-0 text-[11px] font-medium text-varma-signal hover:underline">
            {expanded ? "Minimize ▴" : "Expand ▾"}
          </span>
        </button>

        <div
          className="grid transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="border-t border-varma-border px-3 py-2.5 bg-varma-surface/30">
              {totalActions > 0 ? (
                <div className="space-y-2">
                  <ol className="space-y-1.5">
                    {executedActions.map((step, idx) => (
                      <StepRow key={step.id} step={step} index={idx + 1} />
                    ))}
                  </ol>
                  {setupSteps.length > 0 && (
                    <div className="pt-2 border-t border-varma-border/40 flex items-center justify-between text-[11px] text-varma-text-dim">
                      <span>Setup & Perception ({setupSteps.length} stages)</span>
                      <span className="text-varma-verified font-medium">✓ Completed</span>
                    </div>
                  )}
                </div>
              ) : (
                <ol className="space-y-1.5">
                  {turn.steps.map((step, idx) => (
                    <StepRow key={step.id} step={step} index={idx + 1} />
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const ActionCard = memo(ActionCardInner);
