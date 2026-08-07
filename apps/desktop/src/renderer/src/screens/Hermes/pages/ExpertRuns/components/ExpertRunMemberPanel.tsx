import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { WorkRunMemberSummary, WorkRunTimelineEvent } from "../../../model/run";

type Props = {
  memberRuns?: WorkRunMemberSummary[];
  teamEvents?: WorkRunTimelineEvent[];
};

function statusFromTeamEvent(eventType: string): string {
  if (eventType.includes("completed") || eventType.includes("succeeded")) return "succeeded";
  if (eventType.includes("failed") || eventType.includes("error")) return "failed";
  if (eventType.includes("timeout")) return "timeout";
  if (eventType.includes("waiting") || eventType.includes("approval")) return "pending";
  if (eventType.includes("started") || eventType.includes("running")) return "running";
  return "pending";
}

function deriveMemberRunsFromTimeline(events: WorkRunTimelineEvent[]): WorkRunMemberSummary[] {
  const map = new Map<string, WorkRunMemberSummary>();

  for (const event of events) {
    if (!event.eventType.startsWith("team.")) continue;
    const payload = event.payload ?? {};
    const roleName = String(payload.role_name ?? payload.roleName ?? payload.member ?? "Member");
    const memberProfileId = String(
      payload.member_profile_id ?? payload.profileId ?? payload.member_id ?? roleName,
    );
    const key = memberProfileId;

    const existing: WorkRunMemberSummary = map.get(key) ?? {
      memberProfileId,
      roleName,
      status: "pending",
    };

    if (event.eventType.startsWith("team.member.")) {
      existing.status = statusFromTeamEvent(event.eventType);
      if (payload.summary) existing.summary = String(payload.summary);
      if (payload.result_summary) existing.summary = String(payload.result_summary);
    }

    map.set(key, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.roleName.localeCompare(b.roleName));
}

export function ExpertRunMemberPanel({ memberRuns = [], teamEvents = [] }: Props) {
  const { t } = useTranslation();

  const derived = useMemo(() => {
    if (teamEvents.length > 0) return deriveMemberRunsFromTimeline(teamEvents);
    return memberRuns;
  }, [memberRuns, teamEvents]);

  if (derived.length === 0) {
    return (
      <section>
        <h4>{t("workspaces.hermes.expertTeams.members")}</h4>
        <p className="hermes-muted">{t("workspaces.hermes.expertRuns.noMembers")}</p>
      </section>
    );
  }

  return (
    <section>
      <h4>{t("workspaces.hermes.expertTeams.members")}</h4>
      <ul className="hermes-team-member-list">
        {derived.map((m) => (
          <li key={`${m.memberProfileId}-${m.roleName}`}>
            <strong>{m.roleName}</strong>
            <span className={`hermes-badge hermes-badge--${m.status}`}>{m.status}</span>
            {m.summary ? <p>{m.summary}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
