import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState } from "../lib/event-reducer";

describe("chatReducer", () => {
  it("appends assistant delta into a single message", () => {
    const withThread = chatReducer(initialChatState, {
      type: "select-thread",
      threadId: "thread-1",
    });

    const withFirstDelta = chatReducer(withThread, {
      type: "apply-ui-event",
      event: {
        type: "agent.delta",
        payload: { itemId: "item-1", text: "Hello" },
      },
    });

    const withSecondDelta = chatReducer(withFirstDelta, {
      type: "apply-ui-event",
      event: {
        type: "agent.delta",
        payload: { itemId: "item-1", text: " world" },
      },
    });

    const messages = withSecondDelta.messagesByThreadId["thread-1"] ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toBe("Hello world");
  });

  it("queues command approval events", () => {
    const state = chatReducer(initialChatState, {
      type: "apply-ui-event",
      event: {
        type: "approval.command.requested",
        payload: {
          requestId: "req-1",
          itemId: "item-1",
          threadId: "thread-1",
          turnId: "turn-1",
        },
      },
    });

    expect(state.commandApprovals).toHaveLength(1);
    expect(state.commandApprovals[0]?.requestId).toBe("req-1");
  });

  it("sets and clears active turn state", () => {
    const withActiveTurn = chatReducer(initialChatState, {
      type: "set-active-turn",
      threadId: "thread-1",
      turnId: "turn-1",
    });

    expect(withActiveTurn.currentThreadId).toBe("thread-1");
    expect(withActiveTurn.activeTurnId).toBe("turn-1");

    const cleared = chatReducer(withActiveTurn, { type: "clear-active-turn" });
    expect(cleared.activeTurnId).toBeNull();
  });

  it("keeps only the latest 10 threads in state", () => {
    const threads = Array.from({ length: 12 }, (_, index) => ({
      id: `thread-${index + 1}`,
    }));

    const hydrated = chatReducer(initialChatState, {
      type: "hydrate-threads",
      threads,
    });

    expect(hydrated.threads).toHaveLength(10);
    expect(hydrated.threads[0]?.id).toBe("thread-1");
    expect(hydrated.threads[9]?.id).toBe("thread-10");
  });
});
