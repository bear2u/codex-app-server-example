import type { SourceRef, UiEvent } from "@codex-app/shared-contracts";
import type { AppLogger } from "../types/logger";
import { UiEventBus } from "../utils/ui-event-bus";
import { JsonRpcClient } from "./jsonrpc-client";

export class NotificationRouter {
  private readonly turnIdToThreadId = new Map<string, string>();
  private readonly itemIdToThreadId = new Map<string, string>();
  private readonly turnIdToItemIds = new Map<string, Set<string>>();

  constructor(
    private readonly rpc: JsonRpcClient,
    private readonly eventBus: UiEventBus,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    this.rpc.on("notification", ({ method, params }) => {
      try {
        this.route(method, params ?? {});
      } catch (error) {
        this.logger.error({ err: error, method }, "Failed to route codex notification");
      }
    });
  }

  private route(method: string, params: Record<string, unknown>): void {
    switch (method) {
      case "account/updated": {
        const authMode = (params.authMode as string | null) ?? null;
        this.emit({ type: "auth.updated", payload: { authMode } });
        return;
      }
      case "thread/started": {
        const threadId = this.getNestedString(params, ["thread", "id"]);
        if (!threadId) {
          return;
        }
        this.emit({ type: "thread.started", payload: { threadId } });
        return;
      }
      case "turn/started": {
        const threadId = this.getNestedString(params, ["turn", "threadId"]);
        const turnId = this.getNestedString(params, ["turn", "id"]);
        if (!threadId || !turnId) {
          return;
        }
        this.turnIdToThreadId.set(turnId, threadId);
        this.emit({ type: "turn.started", payload: { threadId, turnId } });
        return;
      }
      case "turn/completed": {
        const turn = (params.turn as Record<string, unknown>) ?? {};
        const threadId = (turn.threadId as string | undefined) ?? "";
        const turnId = (turn.id as string | undefined) ?? "";
        const status = (turn.status as "completed" | "interrupted" | "failed" | undefined) ?? "failed";
        const errorMessage = this.getNestedString(turn, ["error", "message"]);

        if (!threadId || !turnId) {
          return;
        }

        this.emit({
          type: "turn.completed",
          payload: { threadId, turnId, status, error: errorMessage },
        });

        this.turnIdToThreadId.delete(turnId);
        const itemIds = this.turnIdToItemIds.get(turnId);
        if (itemIds) {
          for (const itemId of itemIds) {
            this.itemIdToThreadId.delete(itemId);
          }
          this.turnIdToItemIds.delete(turnId);
        }
        return;
      }
      case "item/agentMessage/delta": {
        const itemId = (params.itemId as string | undefined) ?? "";
        const text =
          (params.delta as string | undefined) ??
          (params.textDelta as string | undefined) ??
          (params.text as string | undefined) ??
          "";
        if (!itemId || !text) {
          return;
        }
        const threadId = this.resolveThreadId(params, itemId);
        if (!threadId) {
          this.logger.warn({ method, itemId }, "Cannot resolve threadId for agent delta");
          return;
        }
        this.emit({ type: "agent.delta", payload: { threadId, itemId, text } });
        return;
      }
      case "item/reasoning/summaryTextDelta": {
        const itemId = (params.itemId as string | undefined) ?? "";
        const text =
          (params.delta as string | undefined) ??
          (params.textDelta as string | undefined) ??
          (params.text as string | undefined) ??
          "";
        if (!itemId || !text) {
          return;
        }
        const threadId = this.resolveThreadId(params, itemId);
        if (!threadId) {
          this.logger.warn({ method, itemId }, "Cannot resolve threadId for reasoning delta");
          return;
        }
        this.emit({ type: "reasoning.delta", payload: { threadId, itemId, text } });
        return;
      }
      case "item/started":
      case "item/completed": {
        const status = method === "item/started" ? "inProgress" : "completed";
        const item = (params.item as Record<string, unknown>) ?? {};
        const itemId = (item.id as string | undefined) ?? "";
        const itemType = (item.type as string | undefined) ?? "";
        if (!itemId || !itemType) {
          return;
        }

        const turnId =
          (item.turnId as string | undefined) ??
          (params.turnId as string | undefined) ??
          this.getNestedString(params, ["turn", "id"]);
        const threadId =
          (item.threadId as string | undefined) ??
          (params.threadId as string | undefined) ??
          (turnId ? this.turnIdToThreadId.get(turnId) : undefined);

        if (turnId && threadId) {
          this.turnIdToThreadId.set(turnId, threadId);
        }

        if (threadId) {
          this.itemIdToThreadId.set(itemId, threadId);
        }
        if (turnId) {
          const ids = this.turnIdToItemIds.get(turnId) ?? new Set<string>();
          ids.add(itemId);
          this.turnIdToItemIds.set(turnId, ids);
        }

        if (itemType === "commandExecution") {
          if (!threadId) {
            this.logger.warn({ method, itemId }, "Cannot resolve threadId for commandExecution status");
            return;
          }
          const commandLabel = this.toCommandLabel(item.command);
          const completedStatus = typeof item.status === "string" ? item.status : undefined;
          const resultStatus =
            method === "item/completed" && (completedStatus === "failed" || completedStatus === "declined")
              ? "failed"
              : status;
          this.emit({
            type: "tool.status",
            payload: {
              threadId,
              itemId,
              tool: commandLabel ? `command:${commandLabel}` : "command",
              status: resultStatus,
            },
          });
          return;
        }

        if (itemType === "mcpToolCall") {
          if (!threadId) {
            this.logger.warn({ method, itemId }, "Cannot resolve threadId for mcpToolCall status");
            return;
          }
          const tool = String(item.tool ?? "mcpTool");
          const resultStatus = method === "item/completed" && item.status === "failed" ? "failed" : status;
          this.emit({
            type: "tool.status",
            payload: {
              threadId,
              itemId,
              tool,
              status: resultStatus,
            },
          });
          return;
        }

        if (itemType === "webSearch" && method === "item/completed") {
          if (!threadId) {
            this.logger.warn({ method, itemId }, "Cannot resolve threadId for webSearch sources");
            return;
          }
          const query = (item.query as string | undefined) ?? "Search";
          const sources: SourceRef[] = [
            {
              title: query,
              provider: "webSearch",
            },
          ];
          this.emit({ type: "sources.updated", payload: { threadId, itemId, sources } });
        }
        return;
      }
      default:
        return;
    }
  }

