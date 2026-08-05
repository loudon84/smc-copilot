import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptNavigator } from "./PromptNavigator";
import type { PromptNavigationItem } from "./promptNavigatorUtils";

vi.mock("../../../components/useI18n", () => ({
  useI18n: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => {
      const map: Record<string, string> = {
        "chat.promptNavigator.title": "Prompts",
        "chat.promptNavigator.show": "Show conversation prompts",
        "chat.promptNavigator.hide": "Hide conversation prompts",
      };
      return map[key] ?? key;
    },
  }),
}));

const items: PromptNavigationItem[] = [
  {
    messageId: "u1",
    sequence: 1,
    label: "First",
    fullText: "First",
    attachmentCount: 0,
  },
  {
    messageId: "u2",
    sequence: 2,
    label: "Second",
    fullText: "Second",
    attachmentCount: 0,
  },
];

// @lat: [[prompt-navigator-tests#Prompt Navigator tests#Navigator UI open and select]]
describe("PromptNavigator", () => {
  it("renders nothing when fewer than two prompts", () => {
    const { container } = render(
      <PromptNavigator
        items={[items[0]]}
        activePromptId={null}
        open
        compact={false}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows count on closed trigger and opens on click", () => {
    const onOpenChange = vi.fn();
    render(
      <PromptNavigator
        items={items}
        activePromptId={null}
        open={false}
        compact={false}
        onOpenChange={onOpenChange}
        onSelect={vi.fn()}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "Show conversation prompts",
    });
    expect(trigger.textContent).toContain("2");
    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("marks active item and calls onSelect", () => {
    const onSelect = vi.fn();
    render(
      <PromptNavigator
        items={items}
        activePromptId="u2"
        open
        compact={false}
        onOpenChange={vi.fn()}
        onSelect={onSelect}
      />,
    );
    const active = screen.getByRole("listitem", { current: "location" });
    expect(active.textContent).toContain("Second");
    fireEvent.click(screen.getByText("First"));
    expect(onSelect).toHaveBeenCalledWith("u1");
  });

  it("closes when hide is clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <PromptNavigator
        items={items}
        activePromptId={null}
        open
        compact={false}
        onOpenChange={onOpenChange}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Hide conversation prompts" }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
