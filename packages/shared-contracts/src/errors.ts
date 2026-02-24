export class ApiError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 500) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const ErrorCodes = {
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_FOUND: "NOT_FOUND",
  CODEX_NOT_READY: "CODEX_NOT_READY",
  CODEX_REQUEST_FAILED: "CODEX_REQUEST_FAILED",
  CODEX_TIMEOUT: "CODEX_TIMEOUT",
  APPROVAL_NOT_FOUND: "APPROVAL_NOT_FOUND",
} as const;
