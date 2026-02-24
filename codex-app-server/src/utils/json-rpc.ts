import type { JsonRpcMessage } from "../types/codex-wire";

export function parseJsonRpcLine(line: string): JsonRpcMessage | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as JsonRpcMessage;
  } catch {
    return null;
  }
}

export function isJsonRpcRequestLike(value: JsonRpcMessage): boolean {
  const candidate = value as unknown as Record<string, unknown>;
  return typeof candidate.method === "string" && Object.prototype.hasOwnProperty.call(candidate, "id");
}

export function isJsonRpcResponseLike(value: JsonRpcMessage): boolean {
  const candidate = value as unknown as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(candidate, "id") &&
    (Object.prototype.hasOwnProperty.call(candidate, "result") ||
      Object.prototype.hasOwnProperty.call(candidate, "error"))
  );
}
