import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SplashScreen from "./SplashScreen";

vi.mock("../../assets/hermes-one.png", () => ({ default: "splash.png" }));

describe("SplashScreen restore wait", () => {
  it("shows a spinner beside the status without a second full-screen layer", () => {
    const { container } = render(
      <SplashScreen
        status="Loading user profile"
        busy
        onFinished={() => undefined}
      />,
    );
    expect(screen.getByText("Loading user profile")).toBeTruthy();
    expect(container.querySelector(".splash-status-spinner")).toBeTruthy();
    expect(container.querySelectorAll(".splash-screen")).toHaveLength(1);
  });
});
