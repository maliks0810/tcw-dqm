const DATA_QUALITY_SERVICE_URL =
  process.env.REACT_APP_DATA_QUALITY_SERVICE_URL ?? "http://127.0.0.1:8100";
const EVENTS_ENDPOINT = `${DATA_QUALITY_SERVICE_URL}/de/securities/rules/v1/api/events`;

export type DomainEventType = "security_exception.inserted";

export type DomainEvent = {
  type: DomainEventType;
  payload: unknown;
};

export type EventHandler = (event: DomainEvent) => void;

export function subscribeToEvents(handler: EventHandler): () => void {
  const source = new EventSource(EVENTS_ENDPOINT);

  const onSecurityExceptionInserted = (e: MessageEvent) => {
    try {
      const parsed = JSON.parse(e.data) as {
        type?: DomainEventType;
        payload?: unknown;
      };
      handler({
        type: "security_exception.inserted",
        payload: parsed.payload ?? parsed,
      });
    } catch {
      // ignore malformed event payloads
    }
  };

  source.addEventListener(
    "security_exception.inserted",
    onSecurityExceptionInserted as EventListener
  );

  return () => {
    source.removeEventListener(
      "security_exception.inserted",
      onSecurityExceptionInserted as EventListener
    );
    source.close();
  };
}
