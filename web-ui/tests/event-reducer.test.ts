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
        payload: { threadId: "thread-1", itemId: "item-1", text: "Hello" },
      },
    });

    const withSecondDelta = chatReducer(withFirstDelta, {
      type: "apply-ui-event",
      event: {
        type: "agent.delta",
        payload: { threadId: "thread-1", itemId: "item-1", text: " world" },
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

  it("tracks active turns by thread and clears completed thread turn only", () => {
    const withSelectedThread = chatReducer(initialChatState, {
      type: "select-thread",
      threadId: "thread-a",
    });

    const withThreadATurn = chatReducer(withSelectedThread, {
      type: "set-active-turn",
      threadId: "thread-a",
      turnId: "turn-a",
    });
    const withThreadBTurn = chatReducer(withThreadATurn, {
      type: "set-active-turn",
      threadId: "thread-b",
      turnId: "turn-b",
    });

    expect(withThreadBTurn.activeTurnIdByThreadId["thread-a"]).toBe("turn-a");
    expect(withThreadBTurn.activeTurnIdByThreadId["thread-b"]).toBe("turn-b");
    expect(withThreadBTurn.activeTurnId).toBe("turn-a");

    const withThreadACompleted = chatReducer(withThreadBTurn, {
      type: "apply-ui-event",
      event: {
        type: "turn.completed",
        payload: { threadId: "thread-a", turnId: "turn-a", status: "completed" },
      },
    });

    expect(withThreadACompleted.activeTurnIdByThreadId["thread-a"]).toBeUndefined();
    expect(withThreadACompleted.activeTurnIdByThreadId["thread-b"]).toBe("turn-b");
    expect(withThreadACompleted.activeTurnId).toBeNull();
  });

  it("routes assistant delta to its payload threadId even when another thread is selected", () => {
    const withSelectedThread = chatReducer(initialChatState, {
      type: "select-thread",
      threadId: "thread-b",
    });

    const updated = chatReducer(withSelectedThread, {
      type: "apply-ui-event",
      event: {
        type: "agent.delta",
        payload: { threadId: "thread-a", itemId: "item-a", text: "from-thread-a" },
      },
    });

    expect(updated.messagesByThreadId["thread-a"]?.[0]?.text).toBe("from-thread-a");
    expect(updated.messagesByThreadId["thread-b"]).toBeUndefined();
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
