import { KanbanPage } from "../../../../modules/kanban";
import { useHermesDefault } from "../../context/HermesDefaultContext";

/** Hermes 左侧导航入口：嵌入 modules/kanban，随 panel 可见性暂停轮询。 */
export default function HermesKanbanPage() {
  const { activeNavItem } = useHermesDefault();
  return (
    <div className="hermes-page hermes-kanban-page">
      <KanbanPage active={activeNavItem === "kanban"} />
    </div>
  );
}
