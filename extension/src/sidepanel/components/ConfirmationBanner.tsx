import { ShieldAlert } from "lucide-react";
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

  if (approval.state !== "pending") {
    return (
      <div
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
    <div className="animate-varma-rise rounded-xl border border-varma-caution/30 bg-varma-caution/[0.07] px-3.5 py-3">
      <div className="flex gap-2.5">
        <ShieldAlert className="h-4 w-4 shrink-0 text-varma-caution mt-0.5" strokeWidth={2} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-varma-text">{approval.actionLabel}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-varma-text-dim">{approval.riskNote}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onApprove}
          className="flex-1 rounded-lg bg-varma-caution px-3 py-1.5 text-[12px] font-semibold text-varma-bg transition-transform hover:bg-varma-caution/90 active:scale-[0.97]"
        >
          {t("approval.approve")}
        </button>
        <button
          type="button"
          onClick={onDeny}
          className="flex-1 rounded-lg border border-varma-border px-3 py-1.5 text-[12px] font-semibold text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-[0.97]"
        >
          {t("approval.deny")}
        </button>
      </div>
    </div>
  );
}
