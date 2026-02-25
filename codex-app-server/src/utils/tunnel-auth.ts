import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_SCHEME = "scrypt";
const SALT_LENGTH = 16;
const DERIVED_KEY_LENGTH = 32;

export type CookieSameSite = "Strict" | "Lax" | "None";

export interface SerializeCookieOptions {
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: CookieSameSite;
  maxAgeSeconds?: number;
}

export function hashTunnelPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString("base64url");
  const hash = scryptSync(password, salt, DERIVED_KEY_LENGTH) as Buffer;
  return `${HASH_SCHEME}$${salt}$${hash.toString("base64url")}`;
}

export function verifyTunnelPassword(password: string, hash: string): boolean {
  const [scheme, salt, encodedDigest] = hash.split("$");
  if (scheme !== HASH_SCHEME || !salt || !encodedDigest) {
    return false;
  }

  try {
    const expected = Buffer.from(encodedDigest, "base64url");
    const actual = scryptSync(password, salt, expected.length) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function createTunnelSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const parsed: Record<string, string> = {};
  for (const token of cookieHeader.split(";")) {
    const separator = token.indexOf("=");
    if (separator < 0) {
      continue;
    }

    const rawKey = token.slice(0, separator).trim();
    if (!rawKey) {
      continue;
    }

    const rawValue = token.slice(separator + 1).trim();
    try {
      parsed[rawKey] = decodeURIComponent(rawValue);
    } catch {
      parsed[rawKey] = rawValue;
    }
  }

  return parsed;
}

export function serializeCookie(name: string, value: string, options: SerializeCookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);

  if (typeof options.maxAgeSeconds === "number") {
    const maxAge = Math.max(0, Math.floor(options.maxAgeSeconds));
    parts.push(`Max-Age=${maxAge}`);
    if (maxAge === 0) {
      parts.push("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  }
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  if (options.secure) {
    parts.push("Secure");
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join("; ");
}

export function sanitizeTunnelNextPath(nextPath: string | undefined): string {
  if (!nextPath || typeof nextPath !== "string") {
    return "/";
  }
  if (!nextPath.startsWith("/") || nextPath.startsWith("//")) {
    return "/";
  }

  try {
    const parsed = new URL(nextPath, "http://localhost");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}
