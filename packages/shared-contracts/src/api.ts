import type { SourceRef } from "./events";

export type AuthMode = "apikey" | "chatgpt" | "chatgptAuthTokens" | null;

export interface AuthStateResponse {
  authMode: AuthMode;
  account: Record<string, unknown> | null;
}

export interface StartChatgptLoginResponse {
  loginId: string;
  authUrl: string;
}

export interface CancelChatgptLoginRequest {
  loginId: string;
}

export interface ModelListRequest {
  limit?: number;
  includeHidden?: boolean;
}

export interface ModelInfo {
  id: string;
  displayName?: string;
  hidden?: boolean;
  supportsPersonality?: boolean;
  inputModalities?: string[];
  defaultReasoningEffort?: string;
}

export interface ModelListResponse {
  data: ModelInfo[];
  nextCursor: string | null;
}

export interface ThreadSummary {
  id: string;
  name?: string | null;
  preview?: string;
  createdAt?: number;
  updatedAt?: number;
  status?: Record<string, unknown>;
}

export interface CreateThreadRequest {
  model?: string;
  cwd?: string;
  personality?: string;
}

export interface CreateThreadResponse {
  threadId: string;
}

export interface ResumeThreadRequest {
  personality?: string;
}

export interface ThreadListRequest {
  cursor?: string | null;
  limit?: number;
}

export interface ThreadListResponse {
  data: ThreadSummary[];
  nextCursor: string | null;
}

export interface ThreadReadResponse {
  thread: Record<string, unknown>;
}

export interface ThreadHistoryMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  itemId?: string;
  attachments?: ThreadHistoryAttachment[];
}

export type ThreadHistoryAttachment =
  | { type: "image"; url: string }
  | { type: "localImage"; path: string };

export interface ThreadMessageListRequest {
  cursor?: string | null;
  limit?: number;
}

export interface ThreadMessageListResponse {
  data: ThreadHistoryMessage[];
  nextCursor: string | null;
}

export type TurnInputItem =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "localImage"; path: string };

export interface StartTurnRequest {
  input: TurnInputItem[];
  model?: string;
  effort?: string;
  summary?: string;
  personality?: string;
  cwd?: string;
}

export interface StartTurnResponse {
  turnId: string;
}

export interface SteerTurnRequest {
  input: TurnInputItem[];
}

export interface InterruptTurnResponse {
  ok: true;
}

export type CommandApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel"
  | { acceptWithExecpolicyAmendment: { execpolicy_amendment: string[] } };

export type FileApprovalDecision =
  | "accept"
  | "acceptForSession"
  | "decline"
  | "cancel";

export interface CommandApprovalRequestBody {
  requestId: string;
  decision: CommandApprovalDecision;
}

export interface FileChangeApprovalRequestBody {
  requestId: string;
  decision: FileApprovalDecision;
}

export interface CommandApprovalPayload {
  requestId: string;
  itemId: string;
  threadId: string;
  turnId: string;
  reason?: string;
  command?: string[];
  cwd?: string;
}

export interface FileApprovalPayload {
  requestId: string;
  itemId: string;
  threadId: string;
  turnId: string;
  reason?: string;
  grantRoot?: string;
}

export interface MessageSourcePayload {
  itemId: string;
  sources: SourceRef[];
}
