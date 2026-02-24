import type { ToolStatusView } from "@/lib/event-reducer";

interface ToolStatusChipProps {
  status: ToolStatusView;
}

const statusClass: Record<ToolStatusView["status"], string> = {
  inProgress: "border-sky-300 bg-sky-100 text-sky-800",
  completed: "border-emerald-300 bg-emerald-100 text-emerald-800",
  failed: "border-rose-300 bg-rose-100 text-rose-800",
};

export function ToolStatusChip({ status }: ToolStatusChipProps) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-1 font-mono text-[11px] ${statusClass[status.status]}`}
      title={status.detail}
    >
      {status.tool} · {status.status}
    </span>
  );
}
