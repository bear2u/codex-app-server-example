import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { ThreadService } from "../services/thread-service";

const createThreadSchema = z.object({
  model: z.string().optional(),
  cwd: z.string().optional(),
  personality: z.string().optional(),
});

const resumeThreadSchema = z.object({
  personality: z.string().optional(),
});

const listThreadsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const listThreadMessagesSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

const threadParamsSchema = z.object({
  threadId: z.string().min(1),
});

export function registerThreadRoutes(app: FastifyInstance, threadService: ThreadService): void {
  app.post("/v1/threads", async (request) => {
    const body = createThreadSchema.parse(request.body ?? {});
    return threadService.createThread(body);
  });

  app.post("/v1/threads/:threadId/resume", async (request) => {
    const params = threadParamsSchema.parse(request.params);
    const body = resumeThreadSchema.parse(request.body ?? {});
    return threadService.resumeThread(params.threadId, body.personality);
  });

  app.get("/v1/threads", async (request) => {
    const query = listThreadsSchema.parse(request.query);
    return threadService.listThreads({
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
  });

  app.get("/v1/threads/:threadId/messages", async (request) => {
    const params = threadParamsSchema.parse(request.params);
    const query = listThreadMessagesSchema.parse(request.query);
    return threadService.listThreadMessages(params.threadId, {
      cursor: query.cursor ?? null,
      limit: query.limit,
    });
  });

  app.get("/v1/threads/:threadId", async (request) => {
    const params = threadParamsSchema.parse(request.params);
    return threadService.readThread(params.threadId);
  });
}
