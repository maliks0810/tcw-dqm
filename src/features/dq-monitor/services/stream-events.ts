const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EVENTS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/events`;

export type DomainEventType =
  | "security_exception.inserted"
  | "security_exception.updated"
  | "rules.executed";

export type DomainEvent = {
  type: DomainEventType;
  payload: unknown;
};

export type EventHandler = (event: DomainEvent) => void;

// EventSource dispatches by `event:` name, so every type the app cares
// about has to be listed here — adding a case in the page's handler is
// not enough on its own.
const HANDLED_EVENT_TYPES: DomainEventType[] = [
  "security_exception.inserted",
  "security_exception.updated",
  "rules.executed",
];

export function subscribeToEvents(handler: EventHandler): () => void {
  const source = new EventSource(EVENTS_ENDPOINT);

  const makeListener =
    (type: DomainEventType) =>
    (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as { payload?: unknown };
        handler({ type, payload: parsed.payload ?? parsed });
      } catch {
        // ignore malformed event payloads
      }
    };

  const listeners = HANDLED_EVENT_TYPES.map((type) => {
    const listener = makeListener(type);
    source.addEventListener(type, listener as EventListener);
    return { type, listener };
  });

  return () => {
    for (const { type, listener } of listeners) {
      source.removeEventListener(type, listener as EventListener);
    }
    source.close();
  };
}
