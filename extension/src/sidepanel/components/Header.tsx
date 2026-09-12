import { History, SquarePen, LogOut } from "lucide-react";
import { HeaderMenu } from "./HeaderMenu.js";
import { useI18n } from "../lib/i18n/I18nContext.js";
import type { VisualSettings } from "../hooks/useVisualSettings.js";
import type { TabScope } from "../types.js";
import type { AuthUser } from "../hooks/useAuthUser.js";

export function Header({
  onClearSession,
  onToggleAuditLog,
  visuals,
  updateVisuals,
  tabScope,
  setTabScope,
  user,
  onSignOut,
}: {
  onClearSession: () => void;
  onToggleAuditLog: () => void;
  visuals: VisualSettings;
  updateVisuals: (patch: Partial<VisualSettings>) => void;
  tabScope: TabScope;
  setTabScope: (scope: TabScope) => void;
  user?: AuthUser | null;
  onSignOut?: () => void;
}) {
  const { t } = useI18n();

  return (
    <header className="flex h-9 shrink-0 items-center justify-end gap-0.5 border-b border-varma-border bg-varma-bg px-2">
      {user && (
        <div className="mr-auto flex items-center gap-1.5 overflow-hidden pl-1">
          <div className="flex items-center gap-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 text-[10px] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
            <span className="max-w-[110px] truncate font-mono">{user.email}</span>
            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out of Google / Supabase"
                className="ml-0.5 text-slate-400 hover:text-red-400 cursor-pointer"
              >
                <LogOut className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>
      )}

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
