import { useEffect, useRef, useState } from "react";
import { Boxes, Check, ChevronRight, EllipsisVertical, Languages, Layers, Volume2, VolumeX } from "lucide-react";
import { LANGUAGES } from "../lib/i18n/translations.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import { useMuted } from "../hooks/useMuted.js";
import { useTabScope } from "../hooks/useTabScope.js";
import type { VisualSettings } from "../hooks/useVisualSettings.js";

/**
 * Matches the reference's "⋮ → Language >" nested-flyout pattern, but as
 * an inline accordion instead of a second absolutely-positioned popover —
 * more robust in a ~380px panel where a true side-flyout would clip.
 */
export function HeaderMenu({
  visuals,
  updateVisuals,
}: {
  visuals: VisualSettings;
  updateVisuals: (patch: Partial<VisualSettings>) => void;
}) {
  const { lang, setLang, t } = useI18n();
  const [muted, toggleMuted] = useMuted();
  const [tabScope, setTabScope] = useTabScope();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [tabScopeOpen, setTabScopeOpen] = useState(false);
  const [visualsOpen, setVisualsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setLanguageOpen(false);
        setTabScopeOpen(false);
        setVisualsOpen(false);
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
        <div className="animate-varma-pop absolute right-0 top-9 z-30 w-52 overflow-hidden rounded-lg border border-varma-border-strong bg-varma-raised py-1 shadow-[0_8px_24px_rgba(0,0,0,0.5)]">
          <button
            type="button"
            onClick={toggleMuted}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
          >
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muted ? t("header.unmute") : t("header.mute")}
          </button>

          {/* Tab Access Scope setting */}
          <button
            type="button"
            onClick={() => {
              setTabScopeOpen((v) => !v);
              setLanguageOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
          >
            <Layers className="h-3.5 w-3.5 text-varma-signal" />
            <span className="flex-1">Tab Access Scope</span>
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${tabScopeOpen ? "rotate-90" : ""}`}
            />
          </button>

          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: tabScopeOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="border-t border-varma-border py-1">
                <button
                  type="button"
                  onClick={() => {
                    setTabScope("single");
                    setOpen(false);
                    setTabScopeOpen(false);
                  }}
                  className="flex w-full items-center justify-between py-1.5 pl-9 pr-3 text-left text-[12px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
                >
                  <span className="flex items-center gap-1.5">
                    Current tab only
                  </span>
                  {tabScope === "single" && <Check className="h-3 w-3 text-varma-signal" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTabScope("all");
                    setOpen(false);
                    setTabScopeOpen(false);
                  }}
                  className="flex w-full items-center justify-between py-1.5 pl-9 pr-3 text-left text-[12px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
                >
                  <span className="flex items-center gap-1.5">
                    All tabs
                  </span>
                  {tabScope === "all" && <Check className="h-3 w-3 text-varma-signal" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setLanguageOpen((v) => !v);
              setTabScopeOpen(false);
            }}
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

          {/* On-page visual layer (bounding boxes + agent cursor) */}
          <button
            type="button"
            onClick={() => {
              setVisualsOpen((v) => !v);
              setLanguageOpen(false);
              setTabScopeOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
          >
            <Boxes className="h-3.5 w-3.5 text-varma-signal" />
            <span className="flex-1">On-page visuals</span>
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${visualsOpen ? "rotate-90" : ""}`}
            />
          </button>

          <div
            className="grid transition-[grid-template-rows] duration-200 ease-out"
            style={{ gridTemplateRows: visualsOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="border-t border-varma-border py-1">
                <button
                  type="button"
                  onClick={() => updateVisuals({ showOverlay: !visuals.showOverlay })}
                  className="flex w-full items-center justify-between py-1.5 pl-9 pr-3 text-left text-[12px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
                >
                  <span className="flex items-center gap-1.5">
                    Bounding boxes
                    <span className="text-varma-text-faint">
                      {visuals.showOverlay ? "on" : "off"}
                    </span>
                  </span>
                  {visuals.showOverlay ? (
                    <Check className="h-3 w-3 text-varma-signal" />
                  ) : (
                    <span className="h-3 w-3 rounded-sm border border-varma-border" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => updateVisuals({ showCursor: !visuals.showCursor })}
                  className="flex w-full items-center justify-between py-1.5 pl-9 pr-3 text-left text-[12px] text-varma-text-dim transition-colors hover:bg-white/[0.06] hover:text-varma-text"
                >
                  <span className="flex items-center gap-1.5">
                    Agent cursor
                    <span className="text-varma-text-faint">
                      {visuals.showCursor ? "on" : "off"}
                    </span>
                  </span>
                  {visuals.showCursor ? (
                    <Check className="h-3 w-3 text-varma-signal" />
                  ) : (
                    <span className="h-3 w-3 rounded-sm border border-varma-border" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
