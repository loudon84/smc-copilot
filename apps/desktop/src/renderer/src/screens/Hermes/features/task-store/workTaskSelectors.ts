import type { WorkParticipant } from "../../../../../../shared/work/work-participant-contract";
import type { WorkTaskEvent } from "../../../../../../shared/work/work-event-contract";

export function participantsFromEvents(
  taskId: string,
  events: WorkTaskEvent[],
): WorkParticipant[] {
  const map = new Map<string, WorkParticipant>();

  const upsert = (p: Omit<WorkParticipant, "taskId" | "outputRefIds"> & { outputRefIds?: string[] }) => {
    const existing = map.get(p.id);
    map.set(p.id, {
      taskId,
      outputRefIds: p.outputRefIds ?? existing?.outputRefIds ?? [],
      ...existing,
      ...p,
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
    });
  };

  upsert({
    id: "lead",
    type: "lead",
    name: "嘉单顾问",
    role: "总控",
    status: "idle",
  });

  for (const ev of events) {
    if (ev.type === "team.created" && "members" in ev && ev.members) {
      for (const m of ev.members) {
        if (m.id === "lead") continue;
        upsert({
          id: m.id,
          type: "team_member",
          name: m.name,
          role: m.role,
          status: "idle",
        });
      }
    }
    if (
      ev.type === "team.member.started" ||
      ev.type === "team.member.delta" ||
      ev.type === "team.member.assigned"
    ) {
      upsert({
        id: ev.memberId,
        type: "team_member",
        name: ev.memberName,
        role: ev.role,
        status: ev.status ?? "running",
        currentAction: ev.subTaskTitle,
      });
    }
    if (ev.type === "team.member.completed") {
      upsert({
        id: ev.memberId,
        type: "team_member",
        name: ev.memberName,
        status: "completed",
        currentAction: ev.summary,
        outputRefIds: ev.outputRefIds,
      });
    }
    if (ev.type === "team.member.failed") {
      upsert({
        id: ev.memberId,
        type: "team_member",
        name: ev.memberName,
        status: "failed",
      });
    }
    if (ev.type === "agent.message.delta" || ev.type === "agent.message.completed") {
      if (ev.participantId && ev.participantId !== "user") {
        upsert({
          id: ev.participantId,
          type: ev.participantId === "lead" ? "lead" : "team_member",
          name: ev.participantName ?? ev.participantId,
          status: "running",
        });
      }
    }
    if (ev.type === "task.completed") {
      for (const p of map.values()) {
        if (p.status === "running" || p.status === "thinking") {
          map.set(p.id, { ...p, status: "completed" });
        }
      }
    }
  }

  return Array.from(map.values());
}