  private emit(event: UiEvent): void {
    this.eventBus.publish(event);
  }

  private resolveThreadId(params: Record<string, unknown>, itemId: string): string | undefined {
    const byParams =
      (params.threadId as string | undefined) ??
      this.getNestedString(params, ["turn", "threadId"]) ??
      this.getNestedString(params, ["item", "threadId"]);
    if (byParams) {
      this.itemIdToThreadId.set(itemId, byParams);
      return byParams;
    }

    const byItemCache = this.itemIdToThreadId.get(itemId);
    if (byItemCache) {
      return byItemCache;
    }

    const turnId =
      (params.turnId as string | undefined) ??
      this.getNestedString(params, ["turn", "id"]) ??
      this.getNestedString(params, ["item", "turnId"]);
    if (!turnId) {
      return undefined;
    }

    const byTurnCache = this.turnIdToThreadId.get(turnId);
    if (byTurnCache) {
      this.itemIdToThreadId.set(itemId, byTurnCache);
      return byTurnCache;
    }

    return undefined;
  }

  private getNestedString(value: Record<string, unknown>, path: string[]): string | undefined {
    let current: unknown = value;
    for (const key of path) {
      if (!current || typeof current !== "object") {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return typeof current === "string" ? current : undefined;
  }

  private toCommandLabel(command: unknown): string {
    if (Array.isArray(command)) {
      return command.map((entry) => String(entry)).join(" ").trim();
    }

    if (typeof command === "string") {
      return command.trim();
    }

    if (!command || typeof command !== "object") {
      return "";
    }

    const record = command as Record<string, unknown>;

    // Some command approvals are network-scoped and may not expose shell argv.
    if (typeof record.host === "string") {
      const protocol = typeof record.protocol === "string" ? record.protocol : "network";
      return `${protocol}://${record.host}`;
    }

    const argv = record.argv;
    if (Array.isArray(argv)) {
      return argv.map((entry) => String(entry)).join(" ").trim();
    }

    const cmd = record.command;
    if (Array.isArray(cmd)) {
      return cmd.map((entry) => String(entry)).join(" ").trim();
    }
    if (typeof cmd === "string") {
      return cmd.trim();
    }

    return "[structured-command]";
  }
}
