import { describe, expect, it } from "vitest";
import { parseJsonRpcLine } from "../src/utils/json-rpc";

describe("parseJsonRpcLine", () => {
  it("parses valid json-rpc line", () => {
    const parsed = parseJsonRpcLine('{"id":1,"result":{"ok":true}}');

    expect(parsed).toEqual({ id: 1, result: { ok: true } });
  });

  it("returns null for invalid line", () => {
    const parsed = parseJsonRpcLine("{bad json");
    expect(parsed).toBeNull();
  });

  it("returns null for empty line", () => {
    const parsed = parseJsonRpcLine("   ");
    expect(parsed).toBeNull();
  });
});
