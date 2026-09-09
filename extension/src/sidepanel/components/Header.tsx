import { History, SquarePen } from "lucide-react";
import { HeaderMenu } from "./HeaderMenu.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { VisualSettings } from "../hooks/useVisualSettings.js";
import type { TabScope } from "../types.js";

/**
 * Chrome's own side-panel title strip already shows the extension name,
 * pin, and close controls — repeating them in-page (as an earlier version
 * of this component did) doubled up with the native chrome. This is just
 * the one slim icon toolbar row, matching Claude in Chrome's own in-page
 * header exactly.
 */
export function Header({
  onClearSession,
  onToggleAuditLog,
  visuals,
  updateVisuals,
  tabScope,
  setTabScope,
}: {
  onClearSession: () => void;
  onToggleAuditLog: () => void;
  visuals: VisualSettings;
  updateVisuals: (patch: Partial<VisualSettings>) => void;
  tabScope: TabScope;
  setTabScope: (scope: TabScope) => void;
}) {
  const { t } = useI18n();

  return (
    <header className="flex h-9 shrink-0 items-center justify-end gap-0.5 border-b border-varma-border bg-varma-bg px-2">
      <button
        type="button"
        onClick={onToggleAuditLog}
        title={t("header.auditLog")}
        className="flex h-8 w-8 items-center justify-center rounded-md text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-90"
      >
        <History className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClearSession}
        title={t("header.newSession")}
        className="flex h-8 w-8 items-center justify-center rounded-md text-varma-text-dim transition-all hover:bg-white/5 hover:text-varma-text active:scale-90"
      >
        <SquarePen className="h-4 w-4" />
      </button>
      <HeaderMenu
        visuals={visuals}
        updateVisuals={updateVisuals}
        tabScope={tabScope}
        setTabScope={setTabScope}
      />
    </header>
  );
}
