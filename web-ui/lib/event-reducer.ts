import type {
  CommandApprovalPayload,
  FileApprovalPayload,
  SourceRef,
  ThreadHistoryAttachment,
  ThreadSummary,
  UiEvent,
} from "@codex-app/shared-contracts";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  itemId?: string;
  attachments?: ThreadHistoryAttachment[];
}

export interface ToolStatusView {
  threadId: string;
  itemId: string;
  tool: string;
  status: "inProgress" | "completed" | "failed";
  detail?: string;
}

export interface ChatState {
  authMode: string | null;
  currentThreadId: string | null;
  activeTurnId: string | null;
  activeTurnIdByThreadId: Record<string, string>;
  threads: ThreadSummary[];
  messagesByThreadId: Record<string, ChatMessage[]>;
  assistantMessageIdByItemId: Record<string, string>;
  historyNextCursorByThreadId: Record<string, string | null>;
  historyLoadedByThreadId: Record<string, boolean>;
  reasoningByItemId: Record<string, string>;
  sourcesByItemId: Record<string, SourceRef[]>;
  toolStatusesByItemId: Record<string, ToolStatusView>;
  commandApprovals: CommandApprovalPayload[];
  fileApprovals: FileApprovalPayload[];
  errors: string[];
}

export type ChatAction =
  | { type: "hydrate-threads"; threads: ThreadSummary[] }
  | {
      type: "replace-thread-history-page";
      threadId: string;
      messages: ChatMessage[];
      nextCursor: string | null;
    }
  | {
      type: "prepend-thread-history-page";
      threadId: string;
      messages: ChatMessage[];
      nextCursor: string | null;
    }
  | { type: "select-thread"; threadId: string }
  | { type: "set-active-turn"; threadId: string; turnId: string }
  | { type: "clear-active-turn"; threadId?: string }
  | { type: "append-user-message"; threadId: string; text: string; attachments?: ThreadHistoryAttachment[] }
  | { type: "apply-ui-event"; event: UiEvent }
  | { type: "consume-command-approval"; requestId: string }
  | { type: "consume-file-approval"; requestId: string };

export const initialChatState: ChatState = {
  authMode: null,
  currentThreadId: null,
  activeTurnId: null,
  activeTurnIdByThreadId: {},
  threads: [],
  messagesByThreadId: {},
  assistantMessageIdByItemId: {},
  historyNextCursorByThreadId: {},
  historyLoadedByThreadId: {},
  reasoningByItemId: {},
  sourcesByItemId: {},
  toolStatusesByItemId: {},
  commandApprovals: [],
  fileApprovals: [],
  errors: [],
};

const MAX_VISIBLE_THREADS = 10;

function limitRecentThreads(threads: ThreadSummary[]): ThreadSummary[] {
  return threads.slice(0, MAX_VISIBLE_THREADS);
}

function toItemThreadKey(threadId: string, itemId: string): string {
  return `${threadId}:${itemId}`;
}

function buildAssistantMap(messages: ChatMessage[], threadId: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const message of messages) {
    if (message.role === "assistant" && message.itemId) {
      map[toItemThreadKey(threadId, message.itemId)] = message.id;
    }
  }
  return map;
}

function mergeUniqueMessages(olderMessages: ChatMessage[], currentMessages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];
  const seen = new Set<string>();

  for (const message of [...olderMessages, ...currentMessages]) {
    if (seen.has(message.id)) {
      continue;
    }

    seen.add(message.id);
    merged.push(message);
  }

  return merged;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "hydrate-threads": {
      const currentThreadId = state.currentThreadId ?? action.threads[0]?.id ?? null;
      return {
        ...state,
        threads: limitRecentThreads(action.threads),
        currentThreadId,
        activeTurnId: currentThreadId ? (state.activeTurnIdByThreadId[currentThreadId] ?? null) : null,
      };
    }
    case "select-thread": {
      return {
        ...state,
        currentThreadId: action.threadId,
        activeTurnId: state.activeTurnIdByThreadId[action.threadId] ?? null,
      };
    }
    case "set-active-turn": {
      return {
        ...state,
        activeTurnIdByThreadId: {
          ...state.activeTurnIdByThreadId,
          [action.threadId]: action.turnId,
        },
        activeTurnId:
          state.currentThreadId === action.threadId || !state.currentThreadId
            ? action.turnId
            : state.activeTurnId,
      };
    }
    case "clear-active-turn": {
      const targetThreadId = action.threadId ?? state.currentThreadId;
      if (!targetThreadId) {
        return {
          ...state,
          activeTurnId: null,
        };
      }

      const nextActiveTurnByThreadId = { ...state.activeTurnIdByThreadId };
      delete nextActiveTurnByThreadId[targetThreadId];

      return {
        ...state,
        activeTurnIdByThreadId: nextActiveTurnByThreadId,
        activeTurnId: state.currentThreadId ? (nextActiveTurnByThreadId[state.currentThreadId] ?? null) : null,
      };
    }
    case "replace-thread-history-page": {
      const pageMessages = [...action.messages];
      return {
        ...state,
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [action.threadId]: pageMessages,
        },
        assistantMessageIdByItemId: {
          ...state.assistantMessageIdByItemId,
          ...buildAssistantMap(pageMessages, action.threadId),
        },
        historyNextCursorByThreadId: {
          ...state.historyNextCursorByThreadId,
          [action.threadId]: action.nextCursor,
        },
        historyLoadedByThreadId: {
          ...state.historyLoadedByThreadId,
          [action.threadId]: true,
        },
      };
    }
    case "prepend-thread-history-page": {
      const currentMessages = state.messagesByThreadId[action.threadId] ?? [];
      const mergedMessages = mergeUniqueMessages(action.messages, currentMessages);

      return {
        ...state,
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [action.threadId]: mergedMessages,
        },
        assistantMessageIdByItemId: {
          ...state.assistantMessageIdByItemId,
          ...buildAssistantMap(action.messages, action.threadId),
        },
        historyNextCursorByThreadId: {
          ...state.historyNextCursorByThreadId,
          [action.threadId]: action.nextCursor,
        },
      };
    }
    case "append-user-message": {
      const list = state.messagesByThreadId[action.threadId] ?? [];
      return {
        ...state,
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [action.threadId]: [
            ...list,
            {
              id: `user-${Date.now()}`,
              role: "user",
              text: action.text,
              createdAt: Date.now(),
              attachments: action.attachments,
            },
          ],
        },
      };
    }
    case "apply-ui-event": {
      return applyUiEvent(state, action.event);
    }
    case "consume-command-approval": {
      return {
        ...state,
        commandApprovals: state.commandApprovals.filter((item) => item.requestId !== action.requestId),
      };
    }
    case "consume-file-approval": {
      return {
        ...state,
        fileApprovals: state.fileApprovals.filter((item) => item.requestId !== action.requestId),
      };
    }
    default:
      return state;
  }
}

