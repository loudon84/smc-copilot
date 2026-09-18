// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: () => {},
  }),
}));

import { ChatResumeEmptyState } from "./ChatResumeEmptyState";

describe("ChatResumeEmptyState", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders resume empty UI without new-chat suggestion keys", () => {
    render(
      <ChatResumeEmptyState
        title="Report skills research dir"
        onRetry={() => {}}
        onNewChat={() => {}}
      />,
    );

    expect(screen.getByTestId("chat-resume-empty")).toBeTruthy();
    expect(screen.getByText("Report skills research dir")).toBeTruthy();
    expect(screen.getByText("chat.resumeEmptyHint")).toBeTruthy();
    expect(screen.getByRole("button", { name: "chat.resumeEmptyRetry" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "chat.resumeEmptyNewChat" }),
    ).toBeTruthy();
    expect(screen.queryByText("chat.suggestionSearch")).toBeNull();
  });

  it("invokes retry when the button is clicked", () => {
    const onRetry = vi.fn();
    render(<ChatResumeEmptyState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "chat.resumeEmptyRetry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
