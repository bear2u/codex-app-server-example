import type {
  CommandApprovalPayload,
  FileApprovalPayload,
} from "./api";

export interface SourceRef {
  title: string;
  url?: string;
  provider?: string;
}

export type ToolStatus = "inProgress" | "completed" | "failed";

export type UiEvent =
  | { type: "auth.updated"; payload: { authMode: string | null } }
  | { type: "thread.started"; payload: { threadId: string } }
  | { type: "turn.started"; payload: { threadId: string; turnId: string } }
  | { type: "agent.delta"; payload: { threadId: string; itemId: string; text: string } }
  | { type: "reasoning.delta"; payload: { threadId: string; itemId: string; text: string } }
  | { type: "sources.updated"; payload: { threadId: string; itemId: string; sources: SourceRef[] } }
  | {
      type: "tool.status";
      payload: { threadId: string; itemId: string; tool: string; status: ToolStatus; detail?: string };
    }
  | { type: "approval.command.requested"; payload: CommandApprovalPayload }
  | { type: "approval.filechange.requested"; payload: FileApprovalPayload }
  | {
      type: "turn.completed";
      payload: {
        threadId: string;
        turnId: string;
        status: "completed" | "interrupted" | "failed";
        error?: string;
      };
    }
  | { type: "error"; payload: { code: string; message: string; detail?: string } };

export interface UiEventEnvelope {
  id: string;
  ts: number;
  event: UiEvent;
}
