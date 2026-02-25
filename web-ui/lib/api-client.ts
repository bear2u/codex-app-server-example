import type {
  AuthStateResponse,
  CommandApprovalDecision,
  CreateThreadRequest,
  CreateThreadResponse,
  DisableTunnelResponse,
  EnableTunnelRequest,
  EnableTunnelResponse,
  FileApprovalDecision,
  ModelListResponse,
  StartChatgptLoginResponse,
  StartTurnRequest,
  StartTurnResponse,
  SteerTurnRequest,
  TunnelAdminStateResponse,
  TunnelPublicLoginRequest,
  TunnelPublicLoginResponse,
  ThreadMessageListResponse,
  ThreadListResponse,
} from "@codex-app/shared-contracts";

const DEFAULT_API_TIMEOUT_MS = 20_000;
const MAX_RETRY_BACKOFF_MS = 3_000;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const JSON_CONTENT_TYPE = "application/json";

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:4000";
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

function shouldRetryStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

function shouldRetryNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Timeout aborts and transient network failures are worth retrying.
  if (error.name === "AbortError" || error.name === "TimeoutError") {
    return true;
  }

  const message = error.message.toLowerCase();
  return message.includes("network") || message.includes("fetch");
}

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type");
  return typeof contentType === "string" && contentType.toLowerCase().includes(JSON_CONTENT_TYPE);
}

function isTunnelLoginResponse(response: Response): boolean {
  try {
    const url = new URL(response.url);
    return url.pathname.startsWith("/tunnel-login");
  } catch {
    return false;
  }
}

function redirectToTunnelLoginFromCurrentPage(): void {
  if (typeof window === "undefined") {
    return;
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.href = `/tunnel-login?next=${encodeURIComponent(currentPath)}`;
}

function redirectToResponseUrl(response: Response): void {
  if (typeof window === "undefined") {
    return;
  }
  window.location.href = response.url;
}

function combineSignals(external: AbortSignal | null | undefined, internal: AbortSignal): AbortSignal {
  if (!external) {
    return internal;
  }
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([external, internal]);
  }

  if (external.aborted) {
    const controller = new AbortController();
    controller.abort(external.reason);
    return controller.signal;
  }

  const controller = new AbortController();
  const forward = () => controller.abort(external.reason);
  external.addEventListener("abort", forward, { once: true });
  internal.addEventListener("abort", () => controller.abort(internal.reason), { once: true });
  return controller.signal;
}

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const apiBase = resolveApiBase();
  const url = `${apiBase}${path}`;
  const method = (init.method ?? "GET").toUpperCase();
  const timeoutMs = init.timeoutMs ?? DEFAULT_API_TIMEOUT_MS;
  const retries = init.retries ?? (method === "GET" ? 2 : 0);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutHandle = setTimeout(() => {
      timeoutController.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, "TimeoutError"));
    }, timeoutMs);

    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        signal: combineSignals(init.signal, timeoutController.signal),
        credentials: init.credentials ?? "include",
        headers: {
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
        cache: "no-store",
      });
    } catch (error) {
      clearTimeout(timeoutHandle);

      if (attempt < retries && shouldRetryNetworkError(error)) {
        const backoff = Math.min(300 * 2 ** attempt, MAX_RETRY_BACKOFF_MS) + Math.floor(Math.random() * 150);
        await waitFor(backoff);
        continue;
      }

      const currentOrigin = typeof window !== "undefined" ? window.location.origin : "unknown-origin";
      const message = [
        `Cannot reach API server at ${apiBase}.`,
        "Check that codex-app-server is running on port 4000.",
        `If this is a browser CORS issue, allow origin ${currentOrigin} in CORS_ORIGIN.`,
      ].join(" ");
      throw new Error(message, { cause: error });
    }

    clearTimeout(timeoutHandle);

    if (response.redirected && isTunnelLoginResponse(response)) {
      redirectToResponseUrl(response);
      throw new Error("Tunnel authentication is required.");
    }

    if (!response.ok) {
      if (response.status === 401) {
        redirectToTunnelLoginFromCurrentPage();
      }

      const errorBody = isJsonResponse(response) ? await response.json().catch(() => ({})) : {};
      if (attempt < retries && shouldRetryStatus(response.status)) {
        const backoff = Math.min(300 * 2 ** attempt, MAX_RETRY_BACKOFF_MS) + Math.floor(Math.random() * 150);
        await waitFor(backoff);
        continue;
      }
      throw new Error(errorBody.message ?? `Request failed: ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    if (!isJsonResponse(response)) {
      if (isTunnelLoginResponse(response)) {
        redirectToResponseUrl(response);
        throw new Error("Tunnel authentication is required.");
      }

      throw new Error(
        `Unexpected API response format (expected JSON, got ${
          response.headers.get("content-type") ?? "unknown content type"
        }).`,
      );
    }

    return (await response.json()) as T;
  }

  throw new Error("Request failed after retries");
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

export function readTunnelAdminState(): Promise<TunnelAdminStateResponse> {
  return request("/v1/tunnel/admin/state");
}

export function enableTunnel(payload: EnableTunnelRequest): Promise<EnableTunnelResponse> {
  return request("/v1/tunnel/admin/enable", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function disableTunnel(): Promise<DisableTunnelResponse> {
  return request("/v1/tunnel/admin/disable", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function tunnelPublicLogin(payload: TunnelPublicLoginRequest): Promise<TunnelPublicLoginResponse> {
  return request("/v1/tunnel/public/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function tunnelPublicLogout(): Promise<{ ok: true }> {
  return request("/v1/tunnel/public/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
}
