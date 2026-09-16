// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";
import { FilterSelect } from "./FilterSelect";
import { PageHeader } from "./PageHeader";
import { SearchInput } from "./SearchInput";
import { StatusBadge } from "./StatusBadge";

describe("Work common components", () => {
  it("PageHeader and EmptyState render titles", () => {
    render(
      <>
        <PageHeader title="Bases" />
        <EmptyState title="Empty" description="None" testId="empty" />
      </>,
    );
    expect(screen.getByRole("heading", { name: "Bases" })).toBeInTheDocument();
    expect(screen.getByTestId("empty")).toHaveTextContent("Empty");
  });

  it("SearchInput and StatusBadge use ui primitives", () => {
    render(
      <>
        <SearchInput value="q" onChange={() => undefined} testId="search" />
        <StatusBadge>active</StatusBadge>
      </>,
    );
    expect(screen.getByTestId("search").className).toContain("ui-input");
    expect(screen.getByText("active").className).toContain("ui-badge");
  });

  it("FilterSelect composes Label + Select", () => {
    render(
      <FilterSelect label="Visibility" value="all" onChange={() => undefined}>
        <option value="all">All</option>
      </FilterSelect>,
    );
    expect(screen.getByLabelText("Visibility").className).toContain("ui-select");
  });
});
