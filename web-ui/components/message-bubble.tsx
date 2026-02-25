/* eslint-disable @next/next/no-img-element */
import { memo } from "react";
import type { ChatMessage } from "@/lib/event-reducer";
import { MessageRichText } from "./message-rich-text";

interface MessageBubbleProps {
  message: ChatMessage;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const attachments = message.attachments ?? [];
  const imageAttachments = attachments.filter((attachment) => attachment.type === "image");
  const localImageAttachments = attachments.filter((attachment) => attachment.type === "localImage");
  const hasText = message.text.trim().length > 0;

  return (
    <article className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[94%] rounded-2xl border px-3 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[88%] sm:px-4 sm:py-3 lg:max-w-[85%] ${
          isUser
            ? "border-[var(--accent)] bg-white text-[var(--foreground)]"
            : "border-[var(--border)] bg-[var(--panel)] text-[var(--foreground)]"
        }`}
      >
        {hasText ? <MessageRichText text={message.text} /> : null}

        {imageAttachments.length ? (
          <div className={`grid grid-cols-1 gap-2 sm:grid-cols-2 ${hasText ? "mt-3" : ""}`}>
            {imageAttachments.map((attachment, index) => (
              <img
                key={`${attachment.url.slice(0, 64)}-${index}`}
                src={attachment.url}
                alt="User attachment"
                className="max-h-56 w-full rounded-lg border border-black/10 object-cover"
              />
            ))}
          </div>
        ) : null}

        {localImageAttachments.length ? (
          <div className={`space-y-1 ${hasText || imageAttachments.length ? "mt-3" : ""}`}>
            {localImageAttachments.map((attachment, index) => (
              <div
                key={`${attachment.path}-${index}`}
                className="rounded-md border border-black/10 bg-black/10 px-2 py-1 text-xs"
              >
                localImage: {attachment.path}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
});
