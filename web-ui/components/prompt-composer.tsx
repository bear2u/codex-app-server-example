import { useState } from "react";

interface PromptComposerProps {
  disabled?: boolean;
  sending?: boolean;
  thinking?: boolean;
  canInterrupt?: boolean;
  onSend: (text: string) => Promise<void>;
  onInterrupt: () => Promise<void>;
}

export function PromptComposer({
  disabled,
  sending,
  thinking,
  canInterrupt,
  onSend,
  onInterrupt,
}: PromptComposerProps) {
  const [value, setValue] = useState("");

  const submit = async () => {
    const text = value.trim();
    if (!text || disabled || sending || thinking) {
      return;
    }

    setValue("");
    await onSend(text);
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3">
      <label htmlFor="prompt-input" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Prompt
      </label>

      <textarea
        id="prompt-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        placeholder="Ask Codex to inspect, edit, or review your project..."
        className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] outline-none transition-colors duration-200 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--focus)]"
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={disabled || sending || thinking}
          onClick={() => void submit()}
          className="cursor-pointer rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition-colors duration-200 hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending..." : thinking ? "Generating..." : "Send"}
        </button>

        <button
          type="button"
          disabled={!canInterrupt}
          onClick={() => void onInterrupt()}
          className="cursor-pointer rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition-colors duration-200 hover:bg-[var(--panel-strong)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Interrupt
        </button>
      </div>
    </section>
  );
}
