"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type { CommandApprovalDecision, FileApprovalDecision } from "@codex-app/shared-contracts";
import {
  approveCommand,
  approveFileChange,
  createThread,
  interruptTurn,
  listThreadMessages,
  listThreads,
  readAuthState,
  resumeThread,
  startTurn,
} from "@/lib/api-client";
import { chatReducer, initialChatState } from "@/lib/event-reducer";
import { connectUiEventStream } from "@/lib/sse-client";
import { ApprovalBanner } from "./approval-banner";
import { MessageList } from "./message-list";
import { PromptComposer } from "./prompt-composer";
import { ThreadSidebar } from "./thread-sidebar";

export function ChatShell() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [streamDisconnected, setStreamDisconnected] = useState(false);
  const [serverConnection, setServerConnection] = useState<"connecting" | "connected" | "reconnecting">(
    "connecting",
  );
  const [sending, setSending] = useState(false);
  const [isAwaitingAssistant, setIsAwaitingAssistant] = useState(false);
  const [loadingThreadHistoryId, setLoadingThreadHistoryId] = useState<string | null>(null);
  const [loadingMoreHistoryThreadId, setLoadingMoreHistoryThreadId] = useState<string | null>(null);
  const [threadCopyStatus, setThreadCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const [auth, threads] = await Promise.all([readAuthState(), listThreads()]);

        if (!mounted) {
          return;
        }

        dispatch({
          type: "apply-ui-event",
          event: { type: "auth.updated", payload: { authMode: auth.authMode } },
        });
        dispatch({ type: "hydrate-threads", threads: threads.data });

        const initialThreadId = threads.data[0]?.id;
        if (initialThreadId) {
          setLoadingThreadHistoryId(initialThreadId);
          const page = await listThreadMessages(initialThreadId);
          if (!mounted) {
            return;
          }

          dispatch({
            type: "replace-thread-history-page",
            threadId: initialThreadId,
            messages: page.data,
            nextCursor: page.nextCursor,
          });
        }
      } catch (bootstrapError) {
        if (mounted) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to bootstrap chat UI");
        }
      } finally {
        if (mounted) {
          setLoadingThreadHistoryId(null);
          setLoading(false);
        }
      }
    };

    void bootstrap();

    const disconnect = connectUiEventStream(
      (event) => {
        if (mounted) {
          setStreamDisconnected(false);
          setServerConnection("connected");
          if (event.type === "agent.delta" || event.type === "turn.completed" || event.type === "error") {
            setIsAwaitingAssistant(false);
          }
        }
        dispatch({ type: "apply-ui-event", event });
      },
      () => {
        if (mounted) {
          setStreamDisconnected(true);
          setServerConnection("reconnecting");
        }
      },
      () => {
        if (mounted) {
          setStreamDisconnected(false);
          setServerConnection("connected");
        }
      },
    );

    return () => {
      mounted = false;
      disconnect();
    };
  }, []);

  const currentThreadId = state.currentThreadId;
  const currentMessages = currentThreadId ? (state.messagesByThreadId[currentThreadId] ?? []) : [];
  const currentHistoryNextCursor = currentThreadId ? (state.historyNextCursorByThreadId[currentThreadId] ?? null) : null;
  const hasMoreHistory = Boolean(currentHistoryNextCursor);
  const loadingMoreHistory = !!currentThreadId && loadingMoreHistoryThreadId === currentThreadId;

  const toolStatuses = useMemo(() => Object.values(state.toolStatusesByItemId), [state.toolStatusesByItemId]);
  const isThinking = sending || isAwaitingAssistant || !!state.activeTurnId;

  const ensureThread = async (): Promise<string> => {
    if (state.currentThreadId) {
      try {
        await resumeThread(state.currentThreadId);
        return state.currentThreadId;
      } catch {
        // If a persisted thread cannot be resumed (e.g. missing from loaded context), create a fresh one.
      }
    }

    const created = await createThread();
    dispatch({ type: "select-thread", threadId: created.threadId });
    dispatch({
      type: "replace-thread-history-page",
      threadId: created.threadId,
      messages: [],
      nextCursor: null,
    });
    return created.threadId;
  };

  const handleCreateThread = async () => {
    try {
      setError(null);
      const created = await createThread();
      dispatch({ type: "select-thread", threadId: created.threadId });
      dispatch({
        type: "replace-thread-history-page",
        threadId: created.threadId,
        messages: [],
        nextCursor: null,
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create thread");
    }
  };

  const handleSelectThread = async (threadId: string) => {
    try {
      setError(null);
      dispatch({ type: "select-thread", threadId });

      if (!state.historyLoadedByThreadId[threadId]) {
        setLoadingThreadHistoryId(threadId);
        const page = await listThreadMessages(threadId);
        dispatch({
          type: "replace-thread-history-page",
          threadId,
          messages: page.data,
          nextCursor: page.nextCursor,
        });
      }

      await resumeThread(threadId);
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Failed to resume thread");
    } finally {
      setLoadingThreadHistoryId(null);
    }
  };

  const handleLoadMoreHistory = async () => {
    const threadId = state.currentThreadId;
    if (!threadId) {
      return;
    }

    const cursor = state.historyNextCursorByThreadId[threadId];
    if (!cursor || loadingMoreHistoryThreadId === threadId) {
      return;
    }

    try {
      setError(null);
      setLoadingMoreHistoryThreadId(threadId);
      const page = await listThreadMessages(threadId, { cursor });
      dispatch({
        type: "prepend-thread-history-page",
        threadId,
        messages: page.data,
        nextCursor: page.nextCursor,
      });
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Failed to load more history");
    } finally {
      setLoadingMoreHistoryThreadId(null);
    }
  };

  const handleSend = async (text: string) => {
    setError(null);
    setSending(true);
    setIsAwaitingAssistant(true);

    try {
      const threadId = await ensureThread();
      dispatch({ type: "append-user-message", threadId, text });

      await startTurn(threadId, {
        input: [{ type: "text", text }],
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to start turn");
      setIsAwaitingAssistant(false);
    } finally {
      setSending(false);
    }
  };

  const handleInterrupt = async () => {
    if (!state.currentThreadId || !state.activeTurnId) {
      return;
    }

    try {
      await interruptTurn(state.currentThreadId, state.activeTurnId);
      setIsAwaitingAssistant(false);
    } catch (interruptError) {
      setError(interruptError instanceof Error ? interruptError.message : "Failed to interrupt turn");
    }
  };

  const handleCommandDecision = async (requestId: string, decision: CommandApprovalDecision) => {
    try {
      await approveCommand(requestId, decision);
      dispatch({ type: "consume-command-approval", requestId });
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Failed to submit command approval");
    }
  };

  const handleFileDecision = async (requestId: string, decision: FileApprovalDecision) => {
    try {
      await approveFileChange(requestId, decision);
      dispatch({ type: "consume-file-approval", requestId });
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Failed to submit file-change approval");
    }
  };

  const handleCopyThreadId = async () => {
    if (!currentThreadId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentThreadId);
      setThreadCopyStatus("copied");
    } catch {
      setThreadCopyStatus("failed");
    }

    setTimeout(() => {
      setThreadCopyStatus("idle");
    }, 1800);
  };

  return (
    <main className="h-screen w-screen bg-[radial-gradient(circle_at_top_right,var(--sky-soft),transparent_40%),radial-gradient(circle_at_bottom_left,var(--teal-soft),transparent_35%),var(--background)] p-4 text-[var(--foreground)]">
      <div className="mx-auto flex h-full max-w-[1440px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-xl">
        <ThreadSidebar
          threads={state.threads}
          currentThreadId={state.currentThreadId}
          onSelectThread={(threadId) => {
            void handleSelectThread(threadId);
          }}
          onCreateThread={() => {
            void handleCreateThread();
          }}
        />

        <section className="flex flex-1 flex-col p-4 md:p-6">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Codex Chat Console</h1>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                Auth: <span className="font-semibold">{state.authMode ?? "not authenticated"}</span>
              </p>
              {currentThreadId ? (
                <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-2 py-1">
                  <span className="text-xs text-[var(--muted-foreground)]">Thread ID</span>
                  <code className="text-xs font-semibold text-[var(--foreground)]">{currentThreadId}</code>
                  <button
                    type="button"
                    onClick={() => {
                      void handleCopyThreadId();
                    }}
                    className="rounded-md border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--panel-strong)]"
                  >
                    Copy
                  </button>
                  {threadCopyStatus === "copied" ? <span className="text-xs text-emerald-700">Copied</span> : null}
                  {threadCopyStatus === "failed" ? <span className="text-xs text-rose-700">Failed</span> : null}
                </div>
              ) : null}
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                serverConnection === "connected"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : serverConnection === "reconnecting"
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-slate-300 bg-slate-50 text-slate-700"
              }`}
            >
              <span
                className={`size-2 rounded-full ${
                  serverConnection === "connected"
                    ? "bg-emerald-500"
                    : serverConnection === "reconnecting"
                      ? "animate-pulse bg-amber-500"
                      : "animate-pulse bg-slate-500"
                }`}
              />
              <span>
                {serverConnection === "connected"
                  ? "Connected"
                  : serverConnection === "reconnecting"
                    ? "Reconnecting..."
                    : "Connecting..."}
              </span>
            </div>
          </header>

          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted-foreground)]">Loading...</div>
          ) : (
            <>
              {error ? (
                <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
              ) : null}
              {streamDisconnected ? (
                <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                  Event stream disconnected. Retrying automatically...
                </div>
              ) : null}

              <ApprovalBanner
                commandApprovals={state.commandApprovals}
                fileApprovals={state.fileApprovals}
                onCommandDecision={(requestId, decision) => {
                  void handleCommandDecision(requestId, decision);
                }}
                onFileDecision={(requestId, decision) => {
                  void handleFileDecision(requestId, decision);
                }}
              />

              <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
                {loadingThreadHistoryId && loadingThreadHistoryId === currentThreadId ? (
                  <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Loading thread history...
                  </div>
                ) : null}

                <MessageList
                  messages={currentMessages}
                  reasoningByItemId={state.reasoningByItemId}
                  sourcesByItemId={state.sourcesByItemId}
                  toolStatuses={toolStatuses}
                  isThinking={isThinking}
                  hasMoreHistory={hasMoreHistory}
                  loadingMoreHistory={loadingMoreHistory}
                  onLoadMoreHistory={handleLoadMoreHistory}
                />

                <PromptComposer
                  disabled={!state.authMode || isThinking}
                  sending={sending}
                  thinking={isThinking}
                  canInterrupt={!!state.activeTurnId}
                  onSend={handleSend}
                  onInterrupt={handleInterrupt}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
