import { type ReactElement, type ReactNode } from "react";
import { Label } from "../ui/Label";
import { Select } from "../ui/Select";

export function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  testId?: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <Label>
      {props.label}
      <Select
        value={props.value}
        data-testid={props.testId}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      >
        {props.children}
      </Select>
    </Label>
  );
}
