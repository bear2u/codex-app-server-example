import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import { basename } from "node:path";
import {
  ApiError,
  type DisableTunnelResponse,
  type EnableTunnelResponse,
  type TunnelAdminStateResponse,
  type TunnelStatus,
} from "@codex-app/shared-contracts";
import type { Env } from "../config/env";
import type { AppLogger } from "../types/logger";
import {
  createTunnelSessionId,
  hashTunnelPassword,
  sanitizeTunnelNextPath,
  verifyTunnelPassword,
} from "../utils/tunnel-auth";

const URL_PATTERN = /https?:\/\/[^\s"'<>]+/gi;
const PRIVATE_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]", "nginx"]);

interface TunnelSession {
  createdAt: number;
}

interface TunnelServiceDependencies {
  spawnProcess?: (
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;
  now?: () => number;
  random?: () => number;
  lookupExternalIp?: () => Promise<string | null>;
}

export class TunnelService {
  private static readonly EXTERNAL_IP_CACHE_TTL_MS = 30_000;
  private static readonly EXTERNAL_IP_LOOKUP_TIMEOUT_MS = 2_000;

  private status: TunnelStatus = "off";
  private publicUrl: string | null = null;
  private externalIp: string | null = null;
  private externalIpLastCheckedAt = 0;
  private externalIpLookupInFlight: Promise<string | null> | null = null;
  private passwordHash: string | null = null;
  private lastError: string | null = null;
  private startupOutputBuffer: string[] = [];
  private process: ChildProcessWithoutNullStreams | null = null;
  private sessions = new Map<string, TunnelSession>();
  private shuttingDownProcess = false;

  private readonly spawnProcess: (
    command: string,
    args: ReadonlyArray<string>,
    options: SpawnOptionsWithoutStdio,
  ) => ChildProcessWithoutNullStreams;

  private readonly now: () => number;
  private readonly random: () => number;
  private readonly lookupExternalIp: () => Promise<string | null>;

  constructor(
    private readonly env: Env,
    private readonly log: AppLogger,
    dependencies: TunnelServiceDependencies = {},
  ) {
    this.spawnProcess = dependencies.spawnProcess ?? spawn;
    this.now = dependencies.now ?? (() => Date.now());
    this.random = dependencies.random ?? Math.random;
    this.lookupExternalIp = dependencies.lookupExternalIp ?? (() => this.lookupExternalIpFromNetwork());
  }

  async readAdminState(canManage: boolean): Promise<TunnelAdminStateResponse> {
    await this.refreshExternalIpIfStale();

    return {
      canManage,
      status: this.status,
      publicUrl: this.publicUrl,
      externalIp: this.externalIp,
      hasPassword: !!this.passwordHash,
      lastError: this.lastError,
    };
  }

  async enable(password: string): Promise<EnableTunnelResponse> {
    if (this.status === "on") {
      return {
        status: "on",
        publicUrl: this.publicUrl,
      };
    }

    if (this.status === "starting") {
      await this.waitForStartWindow();
      const currentStatus = this.readStatus();
      if (currentStatus === "on") {
        return {
          status: "on",
          publicUrl: this.publicUrl,
        };
      }
      if (currentStatus === "error") {
        throw new ApiError("TUNNEL_START_FAILED", this.lastError ?? "Failed to start tunnel", 503);
      }
      return {
        status: "starting",
        publicUrl: this.publicUrl,
      };
    }

    this.validateNgrokConfiguration();

    this.passwordHash = hashTunnelPassword(password);
    this.sessions.clear();
    this.publicUrl = null;
    this.lastError = null;
    this.startupOutputBuffer = [];
    this.status = "starting";

    this.startTunnelProcess();
    await this.waitForStartWindow();

    const currentStatus = this.readStatus();
    if (currentStatus === "on") {
      return {
        status: "on",
        publicUrl: this.publicUrl,
      };
    }
    if (currentStatus === "error") {
      throw new ApiError("TUNNEL_START_FAILED", this.lastError ?? "Failed to start tunnel", 503);
    }

    return {
      status: "starting",
      publicUrl: this.publicUrl,
    };
  }

  async disable(): Promise<DisableTunnelResponse> {
    await this.stopTunnelProcess();
    this.clearSensitiveState();
    this.status = "off";
    this.publicUrl = null;
    this.lastError = null;
    return { status: "off" };
  }

  async shutdown(): Promise<void> {
    await this.disable();
  }

  async login(password: string, nextPath?: string): Promise<{ sessionId: string; redirectTo: string }> {
    await this.delayLoginResponse();

    if (this.status !== "on" || !this.passwordHash || !verifyTunnelPassword(password, this.passwordHash)) {
      throw new ApiError("TUNNEL_AUTH_FAILED", "Invalid credentials.", 401);
    }

    const sessionId = createTunnelSessionId();
    this.sessions.set(sessionId, { createdAt: this.now() });

    return {
      sessionId,
      redirectTo: sanitizeTunnelNextPath(nextPath),
    };
  }

