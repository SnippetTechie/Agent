import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { NoticeChoice } from "../hooks/usePrivacyNotice.js";

/**
 * Same first-run bottom-sheet pattern as a typical cookie-consent banner
 * (Customize / Reject / Accept), but the copy is honest about what this
 * app actually does — V.A.R.M.A doesn't use cookies, analytics, or
 * marketing trackers, so claiming it did just to match a familiar layout
 * would contradict its own "nothing leaves this device" pitch. Reject has
 * a real effect: it clears local session history and stops future turns
 * from being persisted (see hooks/useAgentSession.ts's persistEnabled).
 */
export function PrivacyNoticeBanner({ onRespond }: { onRespond: (choice: NoticeChoice) => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="animate-varma-slide-up absolute inset-x-0 bottom-0 z-40 px-3 pb-3">
      <div className="rounded-xl border border-varma-border-strong bg-varma-raised p-4 shadow-[0_8px_28px_rgba(0,0,0,0.55)]">
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-varma-signal" />
          <div className="min-w-0">
            <h2 className="text-[13px] font-semibold text-varma-text">{t("notice.title")}</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-varma-text-dim">{t("notice.body")}</p>

            <div
              className="grid transition-[grid-template-rows] duration-200 ease-out"
              style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <div className="mt-2 rounded-lg border border-varma-border bg-varma-bg/60 p-2.5">
                  <p className="text-[10.5px] font-medium uppercase tracking-wide text-varma-text-faint">
                    {t("notice.detailHeading")}
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] text-varma-text-dim">
                    <li>• {t("notice.detailItem1")}</li>
                    <li>• {t("notice.detailItem2")}</li>
                    <li>• {t("notice.detailItem3")}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-varma-border px-3 py-1.5 text-[12px] font-medium text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-[0.97]"
          >
            {t("notice.customize")}
          </button>
          <button
            type="button"
            onClick={() => onRespond("rejected")}
            className="flex-1 rounded-lg border border-varma-border px-3 py-1.5 text-[12px] font-medium text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-[0.97]"
          >
            {t("notice.reject")}
          </button>
          <button
            type="button"
            onClick={() => onRespond("accepted")}
            className="flex-1 rounded-lg bg-varma-signal px-3 py-1.5 text-[12px] font-semibold text-varma-bg transition-all hover:bg-varma-signal/85 active:scale-[0.97]"
          >
            {t("notice.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
