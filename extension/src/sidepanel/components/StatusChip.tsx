import type { ReactNode } from "react";
import { BrainCircuit, CheckCircle2, Loader2, MinusCircle, ShieldCheck, XCircle, Zap } from "lucide-react";
import type { StepCategory, StepStatus } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { TranslationKey } from "../lib/i18n/I18nContext.js";

const CATEGORY_META: Record<StepCategory, { key: TranslationKey; Icon: typeof ShieldCheck }> = {
  sanitizing: { key: "chips.sanitizing", Icon: ShieldCheck },
  reasoning: { key: "chips.reasoning", Icon: BrainCircuit },
  executing: { key: "chips.executing", Icon: Zap },
  completed: { key: "chips.completed", Icon: CheckCircle2 },
};

/**
 * Color communicates STATUS (neutral/active/done/error/skipped) — one accent used
 * only where something is actually happening. Category is communicated by
 * icon + label alone, never by its own hue: four different-colored chips
 * for four pipeline phases dilutes focus for no informational gain.
 */
export function StatusChip({ category, status }: { category: StepCategory; status: StepStatus }) {
  const { t } = useI18n();
  const meta = CATEGORY_META[category];

  if (status === "skipped") {
    return (
      <Chip tone="text-varma-text-faint/60 border-varma-border/40 bg-white/[0.02] opacity-60">
        <MinusCircle className="h-3 w-3" strokeWidth={2.5} />
        Skipped
      </Chip>
    );
  }
  if (status === "error") {
    return (
      <Chip tone="text-varma-redact border-varma-redact/30 bg-varma-redact/10">
        <XCircle className="h-3 w-3" strokeWidth={2.5} />
        {t(meta.key)}
      </Chip>
    );
  }
  if (status === "active") {
    return (
      <Chip tone="text-varma-signal border-varma-signal/30 bg-varma-signal/10">
        <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
        {t(meta.key)}
      </Chip>
    );
  }
  if (status === "done") {
    return (
      <Chip tone="text-varma-verified border-varma-verified/30 bg-varma-verified/10">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
        {t(meta.key)}
      </Chip>
    );
  }
  return (
    <Chip tone="text-varma-text-faint border-varma-border bg-transparent">
      <meta.Icon className="h-3 w-3" strokeWidth={2.5} />
      {t(meta.key)}
    </Chip>
  );
}

function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide transition-colors duration-300 ${tone}`}
    >
      {children}
    </span>
  );
}
