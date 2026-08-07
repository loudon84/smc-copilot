import { useCallback, useEffect, useState } from "react";
import type {
  HostBridgeOnEventPayload,
  HostBridgeStoredEvent,
  HostBridgeStoredReadyEvent,
  HostHandoffRecord,
} from "../../../../../shared/crm-bridge";

function isSubmitEvent(
  event: HostBridgeOnEventPayload["event"],
): event is HostBridgeStoredEvent {
  return event.type === "host.bridge.submit";
}

function isReadyEvent(
  event: HostBridgeOnEventPayload["event"],
): event is HostBridgeStoredReadyEvent {
  return event.type === "host.page.ready";
}

export function useHostBridgeEvents() {
  const [events, setEvents] = useState<HostBridgeStoredEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<HostBridgeStoredEvent | null>(null);
  const [lastReadyEvent, setLastReadyEvent] = useState<HostBridgeStoredReadyEvent | null>(null);
  const [lastHandoff, setLastHandoff] = useState<HostHandoffRecord | null>(null);
  const [configPath, setConfigPath] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const [list, last, lastReady, handoff, path] = await Promise.all([
        window.aiosBrowser.listHostBridgeEvents(20),
        window.aiosBrowser.getLastHostBridgeEvent(),
        window.aiosBrowser.getLastHostBridgeReadyEvent(),
        window.aiosBrowser.getLastHostHandoff(),
        window.aiosBrowser.getHostBridgeConfigPath(),
      ]);
      setEvents(list);
      setLastEvent(last);
      setLastReadyEvent(lastReady);
      setLastHandoff(handoff);
      setConfigPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return window.aiosBrowser.onHostBridgeEvent((payload: HostBridgeOnEventPayload) => {
      if (isSubmitEvent(payload.event)) {
        const submitEvent = payload.event;
        setLastEvent(submitEvent);
        setEvents((prev) => [submitEvent, ...prev].slice(0, 50));
      } else if (isReadyEvent(payload.event)) {
        setLastReadyEvent(payload.event);
      }
      void window.aiosBrowser.getLastHostHandoff().then(setLastHandoff);
    });
  }, [refresh]);

  return { events, lastEvent, lastReadyEvent, lastHandoff, configPath, error, refresh };
}
