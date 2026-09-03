import { useState } from "react";
import { Header } from "./components/Header.js";
import { MessageFeed } from "./components/MessageFeed.js";
import { InputDock } from "./components/InputDock.js";
import { PrivacyAuditModal } from "./components/PrivacyAuditModal.js";
import { PrivacyNoticeBanner } from "./components/PrivacyNoticeBanner.js";
import { useAgentSession } from "./hooks/useAgentSession.js";
import { useApprovalMode } from "./hooks/useApprovalMode.js";
import { usePrivacyNotice } from "./hooks/usePrivacyNotice.js";

export function SidePanel() {
  const [approvalMode, setApprovalMode] = useApprovalMode();
  const { loaded: noticeLoaded, choice: noticeChoice, respond: respondToNotice } = usePrivacyNotice();
  const persistEnabled = noticeChoice !== "rejected";

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
  } = useAgentSession(approvalMode, persistEnabled);

  const [auditOpen, setAuditOpen] = useState(false);

  return (
    <div className="animate-varma-panel-in relative flex h-screen flex-col overflow-hidden bg-varma-bg text-varma-text">
      <Header onClearSession={clearSession} onToggleAuditLog={() => setAuditOpen((v) => !v)} />

      <MessageFeed
        turns={turns}
        onSelectSuggestion={submitPrompt}
        onApprove={approveCurrentTurn}
        onDeny={denyCurrentTurn}
      />

      <InputDock
        tabContext={tabContext}
        isRunning={isRunning}
        approvalMode={approvalMode}
        onApprovalModeChange={setApprovalMode}
        onSubmit={submitPrompt}
        onStop={stopCurrentTurn}
      />

      <PrivacyAuditModal open={auditOpen} entries={auditLog} onClose={() => setAuditOpen(false)} />

      {noticeLoaded && noticeChoice === null && <PrivacyNoticeBanner onRespond={respondToNotice} />}
    </div>
  );
}
