interface ReasoningPanelProps {
  text: string;
}

export function ReasoningPanel({ text }: ReasoningPanelProps) {
  if (!text) {
    return null;
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)]/80 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Reasoning</p>
      <p className="whitespace-pre-wrap text-xs leading-5 text-[var(--muted-foreground)]">{text}</p>
    </section>
  );
}
