import type { CommandApprovalPayload, FileApprovalPayload } from "@codex-app/shared-contracts";

interface ApprovalBannerProps {
  commandApprovals: CommandApprovalPayload[];
  fileApprovals: FileApprovalPayload[];
  onCommandDecision: (
    requestId: string,
    decision: "accept" | "acceptForSession" | "decline" | "cancel",
  ) => void;
  onFileDecision: (
    requestId: string,
    decision: "accept" | "acceptForSession" | "decline" | "cancel",
  ) => void;
}

function ActionButtons({
  onAction,
}: {
  onAction: (decision: "accept" | "acceptForSession" | "decline" | "cancel") => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onAction("accept")}
        className="cursor-pointer rounded-md border border-emerald-500 bg-emerald-500 px-2 py-2 text-xs font-semibold text-white"
      >
        Accept
      </button>
      <button
        type="button"
        onClick={() => onAction("acceptForSession")}
        className="cursor-pointer rounded-md border border-sky-500 bg-sky-500 px-2 py-2 text-xs font-semibold text-white"
      >
        Accept Session
      </button>
      <button
        type="button"
        onClick={() => onAction("decline")}
        className="cursor-pointer rounded-md border border-rose-500 bg-rose-500 px-2 py-2 text-xs font-semibold text-white"
      >
        Decline
      </button>
      <button
        type="button"
        onClick={() => onAction("cancel")}
        className="cursor-pointer rounded-md border border-slate-400 bg-slate-200 px-2 py-2 text-xs font-semibold text-slate-700"
      >
        Cancel
      </button>
    </div>
  );
}

export function ApprovalBanner({
  commandApprovals,
  fileApprovals,
  onCommandDecision,
  onFileDecision,
}: ApprovalBannerProps) {
  if (!commandApprovals.length && !fileApprovals.length) {
    return null;
  }

  return (
    <section className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Approval Required</p>

      {commandApprovals.map((approval) => (
        <div key={approval.requestId} className="rounded-md border border-amber-200 bg-white p-2">
          <p className="text-xs font-semibold text-slate-800">Command Execution</p>
          <p className="mt-1 text-xs text-slate-600">{approval.command?.join(" ") || approval.reason || "Command approval"}</p>
          <ActionButtons onAction={(decision) => onCommandDecision(approval.requestId, decision)} />
        </div>
      ))}

      {fileApprovals.map((approval) => (
        <div key={approval.requestId} className="rounded-md border border-amber-200 bg-white p-2">
          <p className="text-xs font-semibold text-slate-800">File Change</p>
          <p className="mt-1 text-xs text-slate-600">{approval.reason || approval.grantRoot || "File change approval"}</p>
          <ActionButtons onAction={(decision) => onFileDecision(approval.requestId, decision)} />
        </div>
      ))}
    </section>
  );
}
