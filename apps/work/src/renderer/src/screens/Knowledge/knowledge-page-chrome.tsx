import { type ReactElement, type ReactNode } from "react";
import { OrbLoader } from "../../components/OrbLoader";
import {
  AppModal,
  AppModalDescription,
  AppModalTitle,
} from "../../components/modal/AppModal";

export function KnowledgeLoading({ label }: { label: string }): ReactElement {
  return (
    <div className="knowledge-loading" data-testid="knowledge-loading">
      <OrbLoader state="searching" size={48} />
      <p>{label}</p>
    </div>
  );
}

export function KnowledgeEmptyState(props: {
  title: string;
  description?: string;
  testId?: string;
}): ReactElement {
  return (
    <section
      className="gateway-empty-state"
      aria-live="polite"
      data-testid={props.testId}
    >
      <strong>{props.title}</strong>
      {props.description ? <p>{props.description}</p> : null}
    </section>
  );
}

export function KnowledgeToolbar({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <div className="discover-toolbar knowledge-toolbar">{children}</div>;
}

export function KnowledgeSearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
}): ReactElement {
  return (
    <div className="discover-search">
      <input
        className="discover-search-input"
        data-testid={props.testId}
        placeholder={props.placeholder}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}

export function KnowledgeSectionTitle({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <h2 className="settings-section-title">{children}</h2>;
}

export type KnowledgeSectionTab<T extends string> = {
  id: T;
  label: string;
};

export function KnowledgeSectionTabs<T extends string>(props: {
  tabs: ReadonlyArray<KnowledgeSectionTab<T>>;
  active: T;
  onChange: (id: T) => void;
  labelledBy?: string;
}): ReactElement {
  return (
    <div className="memory-tabs knowledge-section-tabs" role="tablist">
      {props.tabs.map((tab) => {
        const active = tab.id === props.active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`memory-tab ${active ? "active" : ""}`}
            data-testid={`knowledge-section-tab-${tab.id}`}
            onClick={() => props.onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function KnowledgeEntityModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <AppModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      labelledBy="knowledge-entity-modal-title"
      describedBy={props.description ? "knowledge-entity-modal-desc" : undefined}
    >
      <AppModalTitle id="knowledge-entity-modal-title">
        {props.title}
      </AppModalTitle>
      {props.description ? (
        <AppModalDescription id="knowledge-entity-modal-desc">
          {props.description}
        </AppModalDescription>
      ) : null}
      {props.children}
    </AppModal>
  );
}
