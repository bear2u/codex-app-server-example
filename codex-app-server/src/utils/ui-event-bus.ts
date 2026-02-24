import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type { UiEvent, UiEventEnvelope } from "@codex-app/shared-contracts";
import type { AppLogger } from "../types/logger";

interface SseClient {
  id: string;
  response: ServerResponse;
  heartbeat: NodeJS.Timeout;
}

const MAX_BUFFER_SIZE = 500;

export class UiEventBus {
  private sequence = 0;
  private buffer: UiEventEnvelope[] = [];
  private clients = new Map<string, SseClient>();

  constructor(
    private readonly logger: AppLogger,
    private readonly heartbeatMs: number,
  ) {}

  publish(event: UiEvent): UiEventEnvelope {
    const envelope: UiEventEnvelope = {
      id: String(++this.sequence),
      ts: Date.now(),
      event,
    };

    this.buffer.push(envelope);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }

    const payload = `id: ${envelope.id}\nevent: ui\ndata: ${JSON.stringify(envelope)}\n\n`;

    for (const client of this.clients.values()) {
      client.response.write(payload);
    }

    return envelope;
  }

  attach(response: ServerResponse, lastEventId?: string, origin?: string): () => void {
    const clientId = randomUUID();
    const headers: Record<string, string> = {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    };

    if (origin) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Credentials"] = "true";
      headers.Vary = "Origin";
    }

    response.writeHead(200, headers);

    response.write(": connected\n\n");

    if (lastEventId) {
      const marker = Number(lastEventId);
      if (!Number.isNaN(marker)) {
        for (const event of this.buffer) {
          if (Number(event.id) > marker) {
            response.write(`id: ${event.id}\nevent: ui\ndata: ${JSON.stringify(event)}\n\n`);
          }
        }
      }
    }

    const heartbeat = setInterval(() => {
      response.write(`: heartbeat ${Date.now()}\n\n`);
    }, this.heartbeatMs);

    const client: SseClient = { id: clientId, response, heartbeat };
    this.clients.set(clientId, client);

    this.logger.info({ clientId, clientCount: this.clients.size }, "SSE client connected");

    return () => {
      clearInterval(heartbeat);
      this.clients.delete(clientId);
      this.logger.info({ clientId, clientCount: this.clients.size }, "SSE client disconnected");
    };
  }

  close(): void {
    for (const client of this.clients.values()) {
      clearInterval(client.heartbeat);
      client.response.end();
    }
    this.clients.clear();
  }
}
