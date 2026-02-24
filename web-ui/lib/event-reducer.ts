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
  itemId: string;
  tool: string;
  status: "inProgress" | "completed" | "failed";
  detail?: string;
}

export interface ChatState {
  authMode: string | null;
  currentThreadId: string | null;
  activeTurnId: string | null;
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
  | { type: "clear-active-turn" }
  | { type: "append-user-message"; threadId: string; text: string; attachments?: ThreadHistoryAttachment[] }
  | { type: "apply-ui-event"; event: UiEvent }
  | { type: "consume-command-approval"; requestId: string }
  | { type: "consume-file-approval"; requestId: string };

export const initialChatState: ChatState = {
  authMode: null,
  currentThreadId: null,
  activeTurnId: null,
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

function buildAssistantMap(messages: ChatMessage[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const message of messages) {
    if (message.role === "assistant" && message.itemId) {
      map[message.itemId] = message.id;
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
      return {
        ...state,
        threads: limitRecentThreads(action.threads),
        currentThreadId: state.currentThreadId ?? action.threads[0]?.id ?? null,
      };
    }
    case "select-thread": {
      return {
        ...state,
        currentThreadId: action.threadId,
      };
    }
    case "set-active-turn": {
      return {
        ...state,
        currentThreadId: action.threadId,
        activeTurnId: action.turnId,
      };
    }
    case "clear-active-turn": {
      return {
        ...state,
        activeTurnId: null,
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
          ...buildAssistantMap(pageMessages),
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
          ...buildAssistantMap(action.messages),
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
      return {
        ...state,
        currentThreadId: event.payload.threadId,
        activeTurnId: event.payload.turnId,
      };
    }
    case "agent.delta": {
      const threadId = state.currentThreadId ?? "default";
      const list = state.messagesByThreadId[threadId] ?? [];
      const existingMessageId = state.assistantMessageIdByItemId[event.payload.itemId];

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
          [event.payload.itemId]: messageId,
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
    case "reasoning.delta":
      return {
        ...state,
        reasoningByItemId: {
          ...state.reasoningByItemId,
          [event.payload.itemId]: `${state.reasoningByItemId[event.payload.itemId] ?? ""}${event.payload.text}`,
        },
      };
    case "sources.updated":
      return {
        ...state,
        sourcesByItemId: {
          ...state.sourcesByItemId,
          [event.payload.itemId]: event.payload.sources,
        },
      };
    case "tool.status":
      return {
        ...state,
        toolStatusesByItemId: {
          ...state.toolStatusesByItemId,
          [event.payload.itemId]: {
            itemId: event.payload.itemId,
            tool: event.payload.tool,
            status: event.payload.status,
            detail: event.payload.detail,
          },
        },
      };
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
    case "turn.completed":
      return {
        ...state,
        activeTurnId: null,
      };
    case "error":
      return {
        ...state,
        errors: [...state.errors, `${event.payload.code}: ${event.payload.message}`],
      };
    default:
      return state;
  }
}
