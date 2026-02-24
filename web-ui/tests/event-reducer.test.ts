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
});
