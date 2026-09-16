import { type ReactElement, type ReactNode } from "react";
import { OrbLoader } from "../../components/OrbLoader";
import { EmptyState } from "../../components/common/EmptyState";
import { PageToolbar } from "../../components/common/PageToolbar";
import { SearchInput } from "../../components/common/SearchInput";
import {
  AppModal,
  AppModalDescription,
  AppModalTitle,
} from "../../components/modal/AppModal";
import { Tabs } from "../../components/ui/Tabs";

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
    <EmptyState
      title={props.title}
      description={props.description}
      testId={props.testId}
    />
  );
}

export function KnowledgeToolbar({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <PageToolbar className="knowledge-toolbar">{children}</PageToolbar>;
}

export function KnowledgeSearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
}): ReactElement {
  return (
    <SearchInput
      value={props.value}
      onChange={props.onChange}
      placeholder={props.placeholder}
      testId={props.testId}
    />
  );
}

export function KnowledgeSectionTitle({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <h2 className="ui-page-header__title">{children}</h2>;
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
    <Tabs
      className="knowledge-section-tabs"
      tabs={props.tabs}
      active={props.active}
      onChange={props.onChange}
      labelledBy={props.labelledBy}
      tabTestId={(id) => `knowledge-section-tab-${id}`}
    />
  );
}

export function KnowledgeEntityModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitting?: boolean;
  children: ReactNode;
}): ReactElement {
  return (
    <AppModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      submitting={props.submitting}
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
