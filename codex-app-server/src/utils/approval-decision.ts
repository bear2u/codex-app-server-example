import type { CommandApprovalDecision, FileApprovalDecision } from "@codex-app/shared-contracts";

const commandDecisions = new Set(["accept", "acceptForSession", "decline", "cancel"]);
const fileDecisions = new Set(["accept", "acceptForSession", "decline", "cancel"]);

export function isCommandApprovalDecision(value: unknown): value is CommandApprovalDecision {
  if (typeof value === "string") {
    return commandDecisions.has(value);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  const typed = value as {
    acceptWithExecpolicyAmendment?: { execpolicy_amendment?: unknown };
  };

  if (!typed.acceptWithExecpolicyAmendment) {
    return false;
  }

  return Array.isArray(typed.acceptWithExecpolicyAmendment.execpolicy_amendment);
}

export function isFileApprovalDecision(value: unknown): value is FileApprovalDecision {
  return typeof value === "string" && fileDecisions.has(value);
}
