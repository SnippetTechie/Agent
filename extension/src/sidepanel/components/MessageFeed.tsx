import { useEffect, useRef } from "react";
import type { AgentTurn, SuggestionIntent } from "../types.js";
import { MessageItem } from "./MessageItem.js";
import { PromptSuggestions } from "./PromptSuggestions.js";

export function MessageFeed({
  turns,
  onSelectSuggestion,
  onApprove,
  onDeny,
}: {
  turns: AgentTurn[];
  onSelectSuggestion: (prompt: string, intent: SuggestionIntent) => void;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <PromptSuggestions onSelect={onSelectSuggestion} />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
      {turns.map((turn) => (
        <MessageItem key={turn.id} turn={turn} onApprove={onApprove} onDeny={onDeny} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
