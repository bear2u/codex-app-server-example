import type { UiEvent, UiEventEnvelope } from "@codex-app/shared-contracts";

function resolveApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}

export type UiEventHandler = (event: UiEvent, envelope: UiEventEnvelope) => void;

export function connectUiEventStream(
  onEvent: UiEventHandler,
  onError: (error: Event) => void,
  onOpen?: () => void,
): () => void {
  const stream = new EventSource(`${resolveApiBase()}/v1/events`);

  stream.addEventListener("ui", (rawEvent) => {
    if (!(rawEvent instanceof MessageEvent)) {
      return;
    }

    try {
      const envelope = JSON.parse(rawEvent.data) as UiEventEnvelope;
      onEvent(envelope.event, envelope);
    } catch {
      // Ignore malformed events; the stream keeps running.
    }
  });

  stream.onopen = () => {
    onOpen?.();
  };

  stream.onerror = onError;

  return () => {
    stream.close();
  };
}
