import { useEffect, useRef } from "react";
import type { RemoteExpertPermissionOption } from "../../../../../shared/remote-expert-acp/events";

export function RemoteExpertPermissionView(props: {
  sessionId: string;
  requestId: string;
  title?: string;
  summary?: string;
  onResolved?: () => void;
}) {
  const decidedRef = useRef(false);

  const decide = (optionId: RemoteExpertPermissionOption) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    void window.hermesAPI.remoteExpert.decidePermission({
      sessionId: props.sessionId,
      requestId: props.requestId,
      optionId,
    });
    props.onResolved?.();
  };

  useEffect(() => {
    decidedRef.current = false;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") decide("reject_once");
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (!decidedRef.current) decide("reject_once");
    };
  }, [props.requestId, props.sessionId]);

  return (
    <div
      className="remote-expert-permission"
      role="dialog"
      aria-label="Remote expert permission"
    >
      <div>{props.title || "Permission required"}</div>
      {props.summary ? <p>{props.summary}</p> : null}
      <button type="button" onClick={() => decide("allow_once")}>
        Allow once
      </button>
      <button type="button" onClick={() => decide("reject_once")}>
        Reject once
      </button>
    </div>
  );
}
