import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default("127.0.0.1"),
  CORS_ORIGIN: z
    .string()
    .default("http://localhost:3000,http://127.0.0.1:3000"),
  CODEX_BIN: z.string().default("codex"),
  CODEX_CWD: z.string().optional(),
  CODEX_MODEL: z.string().default("gpt-5.3-codex"),
  CODEX_APPROVAL_POLICY: z.string().default("on-request"),
  CODEX_WRITABLE_ROOTS: z.string().default(process.cwd()),
  CODEX_NETWORK_ACCESS: z.enum(["true", "false"]).default("true"),
  HTTP_BODY_LIMIT_MB: z.coerce.number().positive().max(100).default(20),
  SSE_HEARTBEAT_MS: z.coerce.number().default(15000),
  THREAD_MESSAGES_PAGE_SIZE: z.coerce.number().int().positive().max(100).default(10),
  TUNNEL_COMMAND: z.string().default("ngrok"),
  TUNNEL_PROVIDER_HOST: z.string().default("https://ngrok.app"),
  NGROK_AUTHTOKEN: z.string().optional(),
  TUNNEL_LOCAL_HOST: z.string().default("nginx"),
  TUNNEL_LOCAL_PORT: z.coerce.number().int().positive().default(80),
  TUNNEL_START_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  TUNNEL_SESSION_COOKIE_NAME: z.string().default("codex_tunnel_session"),
  TUNNEL_LOGIN_DELAY_MS: z.coerce.number().int().nonnegative().default(500),
  TUNNEL_LOGIN_JITTER_MS: z.coerce.number().int().nonnegative().default(250),
});

export type Env = {
  nodeEnv: "development" | "test" | "production";
  port: number;
  host: string;
  corsOrigins: string[];
  codexBin: string;
  codexCwd?: string;
  codexModel: string;
  codexApprovalPolicy: string;
  codexWritableRoots: string[];
  codexNetworkAccess: boolean;
  httpBodyLimitBytes: number;
  sseHeartbeatMs: number;
  threadMessagesPageSize: number;
  tunnelCommand: string;
  tunnelProviderHost: string;
  ngrokAuthtoken?: string;
  tunnelLocalHost: string;
  tunnelLocalPort: number;
  tunnelStartTimeoutMs: number;
  tunnelSessionCookieName: string;
  tunnelLoginDelayMs: number;
  tunnelLoginJitterMs: number;
};

export function loadEnv(): Env {
  const parsed = envSchema.parse(process.env);
  const platformDefaultOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
  const configuredOrigins = parsed.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  const approvalPolicyMap: Record<string, string> = {
    // Legacy values
    unlessTrusted: "untrusted",
    onFailure: "on-failure",
    onRequest: "on-request",
    // Current codex-cli values
    untrusted: "untrusted",
    "on-failure": "on-failure",
    "on-request": "on-request",
    never: "never",
  };
  const normalizedApprovalPolicy =
    approvalPolicyMap[parsed.CODEX_APPROVAL_POLICY] ?? parsed.CODEX_APPROVAL_POLICY;

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    corsOrigins: [...new Set([...platformDefaultOrigins, ...configuredOrigins])],
    codexBin: parsed.CODEX_BIN,
    codexCwd: parsed.CODEX_CWD,
    codexModel: parsed.CODEX_MODEL,
    codexApprovalPolicy: normalizedApprovalPolicy,
    codexWritableRoots: parsed.CODEX_WRITABLE_ROOTS.split(":").map((entry) => entry.trim()),
    codexNetworkAccess: parsed.CODEX_NETWORK_ACCESS === "true",
    httpBodyLimitBytes: Math.floor(parsed.HTTP_BODY_LIMIT_MB * 1024 * 1024),
    sseHeartbeatMs: parsed.SSE_HEARTBEAT_MS,
    threadMessagesPageSize: parsed.THREAD_MESSAGES_PAGE_SIZE,
    tunnelCommand: parsed.TUNNEL_COMMAND,
    tunnelProviderHost: parsed.TUNNEL_PROVIDER_HOST,
    ngrokAuthtoken: parsed.NGROK_AUTHTOKEN,
    tunnelLocalHost: parsed.TUNNEL_LOCAL_HOST,
    tunnelLocalPort: parsed.TUNNEL_LOCAL_PORT,
    tunnelStartTimeoutMs: parsed.TUNNEL_START_TIMEOUT_MS,
    tunnelSessionCookieName: parsed.TUNNEL_SESSION_COOKIE_NAME,
    tunnelLoginDelayMs: parsed.TUNNEL_LOGIN_DELAY_MS,
    tunnelLoginJitterMs: parsed.TUNNEL_LOGIN_JITTER_MS,
  };
}
