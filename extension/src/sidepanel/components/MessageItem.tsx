import type { AgentTurn } from "../types.js";
import { ActionCard } from "./ActionCard.js";
import { ConfirmationBanner } from "./ConfirmationBanner.js";
import { ScreenshotPreview } from "./ScreenshotPreview.js";
import { VlmAnalysisCard } from "./VlmAnalysisCard.js";

const SUMMARY_TONE: Record<AgentTurn["status"], string> = {
  running: "",
  "awaiting-approval": "",
  completed: "border-varma-border bg-varma-surface text-varma-text",
  denied: "border-varma-redact/25 bg-varma-redact/[0.06] text-varma-text",
  stopped: "border-varma-caution/25 bg-varma-caution/[0.06] text-varma-text",
  error: "border-varma-redact/25 bg-varma-redact/[0.06] text-varma-text",
};

export function MessageItem({
  turn,
  onApprove,
  onDeny,
}: {
  turn: AgentTurn;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const hasAnalysis = !!turn.analysis;
  const showSummary = !hasAnalysis && turn.summary && turn.status !== "running" && turn.status !== "awaiting-approval";

  return (
    <div className="animate-varma-rise space-y-2">
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-varma-signal/20 bg-varma-signal/[0.09] px-3.5 py-2 text-[13px] leading-relaxed text-varma-text">
          {turn.prompt}
        </div>
      </div>

      <div className="flex max-w-[92%] flex-col gap-2">
        <ActionCard turn={turn} />
        {turn.screenshot && <ScreenshotPreview screenshot={turn.screenshot} />}
        {hasAnalysis && (
          <VlmAnalysisCard
            analysis={turn.analysis}
            error={turn.screenshot?.analysisError}
          />
        )}
        {turn.approval && <ConfirmationBanner approval={turn.approval} onApprove={onApprove} onDeny={onDeny} />}
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
