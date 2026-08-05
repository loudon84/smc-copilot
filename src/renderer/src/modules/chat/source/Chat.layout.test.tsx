import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  SESSION_FILES_VISIBLE_KEY,
  PROMPT_NAVIGATOR_OPEN_KEY,
  useFilePreviewMaximized,
  usePromptNavigatorOpen,
  useSessionFilesVisible,
} from "./useChatPanelLayout";

function SessionFilesHarness(): React.JSX.Element {
  const [visible, setVisible] = useSessionFilesVisible();
  return (
    <div>
      <span data-testid="visible">{String(visible)}</span>
      <button type="button" onClick={() => setVisible(false)}>
        hide
      </button>
      <button type="button" onClick={() => setVisible(true)}>
        show
      </button>
    </div>
  );
}

function PromptNavigatorOpenHarness(): React.JSX.Element {
  const [open, setOpen] = usePromptNavigatorOpen();
  return (
    <div>
      <span data-testid="nav-open">{String(open)}</span>
      <button type="button" onClick={() => setOpen(false)}>
        close-nav
      </button>
      <button type="button" onClick={() => setOpen(true)}>
        open-nav
      </button>
    </div>
  );
}

function MaximizeHarness({
  previewOpen,
  active,
}: {
  previewOpen: boolean;
  active: boolean;
}): React.JSX.Element {
  const [maximized, setMaximized] = useFilePreviewMaximized(
    previewOpen,
    active,
  );
  return (
    <div>
      <span data-testid="maximized">{String(maximized)}</span>
      <button type="button" onClick={() => setMaximized(true)}>
        maximize
      </button>
    </div>
  );
}

describe("Chat panel layout hooks", () => {
  beforeEach(() => {
    localStorage.removeItem(SESSION_FILES_VISIBLE_KEY);
    localStorage.removeItem(PROMPT_NAVIGATOR_OPEN_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(SESSION_FILES_VISIBLE_KEY);
    localStorage.removeItem(PROMPT_NAVIGATOR_OPEN_KEY);
  });

  it("defaults Session Files to visible", () => {
    render(<SessionFilesHarness />);
    expect(screen.getByTestId("visible").textContent).toBe("true");
  });

  it("persists hide preference and restores floating-show path", () => {
    render(<SessionFilesHarness />);
    fireEvent.click(screen.getByText("hide"));
    expect(screen.getByTestId("visible").textContent).toBe("false");
    expect(localStorage.getItem(SESSION_FILES_VISIBLE_KEY)).toBe("false");
    fireEvent.click(screen.getByText("show"));
    expect(screen.getByTestId("visible").textContent).toBe("true");
  });

  // @lat: [[prompt-navigator-tests#Prompt Navigator tests#Open preference persistence]]
  it("persists Prompt Navigator open preference independently", () => {
    render(<PromptNavigatorOpenHarness />);
    expect(screen.getByTestId("nav-open").textContent).toBe("true");
    fireEvent.click(screen.getByText("close-nav"));
    expect(screen.getByTestId("nav-open").textContent).toBe("false");
    expect(localStorage.getItem(PROMPT_NAVIGATOR_OPEN_KEY)).toBe("false");
    fireEvent.click(screen.getByText("open-nav"));
    expect(screen.getByTestId("nav-open").textContent).toBe("true");
  });

  it("exits maximize on Esc when Chat is active", () => {
    render(<MaximizeHarness previewOpen active />);
    fireEvent.click(screen.getByText("maximize"));
    expect(screen.getByTestId("maximized").textContent).toBe("true");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByTestId("maximized").textContent).toBe("false");
  });

  it("ignores Esc when Chat is not active", () => {
    render(<MaximizeHarness previewOpen active={false} />);
    fireEvent.click(screen.getByText("maximize"));
    expect(screen.getByTestId("maximized").textContent).toBe("true");
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.getByTestId("maximized").textContent).toBe("true");
  });

  it("clears maximize when preview closes", () => {
    const { rerender } = render(<MaximizeHarness previewOpen active />);
    fireEvent.click(screen.getByText("maximize"));
    expect(screen.getByTestId("maximized").textContent).toBe("true");
    rerender(<MaximizeHarness previewOpen={false} active />);
    expect(screen.getByTestId("maximized").textContent).toBe("false");
  });
});
