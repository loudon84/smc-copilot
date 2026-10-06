import { useEffect, useRef } from "react";
import { useI18n } from "../../components/useI18n";
import type { RemoteExpertPermissionOption } from "../../../../shared/remote-expert";

export function RemoteExpertPermissionCard(props: {
  sessionId: string;
  requestId: string;
  title?: string;
  authGeneration: string;
  onResolved?: () => void;
}) {
  const { t } = useI18n();
  const decidedRef = useRef(false);

  const decide = (optionId: RemoteExpertPermissionOption) => {
    if (decidedRef.current) return;
    decidedRef.current = true;
    void window.hermesAPI.remoteExpert.decidePermission({
      sessionId: props.sessionId,
      requestId: props.requestId,
      optionId,
      authGeneration: props.authGeneration,
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
  }, [props.requestId, props.sessionId, props.authGeneration]);

  return (
    <div
      className="remote-expert-permission"
      role="dialog"
      aria-label={t("remoteExpert.label")}
    >
      <div>{props.title || t("remoteExpert.label")}</div>
      <button type="button" onClick={() => decide("allow_once")}>
        {t("remoteExpert.allowOnce")}
      </button>
      <button type="button" onClick={() => decide("reject_once")}>
        {t("remoteExpert.rejectOnce")}
      </button>
    </div>
  );
}
