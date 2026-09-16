import { type ReactElement } from "react";
import { Input } from "../ui/Input";

export function SearchInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId?: string;
  className?: string;
}): ReactElement {
  return (
    <div className={["ui-search", props.className].filter(Boolean).join(" ")}>
      <Input
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.placeholder}
        data-testid={props.testId}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
