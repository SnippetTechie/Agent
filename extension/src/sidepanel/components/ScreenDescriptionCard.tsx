import { FileText } from "lucide-react";
import type { AgentDescription } from "../types.js";

export function ScreenDescriptionCard({
  description,
  screenshot,
}: {
  description: AgentDescription;
  screenshot?: string;
}) {
  return (
    <div className="rounded-lg border border-varma-border bg-varma-surface/50 p-2.5 text-xs shadow-sm">
      <div className="mb-1.5 flex items-center justify-between text-varma-muted">
        <span className="flex items-center gap-1 font-medium text-varma-text">
          <FileText className="h-3.5 w-3.5 text-varma-accent" />
          Screen Understanding
        </span>
        {description.ready && (
          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
            Ready
          </span>
        )}
      </div>

      {description.screen && (
        <p className="mb-2 text-varma-text/90 leading-relaxed">
          {description.screen}
        </p>
      )}

      {description.plan && description.plan.length > 0 && (
        <div className="mt-2 space-y-1 border-t border-varma-border/50 pt-2">
          <span className="font-semibold text-varma-muted text-[11px]">Proposed Plan:</span>
          <ol className="list-inside list-decimal space-y-0.5 text-varma-text/80">
            {description.plan.map((step: string, idx: number) => (
              <li key={idx} className="leading-tight">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {screenshot && (
        <div className="mt-2.5 overflow-hidden rounded border border-varma-border bg-black/40">
          <img
            src={screenshot}
            alt="Screen capture"
            className="max-h-36 w-full object-contain"
          />
        </div>
      )}
    </div>
  );
}
