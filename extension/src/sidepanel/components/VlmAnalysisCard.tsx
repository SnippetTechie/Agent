import { Sparkles, Bot, AlertTriangle } from "lucide-react";

interface VlmAnalysisCardProps {
  analysis?: string;
  error?: string;
  modelName?: string;
}

/**
 * Displays the simplified description and vision reasoning produced by
 * the UI-TARS vision-language model for the captured screenshot.
 */
export function VlmAnalysisCard({
  analysis,
  error,
  modelName = "UI-TARS-7B",
}: VlmAnalysisCardProps) {
  if (!analysis && !error) return null;

  return (
    <div className="animate-varma-rise overflow-hidden rounded-xl border border-varma-signal/30 bg-varma-surface/80 shadow-sm backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2 border-b border-varma-border/70 bg-varma-signal/[0.04] px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-varma-signal/15 text-varma-signal">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-[12px] font-semibold text-varma-text">
            UI-TARS Vision Analysis
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-varma-border bg-varma-bg px-2 py-0.5 text-[10px] font-medium text-varma-text-dim">
          <Bot className="h-3 w-3 text-varma-signal" />
          {modelName}
        </span>
      </div>

      <div className="p-3.5 text-[12.5px] leading-relaxed text-varma-text">
        {analysis ? (
          <div className="whitespace-pre-wrap font-sans text-varma-text/95">
            {analysis}
          </div>
        ) : (
          <div className="flex items-start gap-2 text-varma-caution">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-[11.5px] leading-snug">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
