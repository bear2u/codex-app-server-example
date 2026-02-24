import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { TurnService } from "../services/turn-service";

const turnParamsSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1).optional(),
});

const inputItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1) }),
  z.object({ type: z.literal("image"), url: z.string().url() }),
  z.object({ type: z.literal("localImage"), path: z.string().min(1) }),
]);

const startTurnSchema = z.object({
  input: z.array(inputItemSchema).min(1),
  model: z.string().optional(),
  effort: z.string().optional(),
  summary: z.string().optional(),
  personality: z.string().optional(),
  cwd: z.string().optional(),
});

const steerTurnSchema = z.object({
  input: z.array(inputItemSchema).min(1),
});

export function registerTurnRoutes(app: FastifyInstance, turnService: TurnService): void {
  app.post("/v1/threads/:threadId/turns", async (request) => {
    const params = turnParamsSchema.parse(request.params);
    const body = startTurnSchema.parse(request.body ?? {});
    return turnService.startTurn(params.threadId, body);
  });

  app.post("/v1/threads/:threadId/turns/:turnId/steer", async (request) => {
    const params = turnParamsSchema.parse(request.params);
    const body = steerTurnSchema.parse(request.body ?? {});
    await turnService.steerTurn(params.threadId, params.turnId!, body);
    return {};
  });

  app.post("/v1/threads/:threadId/turns/:turnId/interrupt", async (request) => {
    const params = turnParamsSchema.parse(request.params);
    await turnService.interruptTurn(params.threadId, params.turnId!);
    return { ok: true };
  });
}
