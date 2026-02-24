import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage, ToolStatusView } from "@/lib/event-reducer";
import type { SourceRef } from "@codex-app/shared-contracts";
import { MessageBubble } from "./message-bubble";
import { ReasoningPanel } from "./reasoning-panel";
import { SourcesPanel } from "./sources-panel";
import { ToolStatusChip } from "./tool-status-chip";

interface MessageListProps {
  messages: ChatMessage[];
  reasoningByItemId: Record<string, string>;
  sourcesByItemId: Record<string, SourceRef[]>;
  toolStatuses: ToolStatusView[];
  isThinking: boolean;
  hasMoreHistory: boolean;
  loadingMoreHistory: boolean;
  onLoadMoreHistory: () => void;
}

export function MessageList({
  messages,
  reasoningByItemId,
  sourcesByItemId,
  toolStatuses,
  isThinking,
  hasMoreHistory,
  loadingMoreHistory,
  onLoadMoreHistory,
}: MessageListProps) {
  const scrollTopThreshold = 32;
  const containerRef = useRef<HTMLElement | null>(null);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevLastMessageSignatureRef = useRef<string>("empty");
  const prevScrollHeightRef = useRef(0);
  const prevScrollTopRef = useRef(0);
  const didInitialAutoScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);
  const [showLoadMoreButton, setShowLoadMoreButton] = useState(false);
  const firstMessageId = messages[0]?.id ?? null;
  const lastMessage = messages[messages.length - 1];
  const lastMessageSignature = lastMessage ? `${lastMessage.id}:${lastMessage.text.length}` : "empty";

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const handleScroll = () => {
      const nearTop = container.scrollTop <= scrollTopThreshold;
      const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
      stickToBottomRef.current = distanceToBottom <= 120;
      setShowLoadMoreButton(hasMoreHistory && nearTop);
    };

    handleScroll();
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [hasMoreHistory]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const prevFirstMessageId = prevFirstMessageIdRef.current;
    const prevLastMessageSignature = prevLastMessageSignatureRef.current;
    const previousScrollHeight = prevScrollHeightRef.current;
    const previousScrollTop = prevScrollTopRef.current;
    const prependedOlderPage =
      !!prevFirstMessageId &&
      !!firstMessageId &&
      prevFirstMessageId !== firstMessageId &&
      prevLastMessageSignature === lastMessageSignature;

    if (prependedOlderPage) {
      const wasNearTopBeforeUpdate = previousScrollTop <= scrollTopThreshold;
      if (wasNearTopBeforeUpdate) {
        // "더 불러오기" 클릭으로 가져온 페이지는 바로 보이게 상단에 유지.
        container.scrollTop = 0;
      } else {
        const heightDelta = container.scrollHeight - previousScrollHeight;
        container.scrollTop += Math.max(heightDelta, 0);
      }
    } else if (!didInitialAutoScrollRef.current || stickToBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      didInitialAutoScrollRef.current = true;
    }

    prevFirstMessageIdRef.current = firstMessageId;
    prevLastMessageSignatureRef.current = lastMessageSignature;
    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;

    // Reuse the scroll listener pathway for button visibility updates.
    container.dispatchEvent(new Event("scroll"));
  }, [firstMessageId, lastMessageSignature, messages.length, isThinking, toolStatuses.length, hasMoreHistory]);

  return (
    <section ref={containerRef} className="flex-1 space-y-3 overflow-y-auto pr-1 md:space-y-4 md:pr-2">
      {showLoadMoreButton ? (
        <div className="sticky top-0 z-10 flex justify-center py-1">
          <button
            type="button"
            onClick={onLoadMoreHistory}
            disabled={loadingMoreHistory}
            className="min-h-10 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingMoreHistory ? "불러오는 중..." : "더 불러오기"}
          </button>
        </div>
      ) : null}

      {messages.map((message) => (
        <div key={message.id} className="space-y-2">
          <MessageBubble message={message} />

          {message.itemId ? (
            <div className="ml-1 space-y-2">
              <ReasoningPanel text={reasoningByItemId[message.itemId] ?? ""} />
              <SourcesPanel sources={sourcesByItemId[message.itemId] ?? []} />
            </div>
          ) : null}
        </div>
      ))}

      {isThinking ? (
        <div className="flex justify-start">
          <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-xs text-[var(--muted-foreground)] sm:px-4 sm:py-3 sm:text-sm">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
              <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
              <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:300ms]" />
            </span>
            <span>Codex가 답변을 생성중입니다...</span>
          </div>
        </div>
      ) : null}

      {!!toolStatuses.length && (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Tool Status</p>
          <div className="flex flex-wrap gap-2">
            {toolStatuses.map((status) => (
              <ToolStatusChip key={`${status.itemId}-${status.tool}`} status={status} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
