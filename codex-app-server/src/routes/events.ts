import type { FastifyInstance } from "fastify";
import { UiEventBus } from "../utils/ui-event-bus";

export function registerEventRoutes(app: FastifyInstance, eventBus: UiEventBus): void {
  app.get("/v1/events", async (request, reply) => {
    const lastEventId = request.headers["last-event-id"];
    const normalizedLastEventId = Array.isArray(lastEventId) ? lastEventId[0] : lastEventId;
    const originHeader = request.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;

    reply.hijack();
    const detach = eventBus.attach(reply.raw, normalizedLastEventId, origin);

    request.raw.on("close", () => {
      detach();
    });
  });
}
