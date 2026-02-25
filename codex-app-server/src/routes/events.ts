import type { FastifyInstance } from "fastify";
import { UiEventBus } from "../utils/ui-event-bus";

export function registerEventRoutes(app: FastifyInstance, eventBus: UiEventBus): void {
  app.get("/v1/events", async (request, reply) => {
    const lastEventId = request.headers["last-event-id"];
    const headerLastEventId = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
    const query = (request.query as Record<string, unknown>) ?? {};
    const queryLastEventId = typeof query.lastEventId === "string" ? query.lastEventId : undefined;
    const normalizedLastEventId = headerLastEventId ?? queryLastEventId;
    const originHeader = request.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    reply.hijack();
    const detach = eventBus.attach(reply.raw, normalizedLastEventId, origin);

    request.raw.on("close", () => {
      detach();
    });
  });
}
