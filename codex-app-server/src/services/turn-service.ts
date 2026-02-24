import type { StartTurnRequest, StartTurnResponse, SteerTurnRequest } from "@codex-app/shared-contracts";
import type { Env } from "../config/env";
import { JsonRpcClient } from "../rpc/jsonrpc-client";

export class TurnService {
  constructor(
    private readonly rpc: JsonRpcClient,
    private readonly env: Env,
  ) {}

  async startTurn(threadId: string, request: StartTurnRequest): Promise<StartTurnResponse> {
    const result = await this.rpc.request<{ turn: { id: string } }>("turn/start", {
      threadId,
      input: request.input,
      model: request.model,
      effort: request.effort,
      summary: request.summary,
      personality: request.personality,
      cwd: request.cwd ?? this.env.codexCwd ?? process.cwd(),
      approvalPolicy: this.env.codexApprovalPolicy,
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: this.env.codexWritableRoots,
        networkAccess: this.env.codexNetworkAccess,
      },
    });

    return {
      turnId: result.turn.id,
    };
  }

  async steerTurn(threadId: string, turnId: string, request: SteerTurnRequest): Promise<void> {
    await this.rpc.request("turn/steer", {
      threadId,
      turnId,
      input: request.input,
    });
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.rpc.request("turn/interrupt", {
      threadId,
      turnId,
    });
  }
}