  logout(sessionId: string | undefined): void {
    if (!sessionId) {
      return;
    }
    this.sessions.delete(sessionId);
  }

  isSessionValid(sessionId: string | undefined): boolean {
    if (this.status !== "on" || !this.passwordHash || !sessionId) {
      return false;
    }
    return this.sessions.has(sessionId);
  }

  getSessionCookieName(): string {
    return this.env.tunnelSessionCookieName;
  }

  private startTunnelProcess(): void {
    const args = this.buildTunnelCommandArgs();
    const child = this.spawnProcess(this.env.tunnelCommand, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: this.buildTunnelProcessEnv(),
    });

    this.process = child;

    const onData = (chunk: Buffer | string) => {
      const raw = chunk.toString();
      this.captureStartupOutput(raw);
      this.tryCapturePublicUrl(raw);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", (error) => {
      this.log.error({ err: error }, "Tunnel process failed to start");
      this.process = null;
      this.status = "error";
      this.publicUrl = null;
      this.lastError = "Failed to start tunnel process.";
      this.clearSensitiveState();
    });

    child.on("exit", (code, signal) => {
      const exitedWhileActive = this.status === "on" || this.status === "starting";
      this.process = null;

      if (this.shuttingDownProcess) {
        return;
      }

      if (!exitedWhileActive) {
        return;
      }

      const exitInfo = signal ? `signal=${signal}` : `code=${code ?? "unknown"}`;
      this.log.warn({ exitInfo }, "Tunnel process exited");

      if (this.status === "starting") {
        this.status = "error";
        this.lastError = this.buildTunnelStartErrorMessage(exitInfo);
        this.publicUrl = null;
        this.clearSensitiveState();
        return;
      }

      this.status = "off";
      this.publicUrl = null;
      this.lastError = "Tunnel process exited. External access has been blocked.";
      this.startupOutputBuffer = [];
      this.clearSensitiveState();
    });
  }

  private tryCapturePublicUrl(rawText: string): void {
    if (this.status !== "starting") {
      return;
    }

    for (const candidate of this.extractCandidateUrls(rawText)) {
      if (!this.isPublicTunnelUrl(candidate)) {
        continue;
      }

      this.publicUrl = candidate;
      this.status = "on";
      this.lastError = null;
      this.log.info({ publicUrl: candidate }, "Tunnel is ready");
      return;
    }
  }

  private clearSensitiveState(): void {
    this.passwordHash = null;
    this.sessions.clear();
  }

  private async waitForStartWindow(): Promise<void> {
    const timeoutAt = this.now() + this.env.tunnelStartTimeoutMs;
    while (this.status === "starting" && this.now() < timeoutAt) {
      await this.sleep(100);
    }

    if (this.status === "starting") {
      this.status = "error";
      this.lastError = "Timed out while waiting for tunnel URL.";
      await this.stopTunnelProcess();
      this.clearSensitiveState();
      this.publicUrl = null;
    }
  }

  private async stopTunnelProcess(): Promise<void> {
    const child = this.process;
    if (!child) {
      return;
    }

    this.shuttingDownProcess = true;
    try {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) {
            return;
          }
          done = true;
          resolve();
        };

        child.once("exit", finish);
        const terminated = child.kill("SIGTERM");
        if (!terminated) {
          finish();
          return;
        }

        setTimeout(() => {
          if (done) {
            return;
          }
          child.kill("SIGKILL");
          setTimeout(finish, 100);
        }, 2_000).unref();
      });
    } finally {
      this.process = null;
      this.shuttingDownProcess = false;
    }
  }

  private async delayLoginResponse(): Promise<void> {
    const jitterMs = this.env.tunnelLoginJitterMs > 0 ? Math.floor(this.random() * this.env.tunnelLoginJitterMs) : 0;
    await this.sleep(this.env.tunnelLoginDelayMs + jitterMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private readStatus(): TunnelStatus {
    return this.status;
  }

  private captureStartupOutput(raw: string): void {
    const lines = raw
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      return;
    }

    this.startupOutputBuffer.push(...lines);
    if (this.startupOutputBuffer.length > 80) {
      this.startupOutputBuffer = this.startupOutputBuffer.slice(-80);
    }
  }

  private buildTunnelStartErrorMessage(exitInfo: string): string {
    const full = this.startupOutputBuffer.join("\n");
    const ngrokCode = full.match(/ERR_NGROK_\d+/)?.[0];

    if (ngrokCode === "ERR_NGROK_107" || full.toLowerCase().includes("authentication failed")) {
      return `ngrok authentication failed (${ngrokCode ?? "AUTH_FAILED"}). Update NGROK_AUTHTOKEN and try again.`;
    }

    if (ngrokCode) {
      return `Error while starting ngrok (${ngrokCode}). Check ngrok logs.`;
    }

    return `Tunnel process exited before obtaining a tunnel URL (${exitInfo}).`;
  }

  private isNgrokCommand(): boolean {
    return basename(this.env.tunnelCommand).toLowerCase() === "ngrok";
  }

  private validateNgrokConfiguration(): void {
    if (!this.isNgrokCommand()) {
      return;
    }

    if (!this.env.ngrokAuthtoken || this.env.ngrokAuthtoken.trim().length === 0) {
      throw new ApiError(
        "TUNNEL_CONFIG_INVALID",
        "NGROK_AUTHTOKEN is not set. Add it to .env and try again.",
        400,
      );
    }
  }

  private buildTunnelCommandArgs(): string[] {
    if (this.isNgrokCommand()) {
      return [
        "http",
        `http://${this.env.tunnelLocalHost}:${this.env.tunnelLocalPort}`,
        "--log",
        "stdout",
        "--log-format",
        "json",
      ];
    }

    const args = [
      "--port",
      String(this.env.tunnelLocalPort),
      "--local-host",
      this.env.tunnelLocalHost,
    ];
    if (this.env.tunnelProviderHost) {
      args.push("--host", this.env.tunnelProviderHost);
    }
    return args;
  }

  private buildTunnelProcessEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (this.isNgrokCommand() && this.env.ngrokAuthtoken) {
      env.NGROK_AUTHTOKEN = this.env.ngrokAuthtoken;
    }
    return env;
  }

  private extractCandidateUrls(rawText: string): string[] {
    const matches = rawText.match(URL_PATTERN);
    if (!matches) {
      return [];
    }

    const normalized = matches.map((value) => value.replace(/[),.;]+$/, ""));
    return [...new Set(normalized)];
  }

  private isPublicTunnelUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return false;
      }

      const host = parsed.hostname.toLowerCase();
      if (PRIVATE_HOSTS.has(host) || host === this.env.tunnelLocalHost.toLowerCase()) {
        return false;
      }

      if (host.endsWith(".local")) {
        return false;
      }

      if (this.isNgrokCommand()) {
        return (
          host.endsWith(".ngrok.app") ||
          host.endsWith(".ngrok-free.app") ||
          host.endsWith(".ngrok.dev") ||
          host.endsWith(".ngrok.io")
        );
      }

      return true;
    } catch {
      return false;
    }
  }

  private async refreshExternalIpIfStale(): Promise<void> {
    const now = this.now();
    if (now - this.externalIpLastCheckedAt < TunnelService.EXTERNAL_IP_CACHE_TTL_MS) {
      return;
    }

    if (this.externalIpLookupInFlight) {
      this.externalIp = await this.externalIpLookupInFlight;
      return;
    }

    this.externalIpLookupInFlight = this.lookupExternalIp();
    try {
      this.externalIp = await this.externalIpLookupInFlight;
    } catch {
      this.externalIp = null;
    } finally {
      this.externalIpLastCheckedAt = this.now();
      this.externalIpLookupInFlight = null;
    }
  }

  private async lookupExternalIpFromNetwork(): Promise<string | null> {
    const candidates = this.resolveExternalIpLookupUrls();

    for (const endpoint of candidates) {
      const value = await this.fetchExternalIp(endpoint);
      if (value) {
        return value;
      }
    }

    return null;
  }

  private resolveExternalIpLookupUrls(): string[] {
    const endpoints: string[] = [];

    if (!this.isNgrokCommand()) {
      try {
        const providerUrl = new URL(this.env.tunnelProviderHost);
        endpoints.push(new URL("/mytunnelpassword", providerUrl).toString());
      } catch {
        // Fall back to generic provider below.
      }
    }

    endpoints.push("https://api.ipify.org");
    return [...new Set(endpoints)];
  }

  private async fetchExternalIp(endpoint: string): Promise<string | null> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => {
      controller.abort();
    }, TunnelService.EXTERNAL_IP_LOOKUP_TIMEOUT_MS);
    timeoutHandle.unref?.();

    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: {
          Accept: "text/plain",
        },
      });

      if (!response.ok) {
        return null;
      }

      const raw = (await response.text()).trim();
      const value = raw.split(/\r?\n/, 1)[0]?.trim() ?? "";
      return this.isPlausibleIp(value) ? value : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private isPlausibleIp(value: string): boolean {
    if (!value || value.length > 64) {
      return false;
    }
    // Accept IPv4/IPv6 text forms and reject obvious non-IP content.
    return /^[0-9a-f:.]+$/i.test(value);
  }
}
