import type { RedactionBox, RedactionTag } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";

const TAG_STYLE: Record<RedactionTag, string> = {
  CREDENTIAL: "bg-rose-500/25 border-rose-400/60 text-rose-200",
  COORDINATES: "bg-varma-signal/20 border-varma-signal/60 text-varma-signal",
  FACE: "bg-violet-500/25 border-violet-400/60 text-violet-200",
  ID_NUMBER: "bg-varma-caution/20 border-varma-caution/60 text-amber-200",
  SIGNATURE: "bg-pink-500/20 border-pink-400/60 text-pink-200",
};

function RedactionMark({ box, index }: { box: RedactionBox; index: number }) {
  const { t } = useI18n();
  const label = t(`tags.${box.tag}`);
  return (
    <div
      className={`animate-varma-rise absolute rounded-[3px] border ${TAG_STYLE[box.tag]} flex items-center justify-center overflow-hidden`}
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: `${box.h}%`,
        animationDelay: `${index * 70}ms`,
      }}
      title={label}
    >
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, currentColor 0, currentColor 1px, transparent 1px, transparent 6px)",
        }}
      />
      <span className="relative truncate px-1 text-center text-[8px] font-semibold uppercase leading-none tracking-wider">
        {label}
      </span>
    </div>
  );
}

/**
 * Mocked "sanitized canvas" — a synthetic page wireframe with redaction
 * marks overlaid at the mock-detected field coordinates. This stands in
 * for a real OffscreenCanvas-composited screenshot; nothing here is a real
 * page capture, it's illustrative UI only until the real backend is wired in.
 */
export function SanitizedCanvasPreview({ boxes }: { boxes: RedactionBox[] }) {
  const { t } = useI18n();

  return (
    <div className="rounded-lg border border-varma-border bg-varma-bg/60 p-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-varma-raised ring-1 ring-inset ring-white/5">
        <div className="absolute inset-x-3 top-3 h-2 rounded bg-white/10" />
        <div className="absolute inset-x-3 top-7 h-1.5 w-2/3 rounded bg-white/5" />
        <div className="absolute inset-x-3 top-11 h-1.5 w-1/2 rounded bg-white/5" />
        <div className="absolute bottom-3 right-3 h-5 w-14 rounded bg-white/10" />

        {boxes.map((box, i) => (
          <RedactionMark key={i} box={box} index={i} />
        ))}

        {boxes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-varma-text-dim">
            {t("preview.noRegions")}
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-varma-text-dim">{t("preview.footer")}</p>
    </div>
  );
}
