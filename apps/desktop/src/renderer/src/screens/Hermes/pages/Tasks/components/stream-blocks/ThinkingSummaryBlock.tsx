import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WorkTaskEvent } from "../../../../../../../../shared/work/work-event-contract";

type Props = { event: WorkTaskEvent };

export function ThinkingSummaryBlock({ event }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (event.type !== "agent.thinking_summary") return null;

  return (
    <div className="hermes-stream-block hermes-stream-block--thinking">
      <button type="button" className="hermes-stream-block__toggle" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{event.title || t("workspaces.hermes.tasks.stream.thinking")}</span>
      </button>
      {open ? (
        <div className="hermes-stream-block__body">
          <p>{event.summary}</p>
          {event.steps?.length ? (
            <ol>
              {event.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
