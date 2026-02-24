import { describe, expect, it } from "vitest";
import { parseInlineTextParts, parseMessageSegments } from "../lib/message-format";

describe("parseMessageSegments", () => {
  it("splits markdown code fences into text and code segments", () => {
    const input = [
      "Before code",
      "```ts",
      "const value = 1;",
      "```",
      "After code",
    ].join("\n");

    const segments = parseMessageSegments(input);
    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({ type: "text", content: "Before code\n" });
    expect(segments[1]).toMatchObject({ type: "code", language: "ts", content: "const value = 1;" });
    expect(segments[2]).toMatchObject({ type: "text", content: "\nAfter code" });
  });

  it("keeps plain text when no code fence exists", () => {
    const segments = parseMessageSegments("hello");
    expect(segments).toEqual([{ type: "text", content: "hello" }]);
  });
});

describe("parseInlineTextParts", () => {
  it("splits inline code marks", () => {
    const parts = parseInlineTextParts("Use `pnpm dev` now");
    expect(parts).toEqual([
      { type: "text", content: "Use " },
      { type: "inline-code", content: "pnpm dev" },
      { type: "text", content: " now" },
    ]);
  });
});
