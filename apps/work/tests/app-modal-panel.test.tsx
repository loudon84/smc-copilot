// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppModal, AppModalTitle } from "../src/renderer/src/components/modal/AppModal";

describe("AppModal panel", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps the panel inside a centered viewport and blocks close while submitting", () => {
    const onOpenChange = vi.fn();
    render(
      <AppModal open submitting onOpenChange={onOpenChange} labelledBy="t">
        <AppModalTitle id="t">Title</AppModalTitle>
        <button type="button">Inside</button>
      </AppModal>,
    );

    const panel = document.querySelector(".app-modal-panel");
    const viewport = document.querySelector(".app-modal-viewport");
    expect(panel).toBeTruthy();
    expect(viewport).toBeTruthy();
    expect(viewport?.contains(panel)).toBe(true);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText("Title")).toBeTruthy();
  });
});
