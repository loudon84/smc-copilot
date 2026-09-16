// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import { FormField } from "./FormField";
import { Input } from "./Input";
import { Progress } from "./Progress";
import { SegmentedControl } from "./SegmentedControl";
import { Select } from "./Select";
import { Tabs } from "./Tabs";
import { Textarea } from "./Textarea";

describe("Work UI primitives", () => {
  it("Button uses .ui-* and forwards disabled", () => {
    render(
      <Button disabled variant="primary" size="sm">
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toContain("ui-button");
    expect(button.className).toContain("ui-button--primary");
    expect(button).toBeDisabled();
  });

  it("FormField + Input are labelled", () => {
    render(
      <FormField label="Title" htmlFor="title">
        <Input id="title" />
      </FormField>,
    );
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });

  it("Checkbox with label is keyboard named", () => {
    render(<Checkbox label="Bind" />);
    expect(screen.getByRole("checkbox", { name: "Bind" })).toBeInTheDocument();
  });

  it("Progress maps 0/50/100", () => {
    const { rerender } = render(<Progress value={0} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    rerender(<Progress value={50} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    rerender(<Progress value={100} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("Tabs expose tab semantics", () => {
    render(
      <Tabs
        tabs={[
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ]}
        active="a"
        onChange={() => undefined}
      />,
    );
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
  });

  it("Select Textarea Badge Segmented stay on ui prefix", () => {
    render(
      <>
        <Select aria-label="vis">
          <option value="private">Private</option>
        </Select>
        <Textarea aria-label="notes" />
        <Badge>active</Badge>
        <SegmentedControl
          ariaLabel="view"
          value="card"
          onChange={() => undefined}
          options={[
            { id: "card", label: "Card" },
            { id: "table", label: "Table" },
          ]}
        />
      </>,
    );
    expect(screen.getByLabelText("vis").className).toContain("ui-select");
    expect(screen.getByLabelText("notes").className).toContain("ui-textarea");
    expect(screen.getByText("active").className).toContain("ui-badge");
  });
});
