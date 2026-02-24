import type { ThreadSummary } from "@codex-app/shared-contracts";

interface ThreadSidebarProps {
  threads: ThreadSummary[];
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

export function ThreadSidebar({
  threads,
  currentThreadId,
  onSelectThread,
  onCreateThread,
}: ThreadSidebarProps) {
  return (
    <aside className="flex h-full w-full max-w-72 flex-col border-r border-[var(--border)] bg-[var(--panel)]/80 p-4">
      <button
        type="button"
        onClick={onCreateThread}
        className="cursor-pointer rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors duration-200 hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        New Thread
      </button>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
        {threads.map((thread) => {
          const active = thread.id === currentThreadId;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={`w-full cursor-pointer rounded-lg border px-3 py-2 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                active
                  ? "border-[var(--accent)] bg-[var(--panel-strong)]"
                  : "border-[var(--border)] bg-transparent hover:border-[var(--accent)]/50 hover:bg-[var(--panel-strong)]/60"
              }`}
            >
              <p className="line-clamp-1 text-sm font-medium text-[var(--foreground)]">
                {thread.name || thread.preview || thread.id}
              </p>
              <p className="mt-1 line-clamp-1 text-xs text-[var(--muted-foreground)]">{thread.id}</p>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
