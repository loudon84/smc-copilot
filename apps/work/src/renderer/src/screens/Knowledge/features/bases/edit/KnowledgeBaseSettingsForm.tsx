import { type ReactElement } from "react";
import type { KnowledgeBaseVisibility } from "../../../../../../../shared/knowledge/knowledge-base-ipc";
import { Button } from "../../../../../components/ui/Button";
import { FormField } from "../../../../../components/ui/FormField";
import { Input } from "../../../../../components/ui/Input";
import { Select } from "../../../../../components/ui/Select";
import { Textarea } from "../../../../../components/ui/Textarea";

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
      <FormField label={props.editLabel} htmlFor="knowledge-base-title-input">
        <Input
          id="knowledge-base-title-input"
          data-testid="knowledge-base-title-input"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          disabled={!props.saveEnabled || props.submitting}
        />
      </FormField>
      <FormField
        label={props.descriptionLabel}
        htmlFor="knowledge-base-description-input"
      >
        <Textarea
          id="knowledge-base-description-input"
          data-testid="knowledge-base-description-input"
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
          disabled={!props.saveEnabled || props.submitting}
        />
      </FormField>
      <FormField
        label={props.visibilityLabel}
        htmlFor="knowledge-base-visibility-input"
      >
        <Select
          id="knowledge-base-visibility-input"
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
        </Select>
      </FormField>
      <Button
        size="sm"
        data-testid="knowledge-base-save"
        disabled={!props.saveEnabled || props.submitting}
        onClick={props.onSave}
      >
        {props.saveLabel}
      </Button>
    </div>
  );
}
