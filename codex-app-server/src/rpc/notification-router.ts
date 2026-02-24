import type { SourceRef, UiEvent } from "@codex-app/shared-contracts";
import type { AppLogger } from "../types/logger";
import { UiEventBus } from "../utils/ui-event-bus";
import { JsonRpcClient } from "./jsonrpc-client";

export class NotificationRouter {
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
        this.emit({ type: "agent.delta", payload: { itemId, text } });
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
        this.emit({ type: "reasoning.delta", payload: { itemId, text } });
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

        if (itemType === "commandExecution") {
          const command = (item.command as string[] | undefined) ?? [];
          this.emit({
            type: "tool.status",
            payload: {
              itemId,
              tool: `command:${command.join(" ")}`,
              status,
            },
          });
          return;
        }

        if (itemType === "mcpToolCall") {
          const tool = String(item.tool ?? "mcpTool");
          const resultStatus = method === "item/completed" && item.status === "failed" ? "failed" : status;
          this.emit({
            type: "tool.status",
            payload: {
              itemId,
              tool,
              status: resultStatus,
            },
          });
          return;
        }

        if (itemType === "webSearch" && method === "item/completed") {
          const query = (item.query as string | undefined) ?? "Search";
          const sources: SourceRef[] = [
            {
              title: query,
              provider: "webSearch",
            },
          ];
          this.emit({ type: "sources.updated", payload: { itemId, sources } });
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
}
