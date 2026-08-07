import { STATIC_WORKSPACE_MODULES } from "../../workspace/workspace-registry";

export function sortTabsByOrder<T extends { id: string }>(
  tabs: T[],
  order: string[],
): T[] {
  const index = new Map(order.map((id, i) => [id, i]));
  return [...tabs].sort((a, b) => {
    const ai = index.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = index.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

export function isDraggableTabId(id: string): boolean {
  return id.startsWith("external-browser:");
}

/** Static workspace tabs that are not reorderable in the tab bar. */
export const FIXED_TAB_IDS = STATIC_WORKSPACE_MODULES.filter((m) => !m.draggable).map(
  (m) => m.id,
) as readonly string[];
