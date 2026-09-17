// @vitest-environment jsdom
import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BusinessModuleUISurface } from "../components/common/business-module-ui-surface";

vi.mock("../styles/business-module-ui.css", () => ({}));

describe("BusinessModuleUISurface", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
  });

  it("maps Work appearance and writes 0 mutations to html", async () => {
    document.documentElement.setAttribute("data-theme", "github-light");
    document.documentElement.className = "theme-github-light";
    const writes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      writes.push(...records);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: false,
    });

    const { container } = render(
      <BusinessModuleUISurface module="knowledge">
        <span>kit</span>
      </BusinessModuleUISurface>,
    );

    await waitFor(() => {
      expect(
        container.querySelector("[data-module-theme]")?.getAttribute("data-module-theme"),
      ).toBe("light");
    });
    observer.disconnect();

    expect(writes).toHaveLength(0);
    expect(document.documentElement.getAttribute("data-theme")).toBe("github-light");
    expect(document.documentElement.className).toBe("theme-github-light");
    expect(container.querySelector("[data-business-module]")?.getAttribute("data-business-module")).toBe(
      "knowledge",
    );
  });

  it("maps light and dracula by appearance", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    const light = render(
      <BusinessModuleUISurface module="knowledge">light</BusinessModuleUISurface>,
    );
    await waitFor(() => {
      expect(light.container.querySelector("[data-module-theme]")?.getAttribute("data-module-theme")).toBe(
        "light",
      );
    });
    light.unmount();

    document.documentElement.setAttribute("data-theme", "dracula");
    const dark = render(
      <BusinessModuleUISurface module="knowledge">dark</BusinessModuleUISurface>,
    );
    await waitFor(() => {
      expect(dark.container.querySelector("[data-module-theme]")?.getAttribute("data-module-theme")).toBe(
        "dark",
      );
    });
  });
});
