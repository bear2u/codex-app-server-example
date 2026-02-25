"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type {
  CommandApprovalDecision,
  FileApprovalDecision,
  TurnInputItem,
  UiEvent,
  UiEventEnvelope,
} from "@codex-app/shared-contracts";
import {
  approveCommand,
  approveFileChange,
  createThread,
  interruptTurn,
  listModels,
  listThreadMessages,
  listThreads,
  readAuthState,
  resumeThread,
  startTurn,
} from "@/lib/api-client";
import { chatReducer, initialChatState } from "@/lib/event-reducer";
import { connectUiEventStream } from "@/lib/sse-client";
import { ApprovalBanner } from "./approval-banner";
import { LogPanel, type UiLogEntry } from "./log-panel";
import { MessageList } from "./message-list";
import { PromptComposer, type PromptComposerImageAttachment } from "./prompt-composer";
import { ThreadSidebar } from "./thread-sidebar";

const THREAD_LIST_LIMIT = 10;
const WORKSPACE_BY_THREAD_STORAGE_KEY = "codex.workspaceByThreadId";
const NEW_THREAD_WORKSPACE_STORAGE_KEY = "codex.newThreadWorkspaceDraft";
const HEADER_COLLAPSED_STORAGE_KEY = "codex.headerCollapsed";
const SELECTED_MODEL_STORAGE_KEY = "codex.selectedModel";
const LOG_PANEL_ENABLED_STORAGE_KEY = "codex.logPanelEnabled";
const MAX_UI_LOG_ENTRIES = 300;

