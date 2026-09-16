import { type ReactElement } from "react";
import type { KnowledgeBaseVisibility } from "../../../../../../../shared/knowledge/knowledge-base-ipc";

export function KnowledgeBaseSettingsForm(props: {
  name: string;
  description: string;
  visibility: KnowledgeBaseVisibility;
  saveEnabled: boolean;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onVisibilityChange: (value: KnowledgeBaseVisibility) => void;
  onSave: () => void;
  editLabel: string;
  descriptionLabel: string;
  visibilityLabel: string;
  saveLabel: string;
  privateLabel: string;
  departmentLabel: string;
  organizationLabel: string;
}): ReactElement {
  return (
    <div data-testid="knowledge-base-settings">
      <label className="settings-field">
        {props.editLabel}
        <input
          data-testid="knowledge-base-title-input"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          disabled={!props.saveEnabled || props.submitting}
        />
      </label>
      <label className="settings-field">
        {props.descriptionLabel}
        <textarea
          data-testid="knowledge-base-description-input"
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
          disabled={!props.saveEnabled || props.submitting}
        />
      </label>
      <label className="settings-field">
        {props.visibilityLabel}
        <select
          data-testid="knowledge-base-visibility-input"
          value={props.visibility}
          disabled={!props.saveEnabled || props.submitting}
          onChange={(event) =>
            props.onVisibilityChange(event.target.value as KnowledgeBaseVisibility)
          }
        >
          <option value="private">{props.privateLabel}</option>
          <option value="department">{props.departmentLabel}</option>
          <option value="organization">{props.organizationLabel}</option>
        </select>
      </label>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        data-testid="knowledge-base-save"
        disabled={!props.saveEnabled || props.submitting}
        onClick={props.onSave}
      >
        {props.saveLabel}
      </button>
    </div>
  );
}
