import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight, EllipsisVertical, Languages, Volume2, VolumeX } from "lucide-react";
import { LANGUAGES } from "../lib/i18n/translations.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import { useMuted } from "../hooks/useMuted.js";

/**
 * Matches the reference's "⋮ → Language >" nested-flyout pattern, but as
 * an inline accordion instead of a second absolutely-positioned popover —
 * more robust in a ~380px panel where a true side-flyout would clip.
 */
export function HeaderMenu() {
  const { lang, setLang, t } = useI18n();
  const [muted, toggleMuted] = useMuted();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setLanguageOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("header.menu")}
        className="flex h-8 w-8 items-center justify-center rounded-md text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-90"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>

      {open && (
        <div className="animate-varma-pop absolute right-0 top-9 z-30 w-48 overflow-hidden rounded-lg border border-varma-border-strong bg-varma-raised py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <button
            type="button"
            onClick={toggleMuted}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muted ? t("header.unmute") : t("header.mute")}
          </button>

          <button
            type="button"
            onClick={() => setLanguageOpen((v) => !v)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
          >
            <Languages className="h-3.5 w-3.5" />
            <span className="flex-1">{t("header.language")}</span>
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${languageOpen ? "rotate-90" : ""}`}
            />
          </button>

          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: languageOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="border-t border-varma-border py-1">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    onClick={() => {
                      setLang(l.code);
                      setOpen(false);
                      setLanguageOpen(false);
                    }}
                    className="flex w-full items-center justify-between py-1.5 pl-9 pr-3 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
                  >
                    {l.nativeName}
                    {l.code === lang && <Check className="h-3 w-3 text-varma-signal" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
