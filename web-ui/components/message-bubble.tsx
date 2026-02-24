import type { ChatMessage } from "@/lib/event-reducer";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
            : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)]"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
    </article>
  );
}
