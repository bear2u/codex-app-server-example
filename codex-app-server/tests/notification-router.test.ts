import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { NotificationRouter } from "../src/rpc/notification-router";

function createLoggerStub() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    level: "info",
  } as any;
}

describe("NotificationRouter", () => {
  it("maps agent delta notifications", () => {
    const rpc = new EventEmitter();
    const publish = vi.fn();

    const router = new NotificationRouter(
      rpc as any,
      { publish } as any,
      createLoggerStub(),
    );

    router.start();

    rpc.emit("notification", {
      method: "item/agentMessage/delta",
      params: { itemId: "item-1", delta: "hello" },
    });

    expect(publish).toHaveBeenCalledWith({
      type: "agent.delta",
      payload: { itemId: "item-1", text: "hello" },
    });
  });

  it("maps turn completed notification", () => {
    const rpc = new EventEmitter();
    const publish = vi.fn();

    const router = new NotificationRouter(
      rpc as any,
      { publish } as any,
      createLoggerStub(),
    );

    router.start();

    rpc.emit("notification", {
      method: "turn/completed",
      params: {
        turn: {
          id: "turn-1",
          threadId: "thread-1",
          status: "completed",
        },
      },
    });

    expect(publish).toHaveBeenCalledWith({
      type: "turn.completed",
      payload: { threadId: "thread-1", turnId: "turn-1", status: "completed", error: undefined },
    });
  });
});