function normalizeCwd(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function summarizeUiEvent(event: UiEvent): { message: string; detail?: string; level: UiLogEntry["level"] } {
  switch (event.type) {
    case "auth.updated":
      return {
        message: "auth.updated",
        detail: `authMode=${event.payload.authMode ?? "none"}`,
        level: "info",
      };
    case "thread.started":
      return {
        message: "thread.started",
        detail: `threadId=${event.payload.threadId}`,
        level: "info",
      };
    case "turn.started":
      return {
        message: "turn.started",
        detail: `threadId=${event.payload.threadId} turnId=${event.payload.turnId}`,
        level: "info",
      };
    case "turn.completed":
      return {
        message: "turn.completed",
        detail: `threadId=${event.payload.threadId} turnId=${event.payload.turnId} status=${event.payload.status}`,
        level: event.payload.status === "failed" ? "error" : "info",
      };
    case "tool.status":
      return {
        message: "tool.status",
        detail: `itemId=${event.payload.itemId} tool=${event.payload.tool} status=${event.payload.status}`,
        level: event.payload.status === "failed" ? "error" : "info",
      };
    case "sources.updated":
      return {
        message: "sources.updated",
        detail: `itemId=${event.payload.itemId} count=${event.payload.sources.length}`,
        level: "info",
      };
    case "approval.command.requested":
      return {
        message: "approval.command.requested",
        detail: `requestId=${event.payload.requestId} turnId=${event.payload.turnId}`,
        level: "warn",
      };
    case "approval.filechange.requested":
      return {
        message: "approval.filechange.requested",
        detail: `requestId=${event.payload.requestId} turnId=${event.payload.turnId}`,
        level: "warn",
      };
    case "agent.delta":
      return {
        message: "agent.delta",
        detail: `itemId=${event.payload.itemId} chars=${event.payload.text.length}`,
        level: "info",
      };
    case "reasoning.delta":
      return {
        message: "reasoning.delta",
        detail: `itemId=${event.payload.itemId} chars=${event.payload.text.length}`,
        level: "info",
      };
    case "error":
      return {
        message: "error",
        detail: `${event.payload.code}: ${event.payload.message}`,
        level: "error",
      };
    default:
      return { message: "unknown", level: "info" };
  }
}

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
  const [workspaceCopyStatus, setWorkspaceCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [workspaceSaveStatus, setWorkspaceSaveStatus] = useState<"idle" | "saved">("idle");
  const [workspaceByThreadId, setWorkspaceByThreadId] = useState<Record<string, string>>({});
  const [newThreadWorkspaceDraft, setNewThreadWorkspaceDraft] = useState("");
  const [currentWorkspaceDraft, setCurrentWorkspaceDraft] = useState("");
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [modelOptions, setModelOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [logsEnabled, setLogsEnabled] = useState(true);
  const [uiLogs, setUiLogs] = useState<UiLogEntry[]>([]);
  const logsEnabledRef = useRef(true);
  const streamDeltaSeenRef = useRef(new Set<string>());

  const appendLog = useCallback((entry: Omit<UiLogEntry, "id" | "ts">) => {
    if (!logsEnabledRef.current) {
      return;
    }

    const nextEntry: UiLogEntry = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      ts: Date.now(),
    };

    setUiLogs((prev) => {
      const next = [...prev, nextEntry];
      if (next.length > MAX_UI_LOG_ENTRIES) {
        return next.slice(next.length - MAX_UI_LOG_ENTRIES);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const savedMapRaw = window.localStorage.getItem(WORKSPACE_BY_THREAD_STORAGE_KEY);
      if (savedMapRaw) {
        const parsed = JSON.parse(savedMapRaw) as Record<string, unknown>;
        const restored: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
          if (typeof value === "string") {
            restored[key] = value;
          }
        }
        setWorkspaceByThreadId(restored);
      }

      const savedDraft = window.localStorage.getItem(NEW_THREAD_WORKSPACE_STORAGE_KEY);
      if (savedDraft) {
        setNewThreadWorkspaceDraft(savedDraft);
      }

      const savedHeaderCollapsed = window.localStorage.getItem(HEADER_COLLAPSED_STORAGE_KEY);
      if (savedHeaderCollapsed === "1") {
        setIsHeaderCollapsed(true);
      }

      const savedSelectedModel = window.localStorage.getItem(SELECTED_MODEL_STORAGE_KEY);
      if (savedSelectedModel) {
        setSelectedModel(savedSelectedModel);
      }

      const savedLogPanelEnabled = window.localStorage.getItem(LOG_PANEL_ENABLED_STORAGE_KEY);
      if (savedLogPanelEnabled === "0") {
        setLogsEnabled(false);
      }
    } catch {
      // Ignore storage parse issues; user can re-enter workspace paths.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(WORKSPACE_BY_THREAD_STORAGE_KEY, JSON.stringify(workspaceByThreadId));
  }, [workspaceByThreadId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(NEW_THREAD_WORKSPACE_STORAGE_KEY, newThreadWorkspaceDraft);
  }, [newThreadWorkspaceDraft]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(HEADER_COLLAPSED_STORAGE_KEY, isHeaderCollapsed ? "1" : "0");
  }, [isHeaderCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (selectedModel) {
      window.localStorage.setItem(SELECTED_MODEL_STORAGE_KEY, selectedModel);
    } else {
      window.localStorage.removeItem(SELECTED_MODEL_STORAGE_KEY);
    }
  }, [selectedModel]);

  useEffect(() => {
    logsEnabledRef.current = logsEnabled;

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(LOG_PANEL_ENABLED_STORAGE_KEY, logsEnabled ? "1" : "0");
  }, [logsEnabled]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const [auth, threads] = await Promise.all([readAuthState(), listThreads({ limit: THREAD_LIST_LIMIT })]);

        if (!mounted) {
          return;
        }

        appendLog({
          source: "network",
          level: "info",
          message: "bootstrap loaded",
          detail: `authMode=${auth.authMode ?? "none"} threads=${threads.data.length}`,
        });

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
          appendLog({
            source: "network",
            level: "info",
            message: "thread history loaded",
            detail: `threadId=${initialThreadId} messages=${page.data.length}`,
          });
        }
      } catch (bootstrapError) {
        if (mounted) {
          setError(bootstrapError instanceof Error ? bootstrapError.message : "Failed to bootstrap chat UI");
        }
        appendLog({
          source: "network",
          level: "error",
          message: "bootstrap failed",
          detail: bootstrapError instanceof Error ? bootstrapError.message : "Unknown bootstrap error",
        });
      } finally {
        try {
          const models = await listModels({ limit: 50 });
          if (mounted) {
            const options = models.data.map((model) => ({
              id: model.id,
              label: model.displayName ? `${model.displayName} (${model.id})` : model.id,
            }));
            setModelOptions(options);
            setSelectedModel((prev) => {
              if (prev && options.some((option) => option.id === prev)) {
                return prev;
              }
              return options[0]?.id ?? "";
            });
          }
          appendLog({
            source: "network",
            level: "info",
            message: "model list loaded",
            detail: `models=${models.data.length}`,
          });
        } catch {
          if (mounted) {
            setModelOptions([]);
          }
          appendLog({
            source: "network",
            level: "warn",
            message: "model list unavailable",
          });
        }

        if (mounted) {
          setLoadingThreadHistoryId(null);
          setLoading(false);
          setModelsLoading(false);
        }
      }
    };

    void bootstrap();

    const disconnect = connectUiEventStream(
      (event: UiEvent, envelope: UiEventEnvelope) => {
        if (mounted) {
          setStreamDisconnected(false);
          setServerConnection("connected");
          if (event.type === "agent.delta" || event.type === "turn.completed" || event.type === "error") {
            setIsAwaitingAssistant(false);
          }
        }

        if (event.type === "agent.delta" || event.type === "reasoning.delta") {
          const streamKey = `${event.type}:${event.payload.itemId}`;
          if (!streamDeltaSeenRef.current.has(streamKey)) {
            streamDeltaSeenRef.current.add(streamKey);
            const summary = summarizeUiEvent(event);
            appendLog({
              source: "sse",
              level: summary.level,
              message: `${summary.message}#${envelope.id}`,
              detail: summary.detail,
            });
          }
        } else {
          const summary = summarizeUiEvent(event);
          appendLog({
            source: "sse",
            level: summary.level,
            message: `${summary.message}#${envelope.id}`,
            detail: summary.detail,
          });
        }

        if (event.type === "turn.completed") {
          streamDeltaSeenRef.current.clear();
        }

        dispatch({ type: "apply-ui-event", event });
      },
      () => {
        if (mounted) {
          setStreamDisconnected(true);
          setServerConnection("reconnecting");
        }
        appendLog({
          source: "sse",
          level: "warn",
          message: "event stream disconnected",
        });
      },
      () => {
        if (mounted) {
          setStreamDisconnected(false);
          setServerConnection("connected");
        }
        appendLog({
          source: "sse",
          level: "info",
          message: "event stream connected",
        });
      },
    );

    return () => {
      mounted = false;
      disconnect();
    };
  }, [appendLog]);

  const currentThreadId = state.currentThreadId;
  const currentMessages = currentThreadId ? (state.messagesByThreadId[currentThreadId] ?? []) : [];
  const currentHistoryNextCursor = currentThreadId ? (state.historyNextCursorByThreadId[currentThreadId] ?? null) : null;
  const currentThreadWorkspace = currentThreadId ? (workspaceByThreadId[currentThreadId] ?? "") : "";
  const hasMoreHistory = Boolean(currentHistoryNextCursor);
  const loadingMoreHistory = !!currentThreadId && loadingMoreHistoryThreadId === currentThreadId;
  const normalizedWorkspaceDraft = normalizeCwd(currentWorkspaceDraft) ?? "";
  const normalizedCurrentWorkspace = normalizeCwd(currentThreadWorkspace) ?? "";
  const hasWorkspaceChanges = normalizedWorkspaceDraft !== normalizedCurrentWorkspace;

  const toolStatuses = useMemo(() => Object.values(state.toolStatusesByItemId), [state.toolStatusesByItemId]);
  const isThinking = sending || isAwaitingAssistant || !!state.activeTurnId;

  const resolveThreadCwd = (threadId: string | null): string | undefined => {
    if (!threadId) {
      return normalizeCwd(newThreadWorkspaceDraft);
    }
    return normalizeCwd(workspaceByThreadId[threadId] ?? "");
  };

  const handleNewThreadWorkspacePathChange = (value: string) => {
    setNewThreadWorkspaceDraft(value);
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    appendLog({
      source: "ui",
      level: "info",
      message: "model selected",
      detail: `model=${model || "default"}`,
    });
  };

  useEffect(() => {
    setCurrentWorkspaceDraft(currentThreadWorkspace);
    setWorkspaceSaveStatus("idle");
  }, [currentThreadId, currentThreadWorkspace]);

  const ensureThread = async (): Promise<string> => {
    if (state.currentThreadId) {
      try {
        await resumeThread(state.currentThreadId);
        return state.currentThreadId;
      } catch {
        // If a persisted thread cannot be resumed (e.g. missing from loaded context), create a fresh one.
      }
    }

    const threadCwd = resolveThreadCwd(null);
    const model = selectedModel || undefined;
    const created = await createThread({
      ...(threadCwd ? { cwd: threadCwd } : {}),
      ...(model ? { model } : {}),
    });
    if (threadCwd) {
      setWorkspaceByThreadId((prev) => ({
        ...prev,
        [created.threadId]: threadCwd,
      }));
    }
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
      const threadCwd = normalizeCwd(newThreadWorkspaceDraft);
      const model = selectedModel || undefined;
      const created = await createThread({
        ...(threadCwd ? { cwd: threadCwd } : {}),
        ...(model ? { model } : {}),
      });
      if (threadCwd) {
        setWorkspaceByThreadId((prev) => ({
          ...prev,
          [created.threadId]: threadCwd,
        }));
      }
      dispatch({ type: "select-thread", threadId: created.threadId });
      dispatch({
        type: "replace-thread-history-page",
        threadId: created.threadId,
        messages: [],
        nextCursor: null,
      });
      appendLog({
        source: "ui",
        level: "info",
        message: "thread created",
        detail: `threadId=${created.threadId}${model ? ` model=${model}` : ""}${threadCwd ? ` cwd=${threadCwd}` : ""}`,
      });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create thread");
      appendLog({
        source: "ui",
        level: "error",
        message: "thread create failed",
        detail: createError instanceof Error ? createError.message : "Unknown error",
      });
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
        appendLog({
          source: "network",
          level: "info",
          message: "thread history loaded",
          detail: `threadId=${threadId} messages=${page.data.length}`,
        });
      }

      await resumeThread(threadId);
      appendLog({
        source: "ui",
        level: "info",
        message: "thread selected",
        detail: `threadId=${threadId}`,
      });
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Failed to resume thread");
      appendLog({
        source: "ui",
        level: "error",
        message: "thread select/resume failed",
        detail: resumeError instanceof Error ? resumeError.message : "Unknown error",
      });
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
      appendLog({
        source: "network",
        level: "info",
        message: "thread history prepended",
        detail: `threadId=${threadId} messages=${page.data.length}`,
      });
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Failed to load more history");
      appendLog({
        source: "network",
        level: "error",
        message: "load more history failed",
        detail: historyError instanceof Error ? historyError.message : "Unknown error",
      });
    } finally {
      setLoadingMoreHistoryThreadId(null);
    }
  };

  const handleSend = async ({
    text,
    attachments,
  }: {
    text: string;
    attachments: PromptComposerImageAttachment[];
  }) => {
    setError(null);
    setSending(true);
    setIsAwaitingAssistant(true);

    try {
      const normalizedText = text.trim();
      const input: TurnInputItem[] = [];
      if (normalizedText) {
        input.push({ type: "text", text: normalizedText });
      }
      if (attachments.length) {
        input.push(...attachments.map((attachment) => ({ type: "image" as const, url: attachment.url })));
      }
      if (!input.length) {
        setIsAwaitingAssistant(false);
        return;
      }

      const threadId = await ensureThread();
      dispatch({
        type: "append-user-message",
        threadId,
        text: normalizedText,
        attachments: attachments.map((attachment) => ({ type: "image", url: attachment.url })),
      });

      const threadCwd = resolveThreadCwd(threadId);
      appendLog({
        source: "ui",
        level: "info",
        message: "turn.start requested",
        detail: `threadId=${threadId}${selectedModel ? ` model=${selectedModel}` : ""}${threadCwd ? ` cwd=${threadCwd}` : ""} input=${input.length}`,
      });
      const started = await startTurn(threadId, {
        input,
        model: selectedModel || undefined,
        cwd: threadCwd,
      });
      // Keep interrupt state usable even if turn/started SSE arrives late or is briefly missed.
      dispatch({ type: "set-active-turn", threadId, turnId: started.turnId });
      appendLog({
        source: "network",
        level: "info",
        message: "turn.start accepted",
        detail: `threadId=${threadId} turnId=${started.turnId}`,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Failed to start turn");
      setIsAwaitingAssistant(false);
      dispatch({ type: "clear-active-turn" });
      appendLog({
        source: "network",
        level: "error",
        message: "turn.start failed",
        detail: sendError instanceof Error ? sendError.message : "Unknown error",
      });
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
      dispatch({ type: "clear-active-turn" });
      setIsAwaitingAssistant(false);
      appendLog({
        source: "ui",
        level: "warn",
        message: "turn interrupted",
        detail: `threadId=${state.currentThreadId} turnId=${state.activeTurnId}`,
      });
    } catch (interruptError) {
      setError(interruptError instanceof Error ? interruptError.message : "Failed to stop turn");
      appendLog({
        source: "network",
        level: "error",
        message: "turn interrupt failed",
        detail: interruptError instanceof Error ? interruptError.message : "Unknown error",
      });
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

  const handleCopyWorkspacePath = async () => {
    const workspace = normalizeCwd(currentWorkspaceDraft);
    if (!workspace) {
      return;
    }

    try {
      await navigator.clipboard.writeText(workspace);
      setWorkspaceCopyStatus("copied");
    } catch {
      setWorkspaceCopyStatus("failed");
    }

    setTimeout(() => {
      setWorkspaceCopyStatus("idle");
    }, 1800);
  };

  const handleCurrentThreadWorkspaceChange = (value: string) => {
    setCurrentWorkspaceDraft(value);
    setWorkspaceSaveStatus("idle");
  };

  const handleSaveCurrentThreadWorkspace = () => {
    if (!currentThreadId) {
      return;
    }

    const normalized = normalizeCwd(currentWorkspaceDraft);
    setWorkspaceByThreadId((prev) => {
      const next = { ...prev };
      if (!normalized) {
        delete next[currentThreadId];
      } else {
        next[currentThreadId] = normalized;
      }
      return next;
    });

    setCurrentWorkspaceDraft(normalized ?? "");
    setWorkspaceSaveStatus("saved");
    setTimeout(() => {
      setWorkspaceSaveStatus("idle");
    }, 1800);
  };

  return (
    <main className="min-h-dvh w-full bg-[radial-gradient(circle_at_top_right,var(--sky-soft),transparent_40%),radial-gradient(circle_at_bottom_left,var(--teal-soft),transparent_35%),var(--background)] p-2 text-[var(--foreground)] sm:p-4">
      <div className="mx-auto flex h-[calc(100dvh-1rem)] max-w-[1440px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-xl sm:h-[calc(100dvh-2rem)]">
        <div
          aria-hidden={!isSidebarOpen}
          onClick={() => setIsSidebarOpen(false)}
          className={`fixed inset-0 z-40 bg-slate-900/35 transition-opacity duration-200 md:hidden ${
            isSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        />
        <div
          className={`fixed inset-y-0 left-0 z-50 w-[min(86vw,20rem)] transform transition-transform duration-200 md:hidden ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <ThreadSidebar
            threads={state.threads}
            currentThreadId={state.currentThreadId}
            newThreadWorkspacePath={newThreadWorkspaceDraft}
            isMobileDrawer
            onCloseMobile={() => setIsSidebarOpen(false)}
            onSelectThread={(threadId) => {
              void handleSelectThread(threadId);
              setIsSidebarOpen(false);
            }}
            onNewThreadWorkspacePathChange={handleNewThreadWorkspacePathChange}
            onCreateThread={() => {
              void handleCreateThread();
              setIsSidebarOpen(false);
            }}
          />
        </div>

        <div className="hidden h-full w-[18rem] md:flex">
          <ThreadSidebar
            threads={state.threads}
            currentThreadId={state.currentThreadId}
            newThreadWorkspacePath={newThreadWorkspaceDraft}
            onSelectThread={(threadId) => {
              void handleSelectThread(threadId);
            }}
            onNewThreadWorkspacePathChange={handleNewThreadWorkspacePathChange}
            onCreateThread={() => {
              void handleCreateThread();
            }}
          />
        </div>

        <section className="relative flex min-w-0 flex-1 flex-col p-3 md:p-6">
          {!isHeaderCollapsed ? (
            <header className="mb-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)]/90 p-3 shadow-sm md:mb-4 md:p-4">
              <div className="flex flex-wrap items-start gap-2 sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Codex Chat Console</h1>
                  <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Auth: <span className="font-semibold">{state.authMode ?? "not authenticated"}</span>
                  </p>
                </div>

                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                  <div
                    className={`inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold sm:w-auto ${
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

                  <button
                    type="button"
                    onClick={() => setIsSidebarOpen(true)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] md:hidden"
                  >
                    Threads
                  </button>

                  <button
                    type="button"
                    onClick={() => setLogsEnabled((prev) => !prev)}
                    className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                      logsEnabled
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-strong)]"
                        : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--panel-strong)]"
                    }`}
                  >
                    Logs {logsEnabled ? "On" : "Off"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsHeaderCollapsed(true)}
                    className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  >
                    접기
                  </button>
                </div>
              </div>

              {currentThreadId ? (
                <div className="mt-3 grid gap-2 sm:gap-3 lg:grid-cols-2">
                  <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]/50 px-2 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[var(--muted-foreground)]">Thread ID</span>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopyThreadId();
                        }}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--panel)]"
                      >
                        Copy
                      </button>
                    </div>
                    <code className="mt-1 block min-w-0 break-all text-xs font-semibold text-[var(--foreground)] sm:truncate">
                      {currentThreadId}
                    </code>
                    <div className="mt-1 min-h-4">
                      {threadCopyStatus === "copied" ? (
                        <span className="text-xs text-emerald-700">Copied</span>
                      ) : null}
                      {threadCopyStatus === "failed" ? (
                        <span className="text-xs text-rose-700">Failed</span>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]/50 px-2 py-2">
                    <span className="text-xs text-[var(--muted-foreground)]">Workspace</span>
                    <input
                      type="text"
                      value={currentWorkspaceDraft}
                      onChange={(event) => handleCurrentThreadWorkspaceChange(event.target.value)}
                      placeholder="/absolute/path/to/workspace"
                      className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-xs font-semibold text-[var(--foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)]"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!currentThreadId || !hasWorkspaceChanges}
                        onClick={handleSaveCurrentThreadWorkspace}
                        className="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-2 py-1 text-xs font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        disabled={!normalizeCwd(currentWorkspaceDraft)}
                        onClick={() => {
                          void handleCopyWorkspacePath();
                        }}
                        className="rounded-md border border-[var(--border)] px-2 py-1 text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--panel)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Copy
                      </button>
                      {workspaceSaveStatus === "saved" ? <span className="text-xs text-emerald-700">Saved</span> : null}
                      {workspaceCopyStatus === "copied" ? <span className="text-xs text-emerald-700">Copied</span> : null}
                      {workspaceCopyStatus === "failed" ? <span className="text-xs text-rose-700">Failed</span> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]/50 px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  선택된 스레드가 없습니다.
                </div>
              )}
            </header>
          ) : null}

          {isHeaderCollapsed ? (
            <div className="pointer-events-none absolute right-3 top-3 z-20 md:right-6 md:top-6">
              <button
                type="button"
                onClick={() => setIsHeaderCollapsed(false)}
                className="pointer-events-auto inline-flex min-h-10 items-center rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--accent-foreground)] transition-colors hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              >
                펼치기
              </button>
            </div>
          ) : null}

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

              <div className={`flex min-h-0 flex-1 gap-3 md:gap-4 ${isHeaderCollapsed ? "mt-0" : "mt-3 md:mt-4"}`}>
                <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
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
                    modelOptions={modelOptions}
                    selectedModel={selectedModel}
                    modelsLoading={modelsLoading}
                    onModelChange={handleModelChange}
                    onSend={handleSend}
                    onInterrupt={handleInterrupt}
                  />
                </div>

                {logsEnabled ? (
                  <div className="hidden min-h-0 w-[22rem] lg:flex">
                    <LogPanel
                      entries={uiLogs}
                      logsEnabled={logsEnabled}
                      onToggleLogs={() => setLogsEnabled((prev) => !prev)}
                      onClearLogs={() => setUiLogs([])}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
