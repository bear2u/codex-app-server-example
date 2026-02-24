import { useMemo } from "react";
import { parseInlineTextParts, parseMessageSegments } from "@/lib/message-format";
import { CodeBlock } from "./code-block";

interface MessageRichTextProps {
  text: string;
}

export function MessageRichText({ text }: MessageRichTextProps) {
  const segments = useMemo(() => parseMessageSegments(text), [text]);

  if (!segments.length) {
    return null;
  }

  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        if (segment.type === "code") {
          return (
            <CodeBlock
              key={`code-${index}-${segment.language}`}
              code={segment.content}
              language={segment.language}
              showLineNumbers
            />
          );
        }

        const inlineParts = parseInlineTextParts(segment.content);

        return (
          <p key={`text-${index}`} className="whitespace-pre-wrap break-words">
            {inlineParts.map((part, partIndex) =>
              part.type === "inline-code" ? (
                <code
                  key={`inline-${partIndex}`}
                  className="break-all rounded border border-[#9ecfcb] bg-[#e7f4f2] px-1 py-0.5 font-mono text-[0.92em] text-[#165f5a]"
                >
                  {part.content}
                </code>
              ) : (
                <span key={`plain-${partIndex}`}>{part.content}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}
