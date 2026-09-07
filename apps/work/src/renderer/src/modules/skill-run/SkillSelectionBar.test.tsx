// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

import { SkillSelectionBar } from "./SkillSelectionBar";

afterEach(() => {
  cleanup();
});

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

  it("renders extra string inputs for limited-parameter-form", () => {
    const onExtraParametersChange = vi.fn();
    render(
      <SkillSelectionBar
        selection={{
          toolName: "writer.extra",
          title: "Writer Extra",
          interactionMode: "chat",
          promptField: "prompt",
          supportsAttachments: false,
          callability: "callable",
          invocationMode: "limited-parameter-form",
          extraStringFields: [{ name: "region", title: "Region" }],
        }}
        extraParameterValues={{}}
        onExtraParametersChange={onExtraParametersChange}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByText("skillRun.skillUnavailable")).toBeNull();
    const input = screen.getByLabelText("Region");
    fireEvent.change(input, { target: { value: "cn" } });
    expect(onExtraParametersChange).toHaveBeenCalledWith({ region: "cn" });
  });

  it("does not render extra inputs for prompt-first", () => {
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
          extraStringFields: [{ name: "region" }],
        }}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("region")).toBeNull();
  });
});
