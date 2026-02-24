import type {
  CreateThreadRequest,
  CreateThreadResponse,
  ThreadHistoryMessage,
  ThreadListRequest,
  ThreadListResponse,
  ThreadMessageListRequest,
  ThreadMessageListResponse,
  ThreadReadResponse,
} from "@codex-app/shared-contracts";
import type { Env } from "../config/env";
import { JsonRpcClient } from "../rpc/jsonrpc-client";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeTimestamp(value: number | undefined, fallback: number): number {
  if (typeof value !== "number") {
    return fallback;
  }

  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function extractUserText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  const chunks: string[] = [];
  for (const part of content) {
    if (!isRecord(part)) {
      continue;
    }

    if (part.type === "text") {
      const text = asString(part.text);
      if (text) {
        chunks.push(text);
      }
    }
  }

  return chunks.join("\n").trim();
}

function extractThreadMessages(threadId: string, thread: Record<string, unknown>): ThreadHistoryMessage[] {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const messages: ThreadHistoryMessage[] = [];

  for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
    const turn = turns[turnIndex];
    if (!isRecord(turn)) {
      continue;
    }

    const items = Array.isArray(turn.items) ? turn.items : [];
    const rawTimestamp =
      asNumber(turn.updatedAt) ??
      asNumber(turn.completedAt) ??
      asNumber(turn.createdAt) ??
      asNumber(turn.startedAt);
    // Keep fallback timestamps deterministic across pagination calls.
    const baseTimestamp = normalizeTimestamp(rawTimestamp, turnIndex * 1000);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      if (!isRecord(item)) {
        continue;
      }

      const itemType = asString(item.type);
      const itemId = asString(item.id);
      const createdAt = baseTimestamp + itemIndex;

      if (itemType === "userMessage") {
        const text = extractUserText(item.content);
        if (!text) {
          continue;
        }

        messages.push({
          id: itemId ?? `${threadId}-user-${turnIndex}-${itemIndex}`,
          role: "user",
          text,
          createdAt,
          itemId,
        });
        continue;
      }

      if (itemType === "agentMessage") {
        const text = asString(item.text) ?? "";
        if (!text) {
          continue;
        }

        messages.push({
          id: itemId ?? `${threadId}-assistant-${turnIndex}-${itemIndex}`,
          role: "assistant",
          text,
          createdAt,
          itemId,
        });
      }
    }
  }

  // Preserve natural thread/turn/item order from the source data.
  return messages;
}

export class ThreadService {
  constructor(
    private readonly rpc: JsonRpcClient,
    private readonly env: Env,
  ) {}

  async createThread(request: CreateThreadRequest): Promise<CreateThreadResponse> {
    const result = await this.rpc.request<{ thread: { id: string } }>("thread/start", {
      model: request.model ?? this.env.codexModel,
      cwd: request.cwd ?? this.env.codexCwd ?? process.cwd(),
      approvalPolicy: this.env.codexApprovalPolicy,
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: this.env.codexWritableRoots,
        networkAccess: this.env.codexNetworkAccess,
      },
      personality: request.personality,
    });

    return { threadId: result.thread.id };
  }

  async resumeThread(threadId: string, personality?: string): Promise<CreateThreadResponse> {
    const result = await this.rpc.request<{ thread: { id: string } }>("thread/resume", {
      threadId,
      personality,
      approvalPolicy: this.env.codexApprovalPolicy,
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: this.env.codexWritableRoots,
        networkAccess: this.env.codexNetworkAccess,
      },
    });

    return { threadId: result.thread.id };
  }

  async listThreads(request: ThreadListRequest): Promise<ThreadListResponse> {
    const result = await this.rpc.request<ThreadListResponse>("thread/list", {
      cursor: request.cursor ?? null,
      limit: request.limit ?? 30,
      sortKey: "updated_at",
    });

    return result;
  }

  async readThread(threadId: string): Promise<ThreadReadResponse> {
    const result = await this.rpc.request<ThreadReadResponse>("thread/read", {
      threadId,
      includeTurns: true,
    });

    return result;
  }

  async listThreadMessages(threadId: string, request: ThreadMessageListRequest): Promise<ThreadMessageListResponse> {
    const result = await this.readThread(threadId);
    const messages = extractThreadMessages(threadId, result.thread);
    const limit = Math.min(Math.max(request.limit ?? this.env.threadMessagesPageSize, 1), 100);
    const parsedCursor = request.cursor ? Number.parseInt(request.cursor, 10) : messages.length;
    const end = Number.isFinite(parsedCursor) ? Math.min(Math.max(parsedCursor, 0), messages.length) : messages.length;
    const start = Math.max(0, end - limit);
    const data = messages.slice(start, end);
    const nextCursor = start > 0 ? String(start) : null;

    return {
      data,
      nextCursor,
    };
  }
}
