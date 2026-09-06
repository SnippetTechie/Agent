import { useEffect, useRef } from "react";
import { Check, ShieldAlert, X } from "lucide-react";
import type { ApprovalRequest } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";

export function ConfirmationBanner({
  approval,
  onApprove,
  onDeny,
}: {
  approval: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const { t } = useI18n();
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (approval.state === "pending") {
      bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [approval.state]);

  if (approval.state !== "pending") {
    return (
      <div
        ref={bannerRef}
        className={`animate-varma-rise rounded-xl border px-3.5 py-2.5 text-[12px] transition-colors ${
          approval.state === "approved"
            ? "border-varma-verified/30 bg-varma-verified/10 text-varma-verified"
            : "border-varma-redact/30 bg-varma-redact/10 text-varma-redact"
        }`}
      >
        {approval.state === "approved" ? t("approval.approvedNote") : t("approval.deniedNote")}
      </div>
    );
  }

  return (
    <div
      ref={bannerRef}
      className="animate-varma-rise rounded-xl border-2 border-varma-signal/40 bg-varma-raised px-4 py-3.5 shadow-lg ring-2 ring-varma-signal/20"
    >
      <div className="flex gap-2.5">
        <ShieldAlert className="h-5 w-5 shrink-0 text-varma-signal mt-0.5" strokeWidth={2.2} />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-varma-text tracking-wide">{approval.actionLabel}</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-varma-text-dim">{approval.riskNote}</p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-varma-signal hover:bg-varma-signal/90 px-3.5 py-2 text-[12.5px] font-bold text-white shadow-md transition-all active:scale-[0.97]"
        >
          <Check className="h-4 w-4 stroke-[2.5]" />
          <span>Agree</span>
        </button>
        <button
          type="button"
          onClick={onDeny}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-varma-border bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-2 text-[12.5px] font-semibold text-varma-text-dim transition-all hover:text-varma-text active:scale-[0.97]"
        >
          <X className="h-4 w-4 stroke-[2.2]" />
          <span>Decline</span>
        </button>
      </div>
    </div>
  );
}
