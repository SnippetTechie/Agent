import { IdCard, Info, KeyRound, MapPin, PenLine, ScanFace, X } from "lucide-react";
import type { AuditLogEntry } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";

const TAG_ICON: Record<AuditLogEntry["tag"], typeof KeyRound> = {
  CREDENTIAL: KeyRound,
  COORDINATES: MapPin,
  FACE: ScanFace,
  ID_NUMBER: IdCard,
  SIGNATURE: PenLine,
  SESSION: Info,
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function PrivacyAuditModal({
  open,
  entries,
  onClose,
}: {
  open: boolean;
  entries: AuditLogEntry[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="animate-varma-fade absolute inset-0 z-20 flex flex-col bg-varma-bg/97 backdrop-blur-sm">
      <div className="animate-varma-slide-down flex items-center justify-between border-b border-varma-border px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-varma-text">{t("audit.title")}</h2>
          <p className="text-[11px] text-varma-text-dim">{t("audit.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-90"
          aria-label={t("audit.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {entries.length === 0 ? (
          <p className="mt-8 text-center text-[12px] text-varma-text-dim">{t("audit.empty")}</p>
        ) : (
          <ul className="space-y-2.5">
            {entries.map((entry, i) => {
              const Icon = TAG_ICON[entry.tag];
              return (
                <li
                  key={entry.id}
                  className="animate-varma-rise flex items-start gap-2.5"
                  style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                >
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-varma-raised text-varma-signal">
                    <Icon className="h-3 w-3" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12px] leading-snug text-varma-text">{entry.message}</p>
                    <p className="text-[10px] text-varma-text-dim">{formatTime(entry.timestamp)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
