import { type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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
  const locked = props.disabled || props.submitting;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <Label htmlFor="knowledge-base-create-title">{props.nameLabel}</Label>
        <Input
          id="knowledge-base-create-title"
          data-testid="knowledge-base-create-title"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          disabled={locked}
          placeholder={props.createLabel}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="knowledge-base-create-description">
          {props.descriptionLabel}
        </Label>
        <Textarea
          id="knowledge-base-create-description"
          data-testid="knowledge-base-create-description"
          value={props.description}
          onChange={(event) => props.onDescriptionChange(event.target.value)}
          disabled={locked}
        />
      </div>
      <div className="grid gap-1">
        <Label>{props.visibilityLabel}</Label>
        <Select
          value={props.visibility}
          disabled={locked}
          onValueChange={(value) =>
            props.onVisibilityChange(value as KnowledgeBaseVisibility)
          }
        >
          <SelectTrigger data-testid="knowledge-base-create-visibility">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">{props.privateLabel}</SelectItem>
            <SelectItem value="department">{props.departmentLabel}</SelectItem>
            <SelectItem value="organization">{props.organizationLabel}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={props.submitting}
          onClick={props.onCancel}
        >
          {props.cancelLabel}
        </Button>
        <Button
          type="button"
          data-testid="knowledge-base-create-submit"
          disabled={locked || !props.name.trim()}
          onClick={props.onSubmit}
        >
          {props.createLabel}
        </Button>
      </div>
    </div>
  );
}
