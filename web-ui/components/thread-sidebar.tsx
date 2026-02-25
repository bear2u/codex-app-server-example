import type { ThreadSummary } from "@codex-app/shared-contracts";

interface ThreadSidebarProps {
  threads: ThreadSummary[];
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
  newThreadWorkspacePath: string;
  onNewThreadWorkspacePathChange: (value: string) => void;
  isMobileDrawer?: boolean;
  onCloseMobile?: () => void;
}

export function ThreadSidebar({
  threads,
  currentThreadId,
  onSelectThread,
  onCreateThread,
  newThreadWorkspacePath,
  onNewThreadWorkspacePathChange,
  isMobileDrawer = false,
  onCloseMobile,
}: ThreadSidebarProps) {
  const visibleThreads = threads.slice(0, 10);

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--border)] bg-[var(--panel)]/90 p-3 backdrop-blur-sm md:max-w-72 md:p-4">
      {isMobileDrawer ? (
        <div className="mb-2 flex items-center justify-between md:hidden">
          <p className="text-sm font-semibold text-[var(--foreground)]">Threads</p>
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--border)] px-3 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            Close
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onCreateThread}
        className="cursor-pointer rounded-lg bg-[var(--accent)] px-3 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-colors duration-200 hover:bg-[var(--accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        New Thread
      </button>

      <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]/60 p-2">
        <label htmlFor="thread-workspace-input" className="mb-1 block text-[11px] font-semibold text-[var(--muted-foreground)]">
          New Thread Workspace
        </label>
        <input
          id="thread-workspace-input"
          type="text"
          value={newThreadWorkspacePath}
          onChange={(event) => onNewThreadWorkspacePathChange(event.target.value)}
          placeholder="/absolute/path/to/workspace"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)]"
        />
      </div>

      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
        {visibleThreads.map((thread) => {
          const active = thread.id === currentThreadId;
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelectThread(thread.id)}
              className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
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

      <a
        href="/settings"
        onClick={() => onCloseMobile?.()}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        Settings
      </a>
    </aside>
  );
}
