import { useTranslation } from "react-i18next";
import type { WorkRunTimelineEvent } from "../../../model/run";

type Props = {
  events: WorkRunTimelineEvent[];
};

export function RunTimeline({ events }: Props) {
  const { t } = useTranslation();
  if (events.length === 0) {
    return <p className="hermes-muted">{t("workspaces.hermes.expertRuns.noEvents")}</p>;
  }
  return (
    <ol className="hermes-run-timeline">
      {events.map((event) => (
        <li key={event.id}>
          <time>{new Date(event.createdAt).toLocaleString()}</time>
          <strong>{event.eventType}</strong>
          {event.sourceProfileId ? <span>{event.sourceProfileId}</span> : null}
          {event.targetProfileId ? <span>→ {event.targetProfileId}</span> : null}
        </li>
      ))}
    </ol>
  );
}
