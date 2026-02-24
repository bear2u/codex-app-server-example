import type { SourceRef } from "@codex-app/shared-contracts";

interface SourcesPanelProps {
  sources: SourceRef[];
}

export function SourcesPanel({ sources }: SourcesPanelProps) {
  if (!sources.length) {
    return null;
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/80 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Sources</p>
      <ul className="space-y-1">
        {sources.map((source, index) => (
          <li key={`${source.title}-${index}`} className="text-xs text-[var(--foreground)]">
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer underline decoration-[var(--accent)] underline-offset-2 transition-colors duration-200 hover:text-[var(--accent)]"
              >
                {source.title}
              </a>
            ) : (
              <span>{source.title}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
