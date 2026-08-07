import { useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useI18n } from "../../components/useI18n";
import type { ShellViewSnapshot } from "../../../../shared/shell/shell-view-contract";
import type { View } from "../../types/desktop-shell";
import { buildWorkspaceTabs } from "../../workspace/workspace-tabs";
import { resolveWorkspaceModule } from "../../workspace/workspace-registry";
import type { ExternalBrowserTab, MainWorkspaceTab } from "./main-page-types";
import { isDraggableTabId, sortTabsByOrder } from "./tab-order";

interface MainViewTabsProps {
  activeView: View;
  externalTabs: ExternalBrowserTab[];
  tabOrder: string[];
  metadataById: Record<string, ShellViewSnapshot>;
  onTabOrderChange: (order: string[]) => void;
  onNavigate: (view: View) => void;
  onCloseTab: (id: View) => void;
  onRecoverTab: (id: View) => void;
}

interface TabItem extends MainWorkspaceTab {
  draggable: boolean;
}

function tabItemClass(
  isActive: boolean,
  metadata: ShellViewSnapshot | undefined,
): string {
  const parts = ["MainViewTabs__item"];
  if (isActive) parts.push("active");
  if (metadata?.loading) parts.push("is-loading");
  if (metadata?.errorCode || metadata?.crashed) parts.push("has-error");
  return parts.join(" ");
}

function SortableTabButton({
  tab,
  label,
  isActive,
  metadata,
  showRecover,
  onNavigate,
  onCloseTab,
  onRecoverTab,
  recoverLabel,
}: {
  tab: TabItem;
  label: string;
  isActive: boolean;
  metadata: ShellViewSnapshot | undefined;
  showRecover: boolean;
  onNavigate: (view: View) => void;
  onCloseTab: (id: View) => void;
  onRecoverTab: (id: View) => void;
  recoverLabel: string;
}): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tab.id, disabled: !tab.draggable });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`MainViewTabs__sortable ${isDragging ? "MainViewTabs__sortable--dragging" : ""}`}
    >
      {tab.draggable ? (
        <button
          type="button"
          className="MainViewTabs__drag-handle no-drag"
          aria-label="Drag tab"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} />
        </button>
      ) : null}
      {metadata?.favicon ? (
        <img
          src={metadata.favicon}
          alt=""
          className="MainViewTabs__favicon"
        />
      ) : null}
      <button
        type="button"
        className={tabItemClass(isActive, metadata)}
        title={label}
        onClick={() => onNavigate(tab.id)}
      >
        <span>{label}</span>
      </button>
      {showRecover ? (
        <button
          type="button"
          className="MainViewTabs__recover no-drag"
          onClick={(event) => {
            event.stopPropagation();
            onRecoverTab(tab.id);
          }}
        >
          {recoverLabel}
        </button>
      ) : null}
      {tab.closeable ? (
        <button
          type="button"
          className="MainViewTabs__close no-drag"
          aria-label="Close tab"
          onClick={(event) => {
            event.stopPropagation();
            onCloseTab(tab.id);
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

export function MainViewTabs({
  activeView,
  externalTabs,
  tabOrder,
  metadataById,
  onTabOrderChange,
  onNavigate,
  onCloseTab,
  onRecoverTab,
}: MainViewTabsProps): React.JSX.Element {
  const { t } = useI18n();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { fixedTabs, draggableTabs } = useMemo(() => {
    const workspaceTabs = buildWorkspaceTabs();
    const fixed: TabItem[] = workspaceTabs
      .filter((tab) => {
        const mod = resolveWorkspaceModule(tab.id);
        return mod !== null && !mod.draggable;
      })
      .map((tab) => ({
        ...tab,
        draggable: resolveWorkspaceModule(tab.id)?.draggable ?? false,
      }));

    const draggable: TabItem[] = workspaceTabs
      .filter((tab) => {
        const mod = resolveWorkspaceModule(tab.id);
        return mod === null || mod.draggable;
      })
      .map((tab) => ({
        ...tab,
        draggable: resolveWorkspaceModule(tab.id)?.draggable ?? false,
      }));

    const externalItems: TabItem[] = externalTabs.map((tab) => ({
      id: tab.id as View,
      title: tab.title,
      closeable: true,
      source: "external" as const,
      draggable: true,
    }));

    const merged = [...draggable, ...externalItems];
    const sorted = sortTabsByOrder(merged, tabOrder);

    return { fixedTabs: fixed, draggableTabs: sorted };
  }, [externalTabs, tabOrder]);

  const draggableIds = draggableTabs.map((tab) => String(tab.id));

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = draggableIds.indexOf(String(active.id));
    const newIndex = draggableIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    onTabOrderChange(arrayMove(draggableIds, oldIndex, newIndex));
  };

  const renderLabel = (tab: TabItem): string => {
    const metadata = metadataById[String(tab.id)];
    // Portal tab: keep registry/i18n label; do not mirror embedded page document.title
    if (tab.id === "portal" && tab.titleKey) {
      return t(tab.titleKey);
    }
    if (metadata?.title) return metadata.title;
    if (tab.titleKey) return t(tab.titleKey);
    return tab.title ?? String(tab.id);
  };

  const needsRecover = (tabId: string): boolean => {
    const metadata = metadataById[tabId];
    return Boolean(metadata?.crashed || metadata?.errorCode);
  };

  const recoverLabel = t("shellView.recover", { defaultValue: "Recover" });

  return (
    <nav className="MainViewTabs no-drag" aria-label="Workspace tabs">
      {fixedTabs.map((tab) => {
        const item: TabItem = { ...tab, draggable: false };
        const metadata = metadataById[String(tab.id)];
        const label = renderLabel(item);
        const isActive = activeView === tab.id;
        return (
          <div key={tab.id} className="MainViewTabs__sortable">
            {metadata?.favicon ? (
              <img
                src={metadata.favicon}
                alt=""
                className="MainViewTabs__favicon"
              />
            ) : null}
            <button
              type="button"
              className={tabItemClass(isActive, metadata)}
              title={label}
              onClick={() => onNavigate(tab.id)}
            >
              <span>{label}</span>
            </button>
            {needsRecover(String(tab.id)) ? (
              <button
                type="button"
                className="MainViewTabs__recover no-drag"
                onClick={(event) => {
                  event.stopPropagation();
                  onRecoverTab(tab.id);
                }}
              >
                {recoverLabel}
              </button>
            ) : null}
          </div>
        );
      })}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draggableIds} strategy={horizontalListSortingStrategy}>
          {draggableTabs.map((tab) => (
            <SortableTabButton
              key={tab.id}
              tab={tab}
              label={renderLabel(tab)}
              isActive={activeView === tab.id}
              metadata={metadataById[String(tab.id)]}
              showRecover={needsRecover(String(tab.id))}
              onNavigate={onNavigate}
              onCloseTab={onCloseTab}
              onRecoverTab={onRecoverTab}
              recoverLabel={recoverLabel}
            />
          ))}
        </SortableContext>
      </DndContext>
    </nav>
  );
}
