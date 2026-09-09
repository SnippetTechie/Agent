import { useEffect, useRef, useState } from "react";
import { Check, ShieldAlert, Timer, X } from "lucide-react";
import type { ApprovalRequest } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";

/**
 * The approval gate. Renders three states:
 *   pending  -> Approve / Decline buttons (manual) or an auto-approve notice
 *   approved -> confirmation line
 *   denied   -> refusal line
 *   expired  -> the server gave up waiting; nothing was executed
 */
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
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (approval.state === "pending") {
      bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [approval.state]);

  // Countdown against the server's own deadline so the banner cannot hang
  // showing buttons for a request the server has already abandoned.
  useEffect(() => {
    if (approval.state !== "pending" || !approval.expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((approval.expiresAt! - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [approval.state, approval.expiresAt]);

  if (approval.state !== "pending") {
    const tone =
      approval.state === "approved"
        ? "border-varma-verified/30 bg-varma-verified/10 text-varma-verified"
        : approval.state === "expired"
          ? "border-varma-caution/30 bg-varma-caution/10 text-varma-caution"
          : "border-varma-redact/30 bg-varma-redact/10 text-varma-redact";

    const note =
      approval.state === "approved"
        ? approval.mode === "auto"
          ? t("approval.autoApprovedNote")
          : t("approval.approvedNote")
        : approval.state === "expired"
          ? t("approval.expiredNote")
          : t("approval.deniedNote");

    return (
      <div
        ref={bannerRef}
        className={`animate-varma-rise rounded-xl border px-3.5 py-2.5 text-[12px] transition-colors ${tone}`}
      >
        {note}
      </div>
    );
  }

  const isAuto = approval.mode === "auto";

  return (
    <div
      ref={bannerRef}
      className={`animate-varma-rise rounded-xl border-2 bg-varma-raised px-4 py-3.5 shadow-lg ${
        isAuto
          ? "border-varma-caution/40 ring-2 ring-varma-caution/15"
          : "border-varma-signal/40 ring-2 ring-varma-signal/20"
      }`}
    >
      <div className="flex gap-2.5">
        <ShieldAlert
          className={`mt-0.5 h-5 w-5 shrink-0 ${isAuto ? "text-varma-caution" : "text-varma-signal"}`}
          strokeWidth={2.2}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] font-bold tracking-wide text-varma-text">
              {approval.actionLabel}
            </p>
            {approval.step != null && (
              <span className="shrink-0 rounded-full border border-varma-border px-1.5 py-0.5 text-[10px] text-varma-text-faint">
                {t("approval.stepLabel", { n: approval.step })}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-varma-text-dim">{approval.riskNote}</p>

          {isAuto ? (
            <p className="mt-1.5 text-[11px] leading-snug text-varma-caution">
              {t("approval.autoNote")}
            </p>
          ) : (
            secondsLeft !== null && (
              <p className="mt-1.5 flex items-center gap-1 text-[11px] text-varma-text-faint">
                <Timer className="h-3 w-3" />
                {t("approval.expiresIn", { n: secondsLeft })}
              </p>
            )
          )}
        </div>
      </div>

      {/* Auto mode resolves itself; only manual needs (and gets) buttons. */}
      {!isAuto && (
        <div className="mt-3.5 flex gap-2.5">
          <button
            type="button"
            onClick={onApprove}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-varma-signal px-3.5 py-2 text-[12.5px] font-bold text-white shadow-md transition-all hover:bg-varma-signal/90 active:scale-[0.97]"
          >
            <Check className="h-4 w-4 stroke-[2.5]" />
            <span>{t("approval.approve")}</span>
          </button>
          <button
            type="button"
            onClick={onDeny}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-varma-border bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-varma-text-dim transition-all hover:bg-white/[0.08] hover:text-varma-text active:scale-[0.97]"
          >
            <X className="h-4 w-4 stroke-[2.2]" />
            <span>{t("approval.deny")}</span>
          </button>
        </div>
      )}
    </div>
  );
}
