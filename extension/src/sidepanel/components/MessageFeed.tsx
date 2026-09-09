import { useEffect, useRef } from "react";
import type { AgentTurn, SuggestionIntent } from "../types.js";
import { MessageItem } from "./MessageItem.js";
import { PromptSuggestions } from "./PromptSuggestions.js";

/** How close to the bottom counts as "following the stream". */
const STICK_THRESHOLD_PX = 120;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  // A streamed step fires many updates; only follow along if the user has not
  // scrolled up to read something. Otherwise every event yanks them back down.
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottom.current = distance <= STICK_THRESHOLD_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [turns.length > 0]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  if (turns.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <PromptSuggestions onSelect={onSelectSuggestion} />
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3.5 py-4">
      {turns.map((turn) => (
        <MessageItem key={turn.id} turn={turn} onApprove={onApprove} onDeny={onDeny} />
      ))}
    </div>
  );
}
