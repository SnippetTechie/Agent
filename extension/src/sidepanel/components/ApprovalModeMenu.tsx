import { useEffect, useRef, useState } from "react";
import { Check, ChevronsRight, Hand, TriangleAlert } from "lucide-react";
import type { ApprovalMode } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { TranslationKey } from "../lib/i18n/I18nContext.js";

const OPTIONS: { mode: ApprovalMode; key: TranslationKey; Icon: typeof Hand }[] = [
  { mode: "manual", key: "approvalMenu.manual", Icon: Hand },
  { mode: "auto", key: "approvalMenu.auto", Icon: ChevronsRight },
  { mode: "skip", key: "approvalMenu.skip", Icon: TriangleAlert },
];

const TRIGGER_ICON: Record<ApprovalMode, typeof Hand> = {
  manual: Hand,
  auto: ChevronsRight,
  skip: TriangleAlert,
};

/**
 * Maps directly onto our existing approve/deny mechanic: manual leaves it
 * as-is (pause for a click), auto still surfaces the banner for the audit
 * trail but resolves it after a brief visible pause, skip bypasses the
 * gate entirely. "skip" is the one genuinely riskier setting, so its
 * trigger icon stays amber-tinted even at rest — a quiet, persistent risk
 * indicator rather than something you'd only notice on opening the menu.
 */
export function ApprovalModeMenu({
  mode,
  onChange,
}: {
  mode: ApprovalMode;
  onChange: (mode: ApprovalMode) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const TriggerIcon = TRIGGER_ICON[mode];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("input.approvalMode")}
        className={`flex h-6 w-6 items-center justify-center rounded-md border transition-all active:scale-90 ${
          mode === "skip"
            ? "border-varma-caution/30 bg-varma-caution/10 text-varma-caution"
            : "border-transparent text-varma-text-dim hover:text-varma-text"
        }`}
      >
        <TriggerIcon className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="animate-varma-pop absolute bottom-8 left-0 z-30 w-56 overflow-hidden rounded-lg border border-varma-border-strong bg-varma-raised py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          {OPTIONS.map((opt) => (
            <button
              key={opt.mode}
              type="button"
              onClick={() => {
                onChange(opt.mode);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
            >
              <opt.Icon className={`h-3.5 w-3.5 ${opt.mode === "skip" ? "text-varma-caution" : ""}`} />
              <span className="flex-1">{t(opt.key)}</span>
              {opt.mode === mode && <Check className="h-3.5 w-3.5 text-varma-signal" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
