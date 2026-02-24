export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "code"; language: string; content: string };

const CODE_FENCE_PATTERN = /```([^\n`]*)\n?([\s\S]*?)```/g;

export function parseMessageSegments(text: string): MessageSegment[] {
  if (!text) {
    return [];
  }

  const segments: MessageSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(CODE_FENCE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      const before = text.slice(lastIndex, start);
      if (before.length > 0) {
        segments.push({ type: "text", content: before });
      }
    }

    const language = (match[1] ?? "").trim().toLowerCase() || "text";
    let code = match[2] ?? "";
    if (code.endsWith("\n")) {
      code = code.slice(0, -1);
    }
    segments.push({
      type: "code",
      language,
      content: code,
    });

    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex);
    if (trailing.length > 0) {
      segments.push({ type: "text", content: trailing });
    }
  }

  return segments.length ? segments : [{ type: "text", content: text }];
}

export type InlineTextPart =
  | { type: "text"; content: string }
  | { type: "inline-code"; content: string };

const INLINE_CODE_PATTERN = /(`[^`\n]+`)/g;

export function parseInlineTextParts(text: string): InlineTextPart[] {
  if (!text) {
    return [];
  }

  const rawParts = text.split(INLINE_CODE_PATTERN);
  const parts: InlineTextPart[] = [];

  for (const part of rawParts) {
    if (!part) {
      continue;
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      parts.push({ type: "inline-code", content: part.slice(1, -1) });
      continue;
    }

    parts.push({ type: "text", content: part });
  }

  return parts;
}
