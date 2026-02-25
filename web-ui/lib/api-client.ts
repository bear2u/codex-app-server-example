import type {
  AuthStateResponse,
  CommandApprovalDecision,
  CreateThreadRequest,
  CreateThreadResponse,
  FileApprovalDecision,
  ModelListResponse,
  StartChatgptLoginResponse,
  StartTurnRequest,
  StartTurnResponse,
  SteerTurnRequest,
  ThreadMessageListResponse,
  ThreadListResponse,
} from "@codex-app/shared-contracts";

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiBase = resolveApiBase();
  const url = `${apiBase}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (error) {
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : "unknown-origin";
    const message = [
      `Cannot reach API server at ${apiBase}.`,
      "Check that codex-app-server is running on port 4000.",
      `If this is a browser CORS issue, allow origin ${currentOrigin} in CORS_ORIGIN.`,
    ].join(" ");
    throw new Error(message, { cause: error });
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export function startChatgptLogin(): Promise<StartChatgptLoginResponse> {
  return request("/v1/auth/chatgpt/start", { method: "POST" });
}

export function readAuthState(): Promise<AuthStateResponse> {
  return request("/v1/auth/state");
}

export function listModels(query: { limit?: number; includeHidden?: boolean } = {}): Promise<ModelListResponse> {
  const params = new URLSearchParams();
  if (query.limit) {
    params.set("limit", String(query.limit));
  }
  if (query.includeHidden) {
    params.set("includeHidden", "true");
  }

  const queryString = params.toString();
  return request(`/v1/models${queryString ? `?${queryString}` : ""}`);
}

export function listThreads(query: { cursor?: string | null; limit?: number } = {}): Promise<ThreadListResponse> {
  const params = new URLSearchParams();
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  if (query.limit) {
    params.set("limit", String(query.limit));
  }

  const queryString = params.toString();
  return request(`/v1/threads${queryString ? `?${queryString}` : ""}`);
}

export function listThreadMessages(
  threadId: string,
  query: { cursor?: string | null; limit?: number } = {},
): Promise<ThreadMessageListResponse> {
  const params = new URLSearchParams();
  if (query.cursor) {
    params.set("cursor", query.cursor);
  }
  if (query.limit) {
    params.set("limit", String(query.limit));
  }

  const queryString = params.toString();
  return request(`/v1/threads/${threadId}/messages${queryString ? `?${queryString}` : ""}`);
}

export function createThread(payload: CreateThreadRequest = {}): Promise<CreateThreadResponse> {
  return request("/v1/threads", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resumeThread(threadId: string): Promise<CreateThreadResponse> {
  return request(`/v1/threads/${threadId}/resume`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function startTurn(threadId: string, payload: StartTurnRequest): Promise<StartTurnResponse> {
  return request(`/v1/threads/${threadId}/turns`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function steerTurn(threadId: string, turnId: string, payload: SteerTurnRequest): Promise<void> {
  return request(`/v1/threads/${threadId}/turns/${turnId}/steer`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function interruptTurn(threadId: string, turnId: string): Promise<void> {
  return request(`/v1/threads/${threadId}/turns/${turnId}/interrupt`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function approveCommand(requestId: string, decision: CommandApprovalDecision): Promise<void> {
  return request("/v1/approvals/command", {
    method: "POST",
    body: JSON.stringify({ requestId, decision }),
  });
}

export function approveFileChange(requestId: string, decision: FileApprovalDecision): Promise<void> {
  return request("/v1/approvals/file-change", {
    method: "POST",
    body: JSON.stringify({ requestId, decision }),
  });
}
