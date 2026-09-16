import { type ReactElement } from "react";
import type { KnowledgeBaseVisibility } from "../../../../../../../shared/knowledge/knowledge-base-ipc";

export function KnowledgeBaseCreateForm(props: {
  name: string;
  description: string;
  visibility: KnowledgeBaseVisibility;
  disabled: boolean;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: KnowledgeBaseVisibility) => void;
  onCancel: () => void;
  onSubmit: () => void;
  nameLabel: string;
  descriptionLabel: string;
  visibilityLabel: string;
  cancelLabel: string;
  createLabel: string;
  privateLabel: string;
  departmentLabel: string;
  organizationLabel: string;
}): ReactElement {
  return (
    <>
      <label className="settings-field">
        {props.nameLabel}
        <input
          data-testid="knowledge-base-create-title"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          disabled={props.disabled || props.submitting}
          placeholder={props.createLabel}
        />
      </label>
      <label className="settings-field">
        {props.descriptionLabel}
        <textarea
          data-testid="knowledge-base-create-description"
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
          disabled={props.disabled || props.submitting}
        />
      </label>
      <label className="settings-field">
        {props.visibilityLabel}
        <select
          data-testid="knowledge-base-create-visibility"
          value={props.visibility}
          disabled={props.disabled || props.submitting}
          onChange={(event) =>
            props.onVisibilityChange(event.target.value as KnowledgeBaseVisibility)
          }
        >
          <option value="private">{props.privateLabel}</option>
          <option value="department">{props.departmentLabel}</option>
          <option value="organization">{props.organizationLabel}</option>
        </select>
      </label>
      <div className="knowledge-toolbar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={props.submitting}
          onClick={props.onCancel}
        >
          {props.cancelLabel}
        </button>
        <button
          type="button"
          className="btn btn-sm"
          data-testid="knowledge-base-create-submit"
          disabled={props.disabled || props.submitting || !props.name.trim()}
          onClick={props.onSubmit}
        >
          {props.createLabel}
        </button>
      </div>
    </>
  );
}
