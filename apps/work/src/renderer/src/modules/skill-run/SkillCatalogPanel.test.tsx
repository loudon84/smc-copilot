// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillCatalogResponse } from "../../../../shared/skill-run";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
  }),
}));

vi.mock("./store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store")>();
  return {
    ...actual,
    fetchSkillRunCatalog: vi.fn(async () => actual.getSkillRunCatalogState()),
  };
});

import { SkillCatalogPanel } from "./SkillCatalogPanel";
import { setSkillRunCatalogState } from "./store";

afterEach(() => {
  cleanup();
});

const callableTools: SkillCatalogResponse = {
  status: "ready",
  tools: [
    {
      toolName: "alpha",
      title: "Alpha Skill",
      interactionMode: "chat",
      promptField: "prompt",
      supportsAttachments: false,
      callability: "callable",
      invocationMode: "prompt-first",
      category: "general",
      description: "First skill",
    },
    {
      toolName: "beta",
      title: "Beta Skill",
      interactionMode: "chat",
      promptField: "prompt",
      supportsAttachments: false,
      callability: "disabled",
      invocationMode: "unsupported-schema",
      reasonCode: "ROOT_SCHEMA_UNSUPPORTED",
      category: "math",
      description: "Disabled skill",
    },
    {
      toolName: "gamma",
      title: "Gamma Skill",
      interactionMode: "chat",
      promptField: "prompt",
      supportsAttachments: false,
      callability: "callable",
      invocationMode: "prompt-first",
      category: "math",
    },
    {
      toolName: "form-skill",
      title: "Form Skill",
      interactionMode: "form",
      supportsAttachments: false,
      callability: "unsupported",
      invocationMode: "form-required",
      reasonCode: "FORM_REQUIRED",
      category: "general",
    },
    {
      toolName: "limited-form",
      title: "Limited Form",
      interactionMode: "chat",
      promptField: "prompt",
      supportsAttachments: false,
      callability: "callable",
      invocationMode: "limited-parameter-form",
      extraStringFields: [{ name: "region", title: "Region" }],
      category: "general",
    },
  ],
};

function renderPanel(onSelectSkill = vi.fn()) {
  render(<SkillCatalogPanel onSelectSkill={onSelectSkill} />);
  return onSelectSkill;
}

beforeEach(() => {
  setSkillRunCatalogState({ status: "loading", tools: [] });
});

describe("SkillCatalogPanel", () => {
  it("renders loading state", () => {
    renderPanel();
    expect(screen.getByText("skillRun.loading")).toBeTruthy();
  });

  it("renders contract-unsupported state", () => {
    setSkillRunCatalogState({
      status: "contract-unsupported",
      tools: [],
      reason: "lock missing",
    });
    renderPanel();
    expect(screen.getByText("skillRun.contractUnsupported")).toBeTruthy();
    expect(screen.getByText("lock missing")).toBeTruthy();
  });

  it("renders unauthorized state", () => {
    setSkillRunCatalogState({ status: "unauthorized", tools: [] });
    renderPanel();
    expect(screen.getByText("skillRun.unauthorized")).toBeTruthy();
  });

  it("renders backend-unavailable state", () => {
    setSkillRunCatalogState({
      status: "backend-unavailable",
      tools: [],
      reason: "gateway down",
    });
    renderPanel();
    expect(screen.getByText("skillRun.backendUnavailable")).toBeTruthy();
    expect(screen.getByText("gateway down")).toBeTruthy();
  });

  it("renders empty ready state", () => {
    setSkillRunCatalogState({ status: "ready", tools: [] });
    renderPanel();
    expect(screen.getByText("skillRun.noSkillsFound")).toBeTruthy();
  });

  it("filters by search and category with keyboard selection", () => {
    setSkillRunCatalogState(callableTools);
    const onSelectSkill = renderPanel();

    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "gamma" } });
    expect(screen.getByText("Gamma Skill")).toBeTruthy();
    expect(screen.queryByText("Alpha Skill")).toBeNull();

    fireEvent.change(search, { target: { value: "" } });
    const mathPill = screen.getByRole("button", { name: "math" });
    expect(mathPill).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mathPill);
    expect(mathPill).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Beta Skill")).toBeTruthy();
    expect(screen.queryByText("Alpha Skill")).toBeNull();

    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelectSkill).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "gamma" }),
    );
  });

  it("does not select a disabled skill from keyboard Enter", () => {
    setSkillRunCatalogState({
      status: "ready",
      tools: [
        {
          toolName: "blocked",
          title: "Blocked Skill",
          interactionMode: "chat",
          supportsAttachments: false,
          callability: "disabled",
          invocationMode: "unsupported-schema",
          reasonCode: "ROOT_SCHEMA_UNSUPPORTED",
        },
      ],
    });
    const onSelectSkill = renderPanel();
    const search = screen.getByRole("combobox");

    fireEvent.keyDown(search, { key: "Enter" });
    expect(onSelectSkill).not.toHaveBeenCalled();
  });

  it("shows reason and blocks form-required selection", () => {
    setSkillRunCatalogState(callableTools);
    const onSelectSkill = renderPanel();
    expect(screen.getByText("skillRun.reasonFormRequired")).toBeTruthy();
    fireEvent.click(screen.getByText("Form Skill"));
    expect(onSelectSkill).not.toHaveBeenCalled();
  });

  it("clears search on Escape and exposes refresh aria-label", () => {
    setSkillRunCatalogState(callableTools);
    renderPanel();

    expect(
      screen.getByRole("button", { name: "skillRun.refresh" }),
    ).toBeTruthy();

    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "alpha" } });
    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
  });

  it("selects callable skills from the listbox", () => {
    setSkillRunCatalogState(callableTools);
    const onSelectSkill = renderPanel();

    const listbox = screen.getByRole("listbox");
    fireEvent.click(within(listbox).getByText("Alpha Skill"));

    expect(onSelectSkill).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "alpha", invocationMode: "prompt-first" }),
    );
  });

  it("selects limited-parameter-form skills from the listbox", () => {
    setSkillRunCatalogState(callableTools);
    const onSelectSkill = renderPanel();
    fireEvent.click(screen.getByText("Limited Form"));
    expect(onSelectSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "limited-form",
        invocationMode: "limited-parameter-form",
      }),
    );
  });
});
