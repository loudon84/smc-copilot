import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopAuthState } from "../../../../shared/auth/auth-contract";

const openProfile = vi.fn();
const skipPortalLogin = vi.hoisted(() => vi.fn(() => false));

vi.mock("../../components/useI18n", () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>): string => {
      if (key === "auth.logoutConfirm" && options?.name) {
        return `Sign out of ${String(options.name)}?`;
      }
      return key;
    },
  }),
}));

vi.mock("../../components/profile/ProfileModalContext", () => ({
  useProfileModal: () => ({ openProfile }),
}));

vi.mock("../../components/common/ProfileAvatar", () => ({
  default: ({ name }: { name: string }): React.JSX.Element => (
    <span data-testid={`avatar-${name}`} />
  ),
}));

vi.mock("../../components/modal/AppModal", () => ({
  AppModal: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }): React.JSX.Element | null => (open ? <div>{children}</div> : null),
  AppModalTitle: ({
    children,
    id,
  }: {
    children: React.ReactNode;
    id?: string;
  }) => <h1 id={id}>{children}</h1>,
}));

vi.mock("../../../../shared/auth/auth-url", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("../../../../shared/auth/auth-url")
  >();
  return {
    ...actual,
    skipPortalLogin: () => skipPortalLogin(),
  };
});

import ProfileSwitcher from "./ProfileSwitcher";

function signedInState(
  overrides: Partial<DesktopAuthState> = {},
): DesktopAuthState {
  return {
    authenticated: true,
    endpointConfig: {
      backendUrl: "http://192.168.102.247:4510",
      authPrefix: "/api/v1/auth",
      aiosHomeUrl: "http://127.0.0.1:3000",
    },
    user: {
      id: "u1",
      username: "alice",
      displayName: "Alice Chen",
    },
    expiresAt: null,
    ...overrides,
  };
}

function installHermesAPI(): void {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      listProfiles: vi.fn().mockResolvedValue([
        {
          id: "default",
          name: "卢姐",
          isDefault: true,
          isActive: true,
          model: "",
          skillCount: 0,
          gatewayRunning: false,
        },
      ]),
      setActiveProfile: vi.fn(),
    },
  });
}

function installDesktopAuth(initial: DesktopAuthState): {
  logout: ReturnType<typeof vi.fn>;
} {
  const logout = vi.fn().mockResolvedValue({
    authenticated: false,
    endpointConfig: initial.endpointConfig,
    user: null,
    expiresAt: null,
  });
  Object.defineProperty(window, "desktopAuth", {
    configurable: true,
    value: {
      getState: vi.fn().mockResolvedValue(initial),
      saveEndpointConfig: vi.fn(),
      login: vi.fn(),
      logout,
      refresh: vi.fn(),
      onStateChanged: vi.fn(() => () => undefined),
    },
  });
  return { logout };
}

afterEach(() => {
  Reflect.deleteProperty(window, "desktopAuth");
  openProfile.mockReset();
  skipPortalLogin.mockReturnValue(false);
});

beforeEach(() => {
  installHermesAPI();
});

describe("ProfileSwitcher portal account", () => {
  it("shows the portal displayName instead of the agent profile name", async () => {
    installDesktopAuth(signedInState());
    render(<ProfileSwitcher activeProfile="default" />);

    expect(await screen.findByText("Alice Chen")).toBeTruthy();
    expect(screen.queryByText("卢姐")).toBeNull();
  });

  it("falls back to username when displayName is missing", async () => {
    installDesktopAuth(
      signedInState({ user: { id: "u1", username: "alice" } }),
    );
    render(<ProfileSwitcher activeProfile="default" />);

    expect(await screen.findByText("alice")).toBeTruthy();
  });

  it("shows not-signed-in and hides logout when unauthenticated", async () => {
    installDesktopAuth({
      authenticated: false,
      endpointConfig: null,
      user: null,
      expiresAt: null,
    });
    render(<ProfileSwitcher activeProfile="default" />);

    expect(await screen.findByText("auth.notSignedIn")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "auth.logout" }),
    ).toBeNull();
  });

  it("hides logout when portal login is skipped", async () => {
    skipPortalLogin.mockReturnValue(true);
    installDesktopAuth(signedInState());
    render(<ProfileSwitcher activeProfile="default" />);

    expect(await screen.findByText("Alice Chen")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "auth.logout" }),
    ).toBeNull();
  });

  it("hides logout in compact mode and opens ProfileModal from the avatar", async () => {
    installDesktopAuth(signedInState());
    render(<ProfileSwitcher activeProfile="default" compact />);

    expect(
      screen.queryByRole("button", { name: "auth.logout" }),
    ).toBeNull();
    expect(screen.queryByText("Alice Chen")).toBeNull();

    fireEvent.click(screen.getByTestId("avatar-default").closest("button")!);
    expect(openProfile).toHaveBeenCalledWith("default", expect.any(Object));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a confirm dialog before calling logout", async () => {
    const { logout } = installDesktopAuth(signedInState());
    render(<ProfileSwitcher activeProfile="default" />);

    fireEvent.click(await screen.findByRole("button", { name: "auth.logout" }));
    expect(logout).not.toHaveBeenCalled();
    expect(screen.getByText("auth.logoutConfirmTitle")).toBeTruthy();
    expect(screen.getByText("Sign out of Alice Chen?")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    expect(logout).not.toHaveBeenCalled();
    expect(screen.queryByText("auth.logoutConfirmTitle")).toBeNull();
  });

  it("logs out after confirm", async () => {
    const { logout } = installDesktopAuth(signedInState());
    render(<ProfileSwitcher activeProfile="default" />);

    fireEvent.click(await screen.findByRole("button", { name: "auth.logout" }));
    const confirmButtons = screen.getAllByRole("button", { name: "auth.logout" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
  });
});
