import logo from "../../assets/varma-logo.png";
import type { SuggestionIntent } from "../types.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { TranslationKey } from "../lib/i18n/I18nContext.js";

const SUGGESTIONS: { intent: SuggestionIntent; labelKey: TranslationKey }[] = [
  { intent: "sanitize", labelKey: "empty.suggestion1" },
  { intent: "navigate", labelKey: "empty.suggestion2" },
  { intent: "telemetry", labelKey: "empty.suggestion3" },
];

export function PromptSuggestions({
  onSelect,
}: {
  onSelect: (prompt: string, intent: SuggestionIntent) => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col items-center justify-end gap-3 px-4 pb-2">
      <img src={logo} alt="" className="mb-auto mt-10 h-9 w-9 opacity-20" />

      <div className="flex w-full max-w-[300px] flex-col gap-1.5">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s.intent}
            type="button"
            onClick={() => onSelect(t(s.labelKey), s.intent)}
            className="animate-varma-rise rounded-lg border border-varma-border px-3 py-2 text-left text-[12px] text-varma-text-dim transition-all hover:border-varma-border-strong hover:bg-varma-raised hover:text-varma-text active:scale-[0.98]"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {t(s.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
