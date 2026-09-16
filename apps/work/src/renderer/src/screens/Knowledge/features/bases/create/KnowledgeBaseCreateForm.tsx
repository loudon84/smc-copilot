import { type ReactElement } from "react";
import type { KnowledgeBaseVisibility } from "../../../../../../../shared/knowledge/knowledge-base-ipc";
import { Button } from "../../../../../components/ui/Button";
import { FormField } from "../../../../../components/ui/FormField";
import { Input } from "../../../../../components/ui/Input";
import { Select } from "../../../../../components/ui/Select";
import { Textarea } from "../../../../../components/ui/Textarea";

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
      <FormField label={props.nameLabel} htmlFor="knowledge-base-create-title">
        <Input
          id="knowledge-base-create-title"
          data-testid="knowledge-base-create-title"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          disabled={props.disabled || props.submitting}
          placeholder={props.createLabel}
        />
      </FormField>
      <FormField
        label={props.descriptionLabel}
        htmlFor="knowledge-base-create-description"
      >
        <Textarea
          id="knowledge-base-create-description"
          data-testid="knowledge-base-create-description"
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
          disabled={props.disabled || props.submitting}
        />
      </FormField>
      <FormField
        label={props.visibilityLabel}
        htmlFor="knowledge-base-create-visibility"
      >
        <Select
          id="knowledge-base-create-visibility"
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
        </Select>
      </FormField>
      <div className="knowledge-toolbar">
        <Button
          size="sm"
          disabled={props.submitting}
          onClick={props.onCancel}
        >
          {props.cancelLabel}
        </Button>
        <Button
          size="sm"
          variant="primary"
          data-testid="knowledge-base-create-submit"
          disabled={props.disabled || props.submitting || !props.name.trim()}
          onClick={props.onSubmit}
        >
          {props.createLabel}
        </Button>
      </div>
    </>
  );
}
