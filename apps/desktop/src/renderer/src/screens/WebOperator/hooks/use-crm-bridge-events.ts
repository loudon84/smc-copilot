import { useCallback, useEffect, useState } from "react";
import type {
  CrmBridgeOnEventPayload,
  CrmBridgeStoredEvent,
} from "../../../../../shared/crm-bridge";

export function useCrmBridgeEvents() {
  const [events, setEvents] = useState<CrmBridgeStoredEvent[]>([]);
  const [lastEvent, setLastEvent] = useState<CrmBridgeStoredEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    const api = window.aiosBrowser as unknown as {
      listCrmEvents?: (limit?: number) => Promise<CrmBridgeStoredEvent[]>;
      getLastCrmEvent?: () => Promise<CrmBridgeStoredEvent | null>;
    };
    if (!api.listCrmEvents || !api.getLastCrmEvent) {
      setError("CRM bridge API is not available (preload not updated). Please restart the app.");
      return;
    }
    try {
      setError(null);
      const [list, last] = await Promise.all([
        api.listCrmEvents(20),
        api.getLastCrmEvent(),
      ]);
      setEvents(list);
      setLastEvent(last);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const api = window.aiosBrowser as unknown as {
      onCrmEvent?: (cb: (payload: CrmBridgeOnEventPayload) => void) => () => void;
    };
    if (!api.onCrmEvent) return undefined;
    return api.onCrmEvent((payload: CrmBridgeOnEventPayload) => {
      setLastEvent(payload.event);
      setEvents((prev) => [payload.event, ...prev].slice(0, 50));
    });
  }, [refresh]);

  return { events, lastEvent, error, refresh };
}

