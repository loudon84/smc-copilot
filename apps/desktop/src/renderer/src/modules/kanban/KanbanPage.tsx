import { useEffect, useState } from "react";
import { useKanbanController } from "./controller/useKanbanController";
import { KanbanModule } from "./KanbanModule";

async function resolveDefaultInstanceId(): Promise<string | null> {
  try {
    const runtime = window.copilotRuntime;
    if (!runtime?.listInstances) return null;
    const instances = await runtime.listInstances();
    if (!Array.isArray(instances) || instances.length === 0) return null;
    const list = instances as Array<{ id?: string; name?: string; profileName?: string }>;
    const def =
      list.find((i) => (i.name || i.profileName || "").toLowerCase() === "default") ??
      list[0];
    return def?.id ?? null;
  } catch {
    return null;
  }
}

export function KanbanPage({ active = true }: { active?: boolean }) {
  const [instanceId, setInstanceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveDefaultInstanceId().then((id) => {
      if (!cancelled) setInstanceId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const controller = useKanbanController({ instanceId, visible: active });

  return <KanbanModule controller={controller} />;
}
