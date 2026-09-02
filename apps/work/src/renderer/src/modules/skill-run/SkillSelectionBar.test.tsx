import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

import { SkillSelectionBar } from "./SkillSelectionBar";

describe("SkillSelectionBar", () => {
  it("renders the active skill and clears selection on button click", () => {
    const onClear = vi.fn();

    render(
      <SkillSelectionBar
        selection={{
          toolName: "calculator",
          title: "Calculator",
          callability: "callable",
        }}
        onClear={onClear}
      />,
    );

    expect(screen.getByText("Calculator")).toBeTruthy();
    expect(screen.getByText("(calculator)")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "skillRun.clearSelection" }),
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
