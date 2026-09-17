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
  const locked = !props.saveEnabled || props.submitting;
  return (
    <div className="grid gap-3" data-testid="knowledge-base-settings">
      <div className="grid gap-1">
        <Label htmlFor="knowledge-base-title-input">{props.editLabel}</Label>
        <Input
          id="knowledge-base-title-input"
          data-testid="knowledge-base-title-input"
          value={props.name}
          onChange={(event) => props.onNameChange(event.target.value)}
          disabled={locked}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="knowledge-base-description-input">
          {props.descriptionLabel}
        </Label>
        <Textarea
          id="knowledge-base-description-input"
          data-testid="knowledge-base-description-input"
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
          <SelectTrigger data-testid="knowledge-base-visibility-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private">{props.privateLabel}</SelectItem>
            <SelectItem value="department">{props.departmentLabel}</SelectItem>
            <SelectItem value="organization">{props.organizationLabel}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button
        type="button"
        data-testid="knowledge-base-save"
        disabled={locked}
        onClick={props.onSave}
      >
        {props.saveLabel}
      </Button>
    </div>
  );
}
