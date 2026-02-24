import { describe, expect, it } from "vitest";
import { isCommandApprovalDecision, isFileApprovalDecision } from "../src/utils/approval-decision";

describe("approval decision validators", () => {
  it("accepts command string decisions", () => {
    expect(isCommandApprovalDecision("accept")).toBe(true);
    expect(isCommandApprovalDecision("cancel")).toBe(true);
  });

  it("accepts command amendment decision", () => {
    expect(
      isCommandApprovalDecision({
        acceptWithExecpolicyAmendment: { execpolicy_amendment: ["pnpm", "test"] },
      }),
    ).toBe(true);
  });

  it("rejects invalid command decision", () => {
    expect(isCommandApprovalDecision({ acceptWithExecpolicyAmendment: { execpolicy_amendment: "nope" } })).toBe(
      false,
    );
  });

  it("validates file decision", () => {
    expect(isFileApprovalDecision("acceptForSession")).toBe(true);
    expect(isFileApprovalDecision("other")).toBe(false);
  });
});
