import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../src/config/env";
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

describe("TunnelService", () => {
  it("enables tunnel, creates sessions, and fully clears state on disable", async () => {
    const child = new FakeTunnelProcess();
    const service = new TunnelService(createEnv(), createLoggerStub(), {
      spawnProcess: () => {
        setTimeout(() => {
          child.stdout.emitData("msg=\"started tunnel\" url=https://alpha-test.ngrok-free.app");
        }, 0);
        return child as any;
      },
      lookupExternalIp: async () => "203.0.113.42",
    });

    const enabled = await service.enable("secret-password");
    expect(enabled.status).toBe("on");
    expect(enabled.publicUrl).toBe("https://alpha-test.ngrok-free.app");

    const stateOn = await service.readAdminState(true);
    expect(stateOn.status).toBe("on");
    expect(stateOn.hasPassword).toBe(true);
    expect(stateOn.externalIp).toBe("203.0.113.42");

    const login = await service.login("secret-password", "/");
    expect(login.redirectTo).toBe("/");
    expect(service.isSessionValid(login.sessionId)).toBe(true);

    service.logout(login.sessionId);
    expect(service.isSessionValid(login.sessionId)).toBe(false);

    const secondLogin = await service.login("secret-password", "/settings");
    expect(service.isSessionValid(secondLogin.sessionId)).toBe(true);

    const disabled = await service.disable();
    expect(disabled.status).toBe("off");
    expect(service.isSessionValid(secondLogin.sessionId)).toBe(false);

    const stateOff = await service.readAdminState(true);
    expect(stateOff.status).toBe("off");
    expect(stateOff.publicUrl).toBeNull();
    expect(stateOff.hasPassword).toBe(false);
  });

  it("transitions to error when tunnel process exits before URL assignment", async () => {
    const child = new FakeTunnelProcess();
    const service = new TunnelService(createEnv(), createLoggerStub(), {
      spawnProcess: () => {
        setTimeout(() => {
          child.emit("exit", 1, null);
        }, 0);
        return child as any;
      },
      lookupExternalIp: async () => "203.0.113.42",
    });

    await expect(service.enable("secret-password")).rejects.toThrowError();

    const state = await service.readAdminState(true);
    expect(state.status).toBe("error");
    expect(state.publicUrl).toBeNull();
    expect(state.hasPassword).toBe(false);
    expect(state.lastError).toBeTruthy();
  });

  it("invalidates all sessions when an active tunnel exits unexpectedly", async () => {
    const child = new FakeTunnelProcess();
    const service = new TunnelService(createEnv(), createLoggerStub(), {
      spawnProcess: () => {
        setTimeout(() => {
          child.stdout.emitData("msg=\"started tunnel\" url=https://beta-test.ngrok-free.app");
        }, 0);
        return child as any;
      },
      lookupExternalIp: async () => "203.0.113.42",
    });

    await service.enable("secret-password");
    const login = await service.login("secret-password", "/");
    expect(service.isSessionValid(login.sessionId)).toBe(true);

    child.emit("exit", 1, null);
    expect(service.isSessionValid(login.sessionId)).toBe(false);

    const state = await service.readAdminState(true);
    expect(state.status).toBe("off");
    expect(state.publicUrl).toBeNull();
    expect(state.hasPassword).toBe(false);
  });
});
