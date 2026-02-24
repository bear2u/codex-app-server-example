import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { Env } from "../config/env";
import type { AppLogger } from "../types/logger";

interface ProcessEvents {
  line: [line: string];
  stderr: [line: string];
  exit: [code: number | null, signal: NodeJS.Signals | null];
}

export class CodexProcessManager extends EventEmitter<ProcessEvents> {
  private child?: ChildProcessWithoutNullStreams;
  private starting?: Promise<void>;

  constructor(
    private readonly env: Env,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async ensureStarted(): Promise<void> {
    if (this.child && !this.child.killed) {
      return;
    }

    if (this.starting) {
      return this.starting;
    }

    this.starting = this.start();
    return this.starting;
  }

  async sendMessage(payload: Record<string, unknown>): Promise<void> {
    await this.ensureStarted();
    const line = `${JSON.stringify(payload)}\n`;
    this.child?.stdin.write(line);
  }

  async stop(): Promise<void> {
    this.starting = undefined;
    if (!this.child || this.child.killed) {
      return;
    }

    const child = this.child;
    this.child = undefined;

    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 2000);
    });
  }

  private async start(): Promise<void> {
    this.logger.info(
      { command: this.env.codexBin, cwd: this.env.codexCwd ?? process.cwd() },
      "Starting codex app-server process",
    );

    const child = spawn(this.env.codexBin, ["app-server", "--listen", "stdio://"], {
      cwd: this.env.codexCwd ?? process.cwd(),
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.child = child;

    const rl = createInterface({ input: child.stdout });
    rl.on("line", (line) => this.emit("line", line));

    child.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf-8");
      this.emit("stderr", line);
    });

    child.on("exit", (code, signal) => {
      this.emit("exit", code, signal);
      this.logger.warn({ code, signal }, "codex app-server process exited");
      this.child = undefined;
      this.starting = undefined;
      rl.close();
    });

    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
}
