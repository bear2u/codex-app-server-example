import { EventEmitter } from "node:events";
import Fastify from "fastify";
import { ApiError } from "@codex-app/shared-contracts";
import { ZodError } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/config/env";
import { registerTunnelRoutes } from "../src/routes/tunnel";
import { TunnelService } from "../src/services/tunnel-service";

class FakeReadable extends EventEmitter {
  emitData(value: string): void {
    this.emit("data", value);
  }
}

class FakeTunnelProcess extends EventEmitter {
  stdout = new FakeReadable() as any;
  stderr = new FakeReadable() as any;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.emit("exit", 0, typeof signal === "string" ? signal : null);
    return true;
  }
}

function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    nodeEnv: "test",
    port: 4000,
    host: "127.0.0.1",
    corsOrigins: ["http://localhost:3000"],
    codexBin: "codex",
    codexCwd: process.cwd(),
    codexModel: "gpt-5.2-codex",
    codexApprovalPolicy: "on-request",
    codexWritableRoots: [process.cwd()],
    codexNetworkAccess: true,
    httpBodyLimitBytes: 20 * 1024 * 1024,
    sseHeartbeatMs: 15000,
    threadMessagesPageSize: 10,
    tunnelCommand: "ngrok",
    tunnelProviderHost: "https://ngrok.app",
    ngrokAuthtoken: "test-token",
    tunnelLocalHost: "nginx",
    tunnelLocalPort: 80,
    tunnelStartTimeoutMs: 500,
    tunnelSessionCookieName: "codex_tunnel_session",
    tunnelLoginDelayMs: 0,
    tunnelLoginJitterMs: 0,
    ...overrides,
  };
}

function createLoggerStub() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function getFirstSetCookieHeader(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return Array.isArray(value) ? value[0] : value;
}

describe("tunnel routes", () => {
  let app = Fastify();

  beforeEach(async () => {
    const child = new FakeTunnelProcess();
    const tunnelService = new TunnelService(createEnv(), createLoggerStub(), {
      spawnProcess: () => {
        setTimeout(() => {
          child.stdout.emitData("msg=\"started tunnel\" url=https://routes-test.ngrok-free.app");
        }, 0);
        return child as any;
      },
      lookupExternalIp: async () => "203.0.113.42",
    });

    app = Fastify();
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

      reply.status(500).send({
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      });
    });
    registerTunnelRoutes(app, tunnelService);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns canManage=false for remote requests on admin state endpoint", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/v1/tunnel/admin/state",
      headers: {
        "x-codex-can-manage-tunnel": "false",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      canManage: false,
      status: "off",
    });
  });

  it("rejects remote admin control requests", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tunnel/admin/enable",
      headers: {
        "content-type": "application/json",
        "x-codex-can-manage-tunnel": "false",
      },
      payload: {
        password: "password-1234",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("validates admin enable payload schema", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/tunnel/admin/enable",
      headers: {
        "content-type": "application/json",
        "x-codex-can-manage-tunnel": "true",
      },
      payload: {
        password: "short",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("supports public login success/failure and session check lifecycle", async () => {
    const enabled = await app.inject({
      method: "POST",
      url: "/v1/tunnel/admin/enable",
      headers: {
        "content-type": "application/json",
        "x-codex-can-manage-tunnel": "true",
      },
      payload: {
        password: "password-1234",
      },
    });
    expect(enabled.statusCode).toBe(200);

    const badLogin = await app.inject({
      method: "POST",
      url: "/v1/tunnel/public/login",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        password: "wrong-password",
      },
    });
    expect(badLogin.statusCode).toBe(401);

    const okLogin = await app.inject({
      method: "POST",
      url: "/v1/tunnel/public/login",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        password: "password-1234",
        next: "/settings",
      },
    });
    expect(okLogin.statusCode).toBe(200);
    expect(okLogin.json()).toEqual({
      ok: true,
      redirectTo: "/settings",
    });

    const setCookie = getFirstSetCookieHeader(okLogin.headers["set-cookie"]);
    expect(setCookie).toBeTruthy();
    const sessionCookie = setCookie!.split(";")[0];

    const sessionMissing = await app.inject({
      method: "GET",
      url: "/v1/tunnel/public/session/check",
    });
    expect(sessionMissing.statusCode).toBe(401);

    const sessionOk = await app.inject({
      method: "GET",
      url: "/v1/tunnel/public/session/check",
      headers: {
        cookie: sessionCookie,
      },
    });
    expect(sessionOk.statusCode).toBe(204);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/tunnel/public/logout",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    expect(getFirstSetCookieHeader(logout.headers["set-cookie"])).toContain("Max-Age=0");

    const sessionAfterLogout = await app.inject({
      method: "GET",
      url: "/v1/tunnel/public/session/check",
      headers: {
        cookie: sessionCookie,
      },
    });
    expect(sessionAfterLogout.statusCode).toBe(401);
  });
});
