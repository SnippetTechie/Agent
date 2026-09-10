import { memo } from "react";
import { Bot, LoaderCircle } from "lucide-react";
import type { AgentTurn } from "../types.js";
import { ActionCard } from "./ActionCard.js";
import { ConfirmationBanner } from "./ConfirmationBanner.js";
import { ScreenDescriptionCard } from "./ScreenDescriptionCard.js";
import { ScreenshotPreviewCard } from "./ScreenshotPreviewCard.js";
import { VlmAnalysisCard } from "./VlmAnalysisCard.js";

const SUMMARY_TONE: Record<AgentTurn["status"], string> = {
  running: "",
  "awaiting-approval": "",
  completed: "border-varma-border bg-varma-surface text-varma-text",
  denied: "border-varma-redact/25 bg-varma-redact/[0.06] text-varma-text",
  stopped: "border-varma-caution/25 bg-varma-caution/[0.06] text-varma-text",
  error: "border-varma-redact/25 bg-varma-redact/[0.06] text-varma-text",
};

function MessageItemInner({
  turn,
  onApprove,
  onDeny,
}: {
  turn: AgentTurn;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const isChat = turn.mode === "chat";

  if (isChat) {
    const isRunning = turn.status === "running";
    return (
      <div className="animate-varma-rise space-y-2">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-varma-signal/20 bg-varma-signal/[0.09] px-3.5 py-2 text-[13px] leading-relaxed text-varma-text">
            {turn.prompt}
          </div>
        </div>

        <div className="flex max-w-[92%] flex-col gap-2">
          <div className="animate-varma-rise rounded-2xl rounded-tl-sm border border-varma-border/80 bg-varma-surface/90 px-4 py-3 text-[13px] leading-relaxed text-varma-text shadow-sm backdrop-blur-sm">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-varma-text-dim">
              <Bot className="h-3.5 w-3.5 text-varma-signal" />
              <span>V.A.R.M.A</span>
            </div>
            {isRunning ? (
              <div className="flex items-center gap-2 text-[12.5px] text-varma-text-dim">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-varma-signal" />
                <span>Thinking...</span>
              </div>
            ) : (
              <div className="whitespace-pre-wrap font-sans text-varma-text/95">
                {turn.response || turn.summary || "Done."}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const hasAnalysis = !!turn.analysis;
  const showSummary =
    !hasAnalysis && turn.summary && turn.status !== "running" && turn.status !== "awaiting-approval";

  return (
    <div className="animate-varma-rise space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-varma-signal/20 bg-varma-signal/[0.09] px-3.5 py-2 text-[13px] leading-relaxed text-varma-text">
          {turn.prompt}
        </div>
      </div>

      <div className="flex max-w-[92%] flex-col gap-2">
        {/* Ordered to match the agent's own sequence: what it saw, what it is
            doing, what it needs, and finally the answer. */}
        {turn.description && (
          <ScreenDescriptionCard
            description={turn.description}
            screenshot={turn.screenshot?.image}
          />
        )}
        {turn.screenshot && !turn.description && (
          <ScreenshotPreviewCard preview={turn.screenshot} />
        )}
        <ActionCard turn={turn} />
        {hasAnalysis && <VlmAnalysisCard analysis={turn.analysis} />}
        {turn.approval && (
          <ConfirmationBanner approval={turn.approval} onApprove={onApprove} onDeny={onDeny} />
        )}
        {showSummary && (
          <div
            className={`animate-varma-rise rounded-2xl rounded-tl-sm border px-3.5 py-2 text-[13px] leading-relaxed ${SUMMARY_TONE[turn.status]}`}
          >
            {turn.summary}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Memoized: a running task re-renders the whole feed on every streamed event,
 * but only the active turn's object identity actually changes.
 */
export const MessageItem = memo(MessageItemInner);
