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
          interactionMode: "chat",
          promptField: "prompt",
          supportsAttachments: false,
          callability: "callable",
          invocationMode: "prompt-first",
        }}
        onClear={onClear}
      />,
    );

    expect(screen.getByText("Calculator")).toBeTruthy();
    expect(screen.getByText("(calculator)")).toBeTruthy();
    expect(screen.queryByText("skillRun.skillUnavailable")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "skillRun.clearSelection" }),
    );

    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("shows unavailable hint when selection is not prompt-first", () => {
    render(
      <SkillSelectionBar
        selection={{
          toolName: "form.skill",
          title: "Form Skill",
          interactionMode: "form",
          supportsAttachments: false,
          callability: "unsupported",
          invocationMode: "form-required",
          reasonCode: "FORM_REQUIRED",
        }}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText("skillRun.skillUnavailable")).toBeTruthy();
  });
});
