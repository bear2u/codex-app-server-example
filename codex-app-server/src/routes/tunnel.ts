import { z } from "zod";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ApiError } from "@codex-app/shared-contracts";
import { TunnelService } from "../services/tunnel-service";
import { parseCookies, serializeCookie } from "../utils/tunnel-auth";

const enableTunnelSchema = z.object({
  password: z.string().min(8).max(256),
});

const publicLoginSchema = z.object({
  password: z.string().min(1).max(256),
  next: z.string().optional(),
});

function readHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function canManageTunnel(request: FastifyRequest): boolean {
  const forwardedFlag = readHeaderValue(request.headers["x-codex-can-manage-tunnel"]);
  if (typeof forwardedFlag === "string") {
    const normalized = forwardedFlag.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  const hostHeader = readHeaderValue(request.headers.host);
  const host = hostHeader?.split(":")[0]?.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

function requireManagePermission(request: FastifyRequest): void {
  if (!canManageTunnel(request)) {
    throw new ApiError("TUNNEL_FORBIDDEN", "Only localhost admin can change tunnel settings.", 403);
  }
}

function isSecureRequest(request: FastifyRequest): boolean {
  const forwardedProto = readHeaderValue(request.headers["x-forwarded-proto"]);
  if (typeof forwardedProto === "string" && forwardedProto.toLowerCase().includes("https")) {
    return true;
  }
  return request.protocol === "https";
}

function readSessionId(request: FastifyRequest, tunnelService: TunnelService): string | undefined {
  const rawCookie = readHeaderValue(request.headers.cookie);
  const cookies = parseCookies(rawCookie);
  return cookies[tunnelService.getSessionCookieName()];
}

function setSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  tunnelService: TunnelService,
  sessionId: string,
): void {
  reply.header(
    "Set-Cookie",
    serializeCookie(tunnelService.getSessionCookieName(), sessionId, {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecureRequest(request),
    }),
  );
}

function clearSessionCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  tunnelService: TunnelService,
): void {
  reply.header(
    "Set-Cookie",
    serializeCookie(tunnelService.getSessionCookieName(), "", {
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: isSecureRequest(request),
      maxAgeSeconds: 0,
    }),
  );
}

export function registerTunnelRoutes(app: FastifyInstance, tunnelService: TunnelService): void {
  app.get("/v1/tunnel/admin/state", async (request) => {
    return tunnelService.readAdminState(canManageTunnel(request));
  });

  app.post("/v1/tunnel/admin/enable", async (request) => {
    requireManagePermission(request);
    const body = enableTunnelSchema.parse(request.body ?? {});
    return tunnelService.enable(body.password);
  });

  app.post("/v1/tunnel/admin/disable", async (request) => {
    requireManagePermission(request);
    return tunnelService.disable();
  });

  app.post("/v1/tunnel/public/login", async (request, reply) => {
    const body = publicLoginSchema.parse(request.body ?? {});
    const result = await tunnelService.login(body.password, body.next);
    setSessionCookie(request, reply, tunnelService, result.sessionId);
    return {
      ok: true as const,
      redirectTo: result.redirectTo,
    };
  });

  app.post("/v1/tunnel/public/logout", async (request, reply) => {
    const sessionId = readSessionId(request, tunnelService);
    tunnelService.logout(sessionId);
    clearSessionCookie(request, reply, tunnelService);
    return { ok: true as const };
  });

  app.get("/v1/tunnel/public/session/check", async (request, reply) => {
    const sessionId = readSessionId(request, tunnelService);
    if (tunnelService.isSessionValid(sessionId)) {
      return reply.code(204).send();
    }
    return reply.code(401).send();
  });
}
