import { describe, expect, it, vi } from "vitest";
import { ThreadService } from "../src/services/thread-service";

describe("ThreadService", () => {
  it("extracts image attachments from userMessage content", async () => {
    const rpc = {
      request: vi.fn().mockResolvedValue({
        thread: {
          turns: [
            {
              items: [
                {
                  id: "user-1",
                  type: "userMessage",
                  content: [
                    { type: "text", text: "Please review this UI" },
                    { type: "image", url: "data:image/png;base64,AAAA" },
                    { type: "localImage", path: "/tmp/screenshot.png" },
                  ],
                },
                {
                  id: "assistant-1",
                  type: "agentMessage",
                  text: "Looks good.",
                },
              ],
            },
          ],
        },
      }),
    };

    const service = new ThreadService(
      rpc as any,
      {
        threadMessagesPageSize: 10,
      } as any,
    );

    const result = await service.listThreadMessages("thr_1", {});

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      id: "user-1",
      role: "user",
      text: "Please review this UI",
      attachments: [
        { type: "image", url: "data:image/png;base64,AAAA" },
        { type: "localImage", path: "/tmp/screenshot.png" },
      ],
    });
    expect(result.data[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      text: "Looks good.",
    });
  });

  it("keeps image-only user messages in history", async () => {
    const rpc = {
      request: vi.fn().mockResolvedValue({
        thread: {
          turns: [
            {
              items: [
                {
                  id: "user-2",
                  type: "userMessage",
                  content: [{ type: "image", url: "https://example.com/ref.png" }],
                },
              ],
            },
          ],
        },
      }),
    };

    const service = new ThreadService(
      rpc as any,
      {
        threadMessagesPageSize: 10,
      } as any,
    );

    const result = await service.listThreadMessages("thr_2", {});

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "user-2",
      role: "user",
      text: "",
      attachments: [{ type: "image", url: "https://example.com/ref.png" }],
    });
  });
});