function applyUiEvent(state: ChatState, event: UiEvent): ChatState {
  switch (event.type) {
    case "auth.updated":
      return {
        ...state,
        authMode: event.payload.authMode,
      };
    case "thread.started": {
      if (state.threads.some((thread) => thread.id === event.payload.threadId)) {
        return {
          ...state,
          currentThreadId: event.payload.threadId,
        };
      }

      return {
        ...state,
        currentThreadId: event.payload.threadId,
        threads: limitRecentThreads([{ id: event.payload.threadId }, ...state.threads]),
      };
    }
    case "turn.started": {
      const nextActiveTurnByThreadId = {
        ...state.activeTurnIdByThreadId,
        [event.payload.threadId]: event.payload.turnId,
      };

      return {
        ...state,
        activeTurnIdByThreadId: nextActiveTurnByThreadId,
        activeTurnId: state.currentThreadId ? (nextActiveTurnByThreadId[state.currentThreadId] ?? null) : null,
      };
    }
    case "agent.delta": {
      const threadId = event.payload.threadId;
      const list = state.messagesByThreadId[threadId] ?? [];
      const itemKey = toItemThreadKey(threadId, event.payload.itemId);
      const existingMessageId = state.assistantMessageIdByItemId[itemKey];

      if (existingMessageId) {
        return {
          ...state,
          messagesByThreadId: {
            ...state.messagesByThreadId,
            [threadId]: list.map((message) =>
              message.id === existingMessageId
                ? {
                    ...message,
                    text: `${message.text}${event.payload.text}`,
                  }
                : message,
            ),
          },
        };
      }

      const messageId = `assistant-${event.payload.itemId}`;
      return {
        ...state,
        assistantMessageIdByItemId: {
          ...state.assistantMessageIdByItemId,
          [itemKey]: messageId,
        },
        messagesByThreadId: {
          ...state.messagesByThreadId,
          [threadId]: [
            ...list,
            {
              id: messageId,
              role: "assistant",
              text: event.payload.text,
              createdAt: Date.now(),
              itemId: event.payload.itemId,
            },
          ],
        },
      };
    }
    case "reasoning.delta": {
      const reasoningKey = toItemThreadKey(event.payload.threadId, event.payload.itemId);
      return {
        ...state,
        reasoningByItemId: {
          ...state.reasoningByItemId,
          [reasoningKey]: `${state.reasoningByItemId[reasoningKey] ?? ""}${event.payload.text}`,
        },
      };
    }
    case "sources.updated": {
      const sourceKey = toItemThreadKey(event.payload.threadId, event.payload.itemId);
      return {
        ...state,
        sourcesByItemId: {
          ...state.sourcesByItemId,
          [sourceKey]: event.payload.sources,
        },
      };
    }
    case "tool.status": {
      const toolStatusKey = toItemThreadKey(event.payload.threadId, event.payload.itemId);
      return {
        ...state,
        toolStatusesByItemId: {
          ...state.toolStatusesByItemId,
          [toolStatusKey]: {
            threadId: event.payload.threadId,
            itemId: event.payload.itemId,
            tool: event.payload.tool,
            status: event.payload.status,
            detail: event.payload.detail,
          },
        },
      };
    }
    case "approval.command.requested":
      return {
        ...state,
        commandApprovals: [...state.commandApprovals, event.payload],
      };
    case "approval.filechange.requested":
      return {
        ...state,
        fileApprovals: [...state.fileApprovals, event.payload],
      };
    case "turn.completed": {
      const nextActiveTurnByThreadId = { ...state.activeTurnIdByThreadId };
      delete nextActiveTurnByThreadId[event.payload.threadId];
      return {
        ...state,
        activeTurnIdByThreadId: nextActiveTurnByThreadId,
        activeTurnId: state.currentThreadId ? (nextActiveTurnByThreadId[state.currentThreadId] ?? null) : null,
      };
    }
    case "error":
      return {
        ...state,
        errors: [...state.errors, `${event.payload.code}: ${event.payload.message}`],
      };
    default:
      return state;
  }
}
