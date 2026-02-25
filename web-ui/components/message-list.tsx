import { useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { ChatMessage, ToolStatusView } from "@/lib/event-reducer";
import type { SourceRef } from "@codex-app/shared-contracts";
import { MessageBubble } from "./message-bubble";
import { ReasoningPanel } from "./reasoning-panel";
import { SourcesPanel } from "./sources-panel";
import { ToolStatusChip } from "./tool-status-chip";

interface MessageListProps {
  threadId: string | null;
  messages: ChatMessage[];
  reasoningByItemId: Record<string, string>;
  sourcesByItemId: Record<string, SourceRef[]>;
  toolStatuses: ToolStatusView[];
  isThinking: boolean;
  hasMoreHistory: boolean;
  loadingMoreHistory: boolean;
  onLoadMoreHistory: () => void;
}

function toItemThreadKey(threadId: string, itemId: string): string {
  return `${threadId}:${itemId}`;
}

export function MessageList({
  threadId,
  messages,
  reasoningByItemId,
  sourcesByItemId,
  toolStatuses,
  isThinking,
  hasMoreHistory,
  loadingMoreHistory,
  onLoadMoreHistory,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const prevFirstMessageIdRef = useRef<string | null>(null);
  const prevLastMessageSignatureRef = useRef<string>("empty");
  const prevMessageLengthRef = useRef(0);
  const didInitialAutoScrollRef = useRef(false);
  const [firstItemIndex, setFirstItemIndex] = useState(10_000);
  const [isAtTop, setIsAtTop] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const firstMessageId = messages[0]?.id ?? null;
  const lastMessage = messages[messages.length - 1];
  const lastMessageSignature = lastMessage ? `${lastMessage.id}:${lastMessage.text.length}` : "empty";
  const showLoadMoreButton = hasMoreHistory && isAtTop;

  useEffect(() => {
    const prevFirstMessageId = prevFirstMessageIdRef.current;
    const prevLastMessageSignature = prevLastMessageSignatureRef.current;
    const prevMessageLength = prevMessageLengthRef.current;
    const prependedOlderPage =
      !!prevFirstMessageId &&
      !!firstMessageId &&
      prevFirstMessageId !== firstMessageId &&
      prevLastMessageSignature === lastMessageSignature;

    if (prependedOlderPage) {
      const addedCount = Math.max(messages.length - prevMessageLength, 0);
      if (addedCount > 0) {
        setFirstItemIndex((prev) => prev - addedCount);
      }
    } else {
      const lastMessageChanged = lastMessageSignature !== prevLastMessageSignature;
      const shouldAutoScroll = !didInitialAutoScrollRef.current
        ? messages.length > 0
        : lastMessageChanged && (isAtBottom || isThinking);

      if (shouldAutoScroll) {
        didInitialAutoScrollRef.current = true;
        requestAnimationFrame(() => {
          const lastIndex = firstItemIndex + messages.length - 1;
          virtuosoRef.current?.scrollToIndex({ index: lastIndex, align: "end", behavior: "auto" });
        });
      }
    }

    prevFirstMessageIdRef.current = firstMessageId;
    prevLastMessageSignatureRef.current = lastMessageSignature;
    prevMessageLengthRef.current = messages.length;
  }, [firstItemIndex, firstMessageId, lastMessageSignature, messages.length, isAtBottom, isThinking]);

  const footer = useMemo(() => {
    return (
      <>
        {isThinking ? (
          <div className="flex justify-start py-1">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2.5 text-xs text-[var(--muted-foreground)] sm:px-4 sm:py-3 sm:text-sm">
              <span className="inline-flex items-center gap-1" aria-hidden>
                <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:0ms]" />
                <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:150ms]" />
                <span className="size-2 animate-pulse rounded-full bg-[var(--accent)] [animation-delay:300ms]" />
              </span>
              <span>Codex is generating a response...</span>
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
      </>
    );
  }, [isThinking, toolStatuses]);

  return (
    <section
      className="flex-1 overflow-hidden pr-1 md:pr-2"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Chat messages"
    >
      <Virtuoso
        ref={virtuosoRef}
        className="h-full"
        data={messages}
        firstItemIndex={firstItemIndex}
        computeItemKey={(_, message) => message.id}
        increaseViewportBy={{ top: 200, bottom: 300 }}
        atTopStateChange={(atTop) => setIsAtTop(atTop)}
        atBottomStateChange={(atBottom) => setIsAtBottom(atBottom)}
        itemContent={(_, message) => (
          <div className="space-y-2 py-1 [content-visibility:auto] [contain-intrinsic-size:200px]">
            <MessageBubble message={message} />
            {message.itemId ? (
              <div className="ml-1 space-y-2">
                <ReasoningPanel
                  text={threadId ? (reasoningByItemId[toItemThreadKey(threadId, message.itemId)] ?? "") : ""}
                />
                <SourcesPanel
                  sources={threadId ? (sourcesByItemId[toItemThreadKey(threadId, message.itemId)] ?? []) : []}
                />
              </div>
            ) : null}
          </div>
        )}
        components={{
          Header: () =>
            showLoadMoreButton ? (
              <div className="sticky top-0 z-10 flex justify-center py-1">
                <button
                  type="button"
                  onClick={onLoadMoreHistory}
                  disabled={loadingMoreHistory}
                  className="min-h-10 rounded-full border border-[var(--border)] bg-[var(--panel)] px-3 py-1 text-xs font-medium text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMoreHistory ? "Loading..." : "Load more"}
                </button>
              </div>
            ) : (
              <div className="h-1" />
            ),
          Footer: () => <div className="space-y-2 py-1">{footer}</div>,
        }}
      />
    </section>
  );
}
