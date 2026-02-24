import { EventEmitter } from "node:events";
import { ApiError, ErrorCodes } from "@codex-app/shared-contracts";
import type {
  CodexClientInfo,
  PendingRpcRequest,
  RpcNotification,
  RpcServerRequest,
} from "../types/codex-wire";
import type { AppLogger } from "../types/logger";
import { isJsonRpcRequestLike, isJsonRpcResponseLike, parseJsonRpcLine } from "../utils/json-rpc";
import { CodexProcessManager } from "./codex-process-manager";

interface JsonRpcClientEvents {
  notification: [notification: RpcNotification];
  serverRequest: [request: RpcServerRequest];
}

export class JsonRpcClient extends EventEmitter<JsonRpcClientEvents> {
  private nextId = 1;
  private pending = new Map<number | string, PendingRpcRequest>();
  private initialized = false;
  private initializing?: Promise<void>;

  constructor(
    private readonly processManager: CodexProcessManager,
    private readonly logger: AppLogger,
    private readonly clientInfo: CodexClientInfo,
  ) {
    super();
    this.processManager.on("line", (line) => this.handleLine(line));
    this.processManager.on("stderr", (line) => {
      this.logger.warn({ line }, "codex stderr");
    });
    this.processManager.on("exit", () => {
      this.initialized = false;
      this.initializing = undefined;
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(new ApiError(ErrorCodes.CODEX_NOT_READY, "codex app-server exited", 503));
      }
      this.pending.clear();
    });
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = (async () => {
      await this.rawRequest("initialize", {
        clientInfo: this.clientInfo,
        capabilities: { experimentalApi: true },
      }, 15000, true);
      await this.rawNotify("initialized", {});
      this.initialized = true;
      this.logger.info("codex app-server initialized");
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = undefined;
    }
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    await this.ensureInitialized();
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
      try {
        return (await this.rawRequest(method, params, timeoutMs, false)) as T;
      } catch (error) {
        if (!this.shouldRetryOnOverload(error) || attempt === maxRetries - 1) {
          throw error;
        }

        const delayMs = this.getRetryDelayMs(attempt);
        this.logger.warn({ method, attempt: attempt + 1, delayMs }, "Codex overloaded, retrying request");
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new ApiError(ErrorCodes.CODEX_REQUEST_FAILED, "Unreachable retry state", 500);
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.ensureInitialized();
    await this.rawNotify(method, params);
  }

  async respond(id: number | string, result: unknown): Promise<void> {
    await this.processManager.sendMessage({ id, result });
  }

  async respondError(id: number | string, code: number, message: string): Promise<void> {
    await this.processManager.sendMessage({ id, error: { code, message } });
  }

  async close(): Promise<void> {
    await this.processManager.stop();
  }

  private async rawRequest(
    method: string,
    params: Record<string, unknown> | undefined,
    timeoutMs: number,
    skipInitialization = false,
  ): Promise<unknown> {
    if (!skipInitialization && !this.initialized) {
      await this.ensureInitialized();
    }

    const id = this.nextId++;

    return new Promise<unknown>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new ApiError(ErrorCodes.CODEX_TIMEOUT, `Timed out waiting for ${method}`, 504));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timeout });

      try {
        await this.processManager.sendMessage({
          method,
          id,
          params,
        });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  private async rawNotify(method: string, params?: Record<string, unknown>): Promise<void> {
    await this.processManager.sendMessage({ method, params });
  }

  private shouldRetryOnOverload(error: unknown): boolean {
    return error instanceof ApiError && error.message.includes("Server overloaded; retry later.");
  }

  private getRetryDelayMs(attempt: number): number {
    const base = 200 * 2 ** attempt;
    const jitter = Math.floor(Math.random() * 100);
    return base + jitter;
  }

  private handleLine(line: string): void {
    const parsed = parseJsonRpcLine(line);
    if (!parsed) {
      this.logger.warn({ line }, "Skipping non-JSON-RPC line from codex app-server");
      return;
    }

    if (isJsonRpcResponseLike(parsed)) {
      const response = parsed as unknown as {
        id: number | string;
        result?: unknown;
        error?: { code?: number; message?: string };
      };
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }

      clearTimeout(pending.timeout);
      this.pending.delete(response.id);

      if (response.error) {
        const error = response.error;
        pending.reject(
          new ApiError(
            ErrorCodes.CODEX_REQUEST_FAILED,
            error.message ?? "codex request failed",
            502,
          ),
        );
        return;
      }

      pending.resolve(response.result);
      return;
    }

    if (isJsonRpcRequestLike(parsed)) {
      const request = parsed as unknown as {
        id: number | string;
        method: string;
        params?: Record<string, unknown>;
      };
      this.emit("serverRequest", {
        id: request.id,
        method: request.method,
        params: request.params ?? {},
      });
      return;
    }

    if (typeof (parsed as { method?: unknown }).method === "string") {
      const notification = parsed as { method: string; params?: Record<string, unknown> };
      this.emit("notification", {
        method: notification.method,
        params: notification.params,
      });
    }
  }
}
