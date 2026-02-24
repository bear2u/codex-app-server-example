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
  CODEX_MODEL: z.string().default("gpt-5.2-codex"),
  CODEX_APPROVAL_POLICY: z.string().default("on-request"),
  CODEX_WRITABLE_ROOTS: z.string().default(process.cwd()),
  CODEX_NETWORK_ACCESS: z.enum(["true", "false"]).default("true"),
  SSE_HEARTBEAT_MS: z.coerce.number().default(15000),
  THREAD_MESSAGES_PAGE_SIZE: z.coerce.number().int().positive().max(100).default(10),
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
  sseHeartbeatMs: number;
  threadMessagesPageSize: number;
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
    sseHeartbeatMs: parsed.SSE_HEARTBEAT_MS,
    threadMessagesPageSize: parsed.THREAD_MESSAGES_PAGE_SIZE,
  };
}
