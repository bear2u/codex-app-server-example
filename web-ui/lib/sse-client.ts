import type { UiEvent, UiEventEnvelope } from "@codex-app/shared-contracts";

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:4000";
}

export type UiEventHandler = (event: UiEvent, envelope: UiEventEnvelope) => void;

export function connectUiEventStream(
  onEvent: UiEventHandler,
  onError: (error: Event) => void,
  onOpen?: () => void,
): () => void {
  const heartbeatTimeoutMs = 25_000;
  const maxBackoffMs = 10_000;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  let stream: EventSource | null = null;
  let retryAttempt = 0;
  let lastEventId: string | null = null;

  const clearTimers = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const armHeartbeatTimeout = () => {
    if (heartbeatTimer) {
      clearTimeout(heartbeatTimer);
    }

    heartbeatTimer = setTimeout(() => {
      // If the SSE stream goes idle beyond heartbeat expectation, recycle the connection.
      stream?.close();
      scheduleReconnect();
    }, heartbeatTimeoutMs);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) {
      return;
    }

    const baseDelay = Math.min(1_000 * 2 ** retryAttempt, maxBackoffMs);
    const jitter = Math.floor(Math.random() * 250);
    const delay = baseDelay + jitter;
    retryAttempt += 1;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      openStream();
    }, delay);
  };

  const openStream = () => {
    if (closed) {
      return;
    }

    const baseUrl = new URL(`${resolveApiBase()}/v1/events`);
    if (lastEventId) {
      baseUrl.searchParams.set("lastEventId", lastEventId);
    }
    stream = new EventSource(baseUrl.toString());

    stream.addEventListener("ui", (rawEvent) => {
      if (!(rawEvent instanceof MessageEvent)) {
        return;
      }

      try {
        const envelope = JSON.parse(rawEvent.data) as UiEventEnvelope;
        lastEventId = envelope.id;
        armHeartbeatTimeout();
        onEvent(envelope.event, envelope);
      } catch {
        // Ignore malformed events; the stream keeps running.
      }
    });

    stream.addEventListener("heartbeat", () => {
      armHeartbeatTimeout();
    });

    stream.onopen = () => {
      retryAttempt = 0;
      armHeartbeatTimeout();
      onOpen?.();
    };

    stream.onerror = (error) => {
      onError(error);
      // CLOSED means the connection is down and browser will not keep this instance alive.
      if (stream?.readyState === EventSource.CLOSED) {
        stream?.close();
        scheduleReconnect();
      }
    };
  };

  openStream();

  return () => {
    closed = true;
    clearTimers();
    stream?.close();
    stream = null;
  };
}
