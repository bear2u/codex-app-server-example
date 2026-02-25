import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { ApiError } from "@codex-app/shared-contracts";
import type { Env } from "./config/env";
import { CodexProcessManager } from "./rpc/codex-process-manager";
import { JsonRpcClient } from "./rpc/jsonrpc-client";
import { NotificationRouter } from "./rpc/notification-router";
import { registerApprovalRoutes } from "./routes/approvals";
import { registerAuthRoutes } from "./routes/auth";
import { registerEventRoutes } from "./routes/events";
import { registerThreadRoutes } from "./routes/threads";
import { registerTunnelRoutes } from "./routes/tunnel";
import { registerTurnRoutes } from "./routes/turns";
import { ApprovalService } from "./services/approval-service";
import { AuthService } from "./services/auth-service";
import { ThreadService } from "./services/thread-service";
import { TunnelService } from "./services/tunnel-service";
import { TurnService } from "./services/turn-service";
import { UiEventBus } from "./utils/ui-event-bus";

function isAllowedTunnelOrigin(origin: string, env: Env): boolean {
  try {
    const originUrl = new URL(origin);
    const providerUrl = new URL(env.tunnelProviderHost);
    const originHost = originUrl.hostname.toLowerCase();
    const providerHost = providerUrl.hostname.toLowerCase();
    const isNgrokHost =
      originHost.endsWith(".ngrok.app") ||
      originHost.endsWith(".ngrok-free.app") ||
      originHost.endsWith(".ngrok.dev") ||
      originHost.endsWith(".ngrok.io");
    const tunnelCommand = env.tunnelCommand.trim().toLowerCase();

    return originHost === providerHost || originHost.endsWith(`.${providerHost}`) || tunnelCommand === "ngrok" && isNgrokHost;
  } catch {
    return false;
  }
}

export async function createApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.nodeEnv === "development" ? "info" : "warn",
    },
    bodyLimit: env.httpBodyLimitBytes,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests without Origin (curl, server-side checks),
      // configured browser origins, and dynamic tunnel subdomains.
      if (!origin || env.corsOrigins.includes(origin) || isAllowedTunnelOrigin(origin, env)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });

  const processManager = new CodexProcessManager(env, app.log);
  const rpc = new JsonRpcClient(processManager, app.log, {
    name: "codex_web_ui",
    title: "Codex Web UI",
    version: "0.1.0",
  });

  const eventBus = new UiEventBus(app.log, env.sseHeartbeatMs);
  const notificationRouter = new NotificationRouter(rpc, eventBus, app.log);
  notificationRouter.start();

  const authService = new AuthService(rpc);
  const threadService = new ThreadService(rpc, env);
  const turnService = new TurnService(rpc, env);
  const tunnelService = new TunnelService(env, app.log);
  const approvalService = new ApprovalService(rpc, eventBus, app.log);
  approvalService.start();

  registerAuthRoutes(app, authService);
  registerThreadRoutes(app, threadService);
  registerTurnRoutes(app, turnService);
  registerApprovalRoutes(app, approvalService);
  registerEventRoutes(app, eventBus);
  registerTunnelRoutes(app, tunnelService);

  app.get("/healthz", async () => ({ status: "ok" }));

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({
        code: "INVALID_REQUEST",
        message: "Invalid request payload",
        issues: error.issues,
      });
      return;
    }

    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        code: error.code,
        message: error.message,
      });
      return;
    }

    app.log.error({ err: error }, "Unhandled server error");
    reply.status(500).send({
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    });
  });

  app.addHook("onClose", async () => {
    eventBus.close();
    await tunnelService.shutdown();
    await rpc.close();
  });

  return app;
}
