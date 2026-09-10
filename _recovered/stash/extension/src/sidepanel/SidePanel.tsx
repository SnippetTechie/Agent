import { useState } from "react";
import { Header } from "./components/Header.js";
import { MessageFeed } from "./components/MessageFeed.js";
import { InputDock } from "./components/InputDock.js";
import { PrivacyAuditModal } from "./components/PrivacyAuditModal.js";
import { PrivacyNoticeBanner } from "./components/PrivacyNoticeBanner.js";
import { useAgentSession } from "./hooks/useAgentSession.js";
import { useApprovalMode } from "./hooks/useApprovalMode.js";
import { usePrivacyNotice } from "./hooks/usePrivacyNotice.js";
import { useTabScope } from "./hooks/useTabScope.js";
import { useVisualSettings } from "./hooks/useVisualSettings.js";

export function SidePanel() {
  const [approvalMode, setApprovalMode] = useApprovalMode();
  const { loaded: noticeLoaded, choice: noticeChoice, respond: respondToNotice } = usePrivacyNotice();
  const persistEnabled = noticeChoice !== "rejected";

  // Single source of truth for the on-page visual layer, shared by the
  // settings menu and the run loop.
  const [visuals, updateVisuals] = useVisualSettings();
  // Tab scope is read by the run loop when it starts a task.
  const [tabScope, setTabScope] = useTabScope();

  const {
    turns,
    auditLog,
    tabContext,
    isRunning,
    submitPrompt,
    stopCurrentTurn,
    approveCurrentTurn,
    denyCurrentTurn,
    clearSession,
  } = useAgentSession(approvalMode, persistEnabled, visuals, tabScope);

  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <div className="animate-varma-panel-in relative flex h-screen flex-col overflow-hidden bg-varma-bg text-varma-text">
      <Header
        onClearSession={clearSession}
        onToggleAuditLog={() => setAuditOpen((v) => !v)}
        visuals={visuals}
        updateVisuals={updateVisuals}
        tabScope={tabScope}
        setTabScope={setTabScope}
      />

      <MessageFeed
        turns={turns}
        onSelectSuggestion={(prompt, intent) => submitPrompt(prompt, "page", intent)}
        onApprove={approveCurrentTurn}
        onDeny={denyCurrentTurn}
      />

      <InputDock
        tabContext={tabContext}
        isRunning={isRunning}
        approvalMode={approvalMode}
        onApprovalModeChange={setApprovalMode}
        visuals={visuals}
        updateVisuals={updateVisuals}
        onSubmit={submitPrompt}
        onStop={stopCurrentTurn}
      />

      <PrivacyAuditModal open={auditOpen} entries={auditLog} onClose={() => setAuditOpen(false)} />

      {noticeLoaded && noticeChoice === null && <PrivacyNoticeBanner onRespond={respondToNotice} />}
    </div>
  );
}
