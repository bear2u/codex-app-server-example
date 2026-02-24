import { randomUUID } from "node:crypto";
import type {
  CommandApprovalDecision,
  CommandApprovalPayload,
  FileApprovalDecision,
  FileApprovalPayload,
} from "@codex-app/shared-contracts";
import { ApiError, ErrorCodes } from "@codex-app/shared-contracts";
import type { RpcServerRequest } from "../types/codex-wire";
import type { AppLogger } from "../types/logger";
import { UiEventBus } from "../utils/ui-event-bus";
import { JsonRpcClient } from "../rpc/jsonrpc-client";

type PendingApproval =
  | { rpcId: string | number; type: "command"; payload: CommandApprovalPayload }
  | { rpcId: string | number; type: "file"; payload: FileApprovalPayload };

export class ApprovalService {
  private pending = new Map<string, PendingApproval>();

  constructor(
    private readonly rpc: JsonRpcClient,
    private readonly eventBus: UiEventBus,
    private readonly logger: AppLogger,
  ) {}

  start(): void {
    this.rpc.on("serverRequest", (request) => {
      void this.handleServerRequest(request);
    });
  }

  async approveCommand(requestId: string, decision: CommandApprovalDecision): Promise<void> {
    const pending = this.pending.get(requestId);
    if (!pending || pending.type !== "command") {
      throw new ApiError(ErrorCodes.APPROVAL_NOT_FOUND, "Command approval request not found", 404);
    }

    await this.rpc.respond(pending.rpcId, decision);
    this.pending.delete(requestId);
  }

  async approveFileChange(requestId: string, decision: FileApprovalDecision): Promise<void> {
    const pending = this.pending.get(requestId);
    if (!pending || pending.type !== "file") {
      throw new ApiError(ErrorCodes.APPROVAL_NOT_FOUND, "File change approval request not found", 404);
    }

    await this.rpc.respond(pending.rpcId, decision);
    this.pending.delete(requestId);
  }

  private async handleServerRequest(request: RpcServerRequest): Promise<void> {
    if (request.method === "item/commandExecution/requestApproval") {
      const requestId = randomUUID();
      const payload: CommandApprovalPayload = {
        requestId,
        itemId: String(request.params?.itemId ?? ""),
        threadId: String(request.params?.threadId ?? ""),
        turnId: String(request.params?.turnId ?? ""),
        reason: request.params?.reason ? String(request.params.reason) : undefined,
        command: Array.isArray(request.params?.command)
          ? (request.params?.command as string[])
          : undefined,
        cwd: request.params?.cwd ? String(request.params.cwd) : undefined,
      };

      this.pending.set(requestId, {
        rpcId: request.id,
        type: "command",
        payload,
      });

      this.eventBus.publish({
        type: "approval.command.requested",
        payload,
      });
      return;
    }

    if (request.method === "item/fileChange/requestApproval") {
      const requestId = randomUUID();
      const payload: FileApprovalPayload = {
        requestId,
        itemId: String(request.params?.itemId ?? ""),
        threadId: String(request.params?.threadId ?? ""),
        turnId: String(request.params?.turnId ?? ""),
        reason: request.params?.reason ? String(request.params.reason) : undefined,
        grantRoot: request.params?.grantRoot ? String(request.params.grantRoot) : undefined,
      };

      this.pending.set(requestId, {
        rpcId: request.id,
        type: "file",
        payload,
      });

      this.eventBus.publish({
        type: "approval.filechange.requested",
        payload,
      });
      return;
    }

    this.logger.warn({ method: request.method }, "Unhandled server request from codex app-server");
    await this.rpc.respondError(request.id, -32601, `Unsupported method: ${request.method}`);
  }
}
