import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { AuthService } from "../services/auth-service";

const cancelLoginSchema = z.object({
  loginId: z.string().min(1),
});

const modelQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  includeHidden: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  app.post("/v1/auth/chatgpt/start", async () => authService.startChatgptLogin());

  app.post("/v1/auth/chatgpt/cancel", async (request) => {
    const body = cancelLoginSchema.parse(request.body);
    await authService.cancelChatgptLogin(body.loginId);
    return {};
  });

  app.get("/v1/auth/state", async () => authService.readAuthState());

  app.get("/v1/models", async (request) => {
    const query = modelQuerySchema.parse(request.query);
    return authService.listModels({
      limit: query.limit,
      includeHidden: query.includeHidden,
    });
  });
}
