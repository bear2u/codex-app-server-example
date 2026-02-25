"use client";

import { useEffect, useMemo, useRef } from "react";

export interface UiLogEntry {
  id: string;
  ts: number;
  source: "ui" | "sse" | "network";
  level: "info" | "warn" | "error";
  message: string;
  detail?: string;
}

interface LogPanelProps {
  entries: UiLogEntry[];
  logsEnabled: boolean;
  onToggleLogs: () => void;
  onClearLogs: () => void;
}

function levelClass(level: UiLogEntry["level"]): string {
  if (level === "error") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (level === "warn") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function sourceClass(source: UiLogEntry["source"]): string {
  if (source === "sse") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (source === "network") {
    return "border-sky-300 bg-sky-50 text-sky-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

export function LogPanel({ entries, logsEnabled, onToggleLogs, onClearLogs }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastUpdatedLabel = useMemo(() => {
    if (!entries.length) {
      return "No logs yet";
    }
    return new Date(entries[entries.length - 1]!.ts).toLocaleTimeString();
  }, [entries]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !logsEnabled) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [entries.length, logsEnabled]);

  return (
    <aside className="flex min-h-0 w-full flex-col rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Runtime Logs</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleLogs}
            className={`inline-flex min-h-9 items-center rounded-md border px-2 py-1 text-xs font-semibold transition-colors ${
              logsEnabled
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-strong)]"
                : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)] hover:bg-[var(--panel-strong)]"
            }`}
          >
            {logsEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            onClick={onClearLogs}
            className="inline-flex min-h-9 items-center rounded-md border border-[var(--border)] px-2 py-1 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel-strong)]"
          >
            Clear
          </button>
        </div>
      </div>

      <p className="mb-2 text-[11px] text-[var(--muted-foreground)]">Last update: {lastUpdatedLabel}</p>

      {!logsEnabled ? (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/40 px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">
          Logs are paused. Turn On to resume capture.
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {entries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--panel-strong)]/40 px-3 py-3 text-xs text-[var(--muted-foreground)]">
              Waiting for runtime events...
            </div>
          ) : null}
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${sourceClass(entry.source)}`}>
                  {entry.source.toUpperCase()}
                </span>
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${levelClass(entry.level)}`}>
                  {entry.level.toUpperCase()}
                </span>
                <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
                  {new Date(entry.ts).toLocaleTimeString()}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-[var(--foreground)]">{entry.message}</p>
              {entry.detail ? (
                <code className="mt-1 block rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1 text-[11px] text-[var(--muted-foreground)]">
                  {entry.detail}
                </code>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </aside>
  );
}
