import { useEffect, useRef } from "react";
import type { RemoteExpertSemanticEvent } from "../../../../shared/remote-expert";

export function useRemoteExpertTransport(options: {
  enabled: boolean;
  onEvent: (event: RemoteExpertSemanticEvent) => void;
}): void {
  const handler = useRef(options.onEvent);
  handler.current = options.onEvent;
  useEffect(() => {
    if (!options.enabled || !window.hermesAPI.remoteExpert) return;
    return window.hermesAPI.remoteExpert.onEvent((event) =>
      handler.current(event),
    );
  }, [options.enabled]);
}
