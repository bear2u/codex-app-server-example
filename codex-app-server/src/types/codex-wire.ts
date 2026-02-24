export interface JsonRpcRequest<T = unknown> {
  id: number | string;
  method: string;
  params?: T;
}

export interface JsonRpcNotification<T = unknown> {
  method: string;
  params?: T;
}

export interface JsonRpcSuccess<T = unknown> {
  id: number | string;
  result: T;
}

export interface JsonRpcError {
  id: number | string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcMessage =
  | JsonRpcRequest
  | JsonRpcNotification
  | JsonRpcSuccess
  | JsonRpcError;

export interface CodexClientInfo {
  name: string;
  title: string;
  version: string;
}

export interface PendingRpcRequest {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
}

export interface RpcServerRequest {
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcNotification {
  method: string;
  params?: Record<string, unknown>;
}
