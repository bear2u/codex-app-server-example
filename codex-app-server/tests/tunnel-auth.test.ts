import { describe, expect, it } from "vitest";
import { hashTunnelPassword, sanitizeTunnelNextPath, verifyTunnelPassword } from "../src/utils/tunnel-auth";

describe("tunnel-auth", () => {
  it("hashes and verifies password", () => {
    const password = "strong-password-1234";
    const hash = hashTunnelPassword(password);

    expect(verifyTunnelPassword(password, hash)).toBe(true);
    expect(verifyTunnelPassword("wrong-password", hash)).toBe(false);
  });

  it("sanitizes redirect path", () => {
    expect(sanitizeTunnelNextPath("/chat?thread=1")).toBe("/chat?thread=1");
    expect(sanitizeTunnelNextPath("https://evil.example")).toBe("/");
    expect(sanitizeTunnelNextPath("//evil.example")).toBe("/");
    expect(sanitizeTunnelNextPath(undefined)).toBe("/");
  });
});
