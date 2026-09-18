import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopAuthState } from "../../../../shared/auth/auth-contract";

vi.mock("../useI18n", () => ({
  useI18n: () => ({
    t: (key: string): string => key,
  }),
}));

vi.mock("../modal/AppModal", () => ({
  AppModal: ({
    open,
    children,
  }: {
    open: boolean;
    children: React.ReactNode;
  }): React.JSX.Element | null => (open ? <div>{children}</div> : null),
  AppModalTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
}));

vi.mock("../common/ProfileAvatar", () => ({
  default: ({ name }: { name: string }): React.JSX.Element => (
    <span data-testid={`avatar-${name}`} />
  ),
}));

vi.mock("../../screens/Soul/Soul", () => ({
  default: (): React.JSX.Element => <div data-testid="soul" />,
}));

vi.mock("../../screens/Memory/MemoryEntries", () => ({
  MemoryEntries: (): React.JSX.Element => <div data-testid="memory" />,
}));

vi.mock("./ProfileWalletPane", () => ({
  default: (): React.JSX.Element => <div data-testid="wallet" />,
}));

vi.mock("./ProfileSyncPane", () => ({
  default: (): React.JSX.Element => <div data-testid="sync" />,
}));

import ProfileModal from "./ProfileModal";

interface ProfileInfo {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
  isActive: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
}

function profile(name = "Default Agent"): ProfileInfo {
  return {
    id: "default",
    name,
    path: "/tmp/hermes",
    isDefault: true,
    isActive: true,
    model: "",
    provider: "auto",
    hasEnv: false,
    hasSoul: false,
    skillCount: 0,
    gatewayRunning: false,
  };
}

function installHermesAPI(profiles: ProfileInfo[]): {
  setProfileName: ReturnType<typeof vi.fn>;
} {
  const setProfileName = vi.fn().mockResolvedValue({ success: true });
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      listProfiles: vi.fn().mockResolvedValue(profiles),
      setProfileName,
      setProfileColor: vi.fn().mockResolvedValue({ success: true }),
      setProfileAvatar: vi.fn().mockResolvedValue({ success: true }),
      removeProfileAvatar: vi.fn().mockResolvedValue({ success: true }),
      deleteProfile: vi.fn().mockResolvedValue({ success: true }),
      readMemory: vi.fn().mockResolvedValue({ entries: [] }),
    },
  });
  return { setProfileName };
}

function installDesktopAuth(initial: DesktopAuthState): {
  emit: (state: DesktopAuthState) => void;
  setState: (state: DesktopAuthState) => void;
} {
  const box = { current: initial };
  let listener: ((state: DesktopAuthState) => void) | null = null;
  Object.defineProperty(window, "desktopAuth", {
    configurable: true,
    value: {
      getState: vi.fn(() => Promise.resolve(box.current)),
      saveEndpointConfig: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      refresh: vi.fn(),
      onStateChanged: vi.fn((cb: (state: DesktopAuthState) => void) => {
        listener = cb;
        return () => {
          listener = null;
        };
      }),
    },
  });
  return {
    emit: (state) => {
      box.current = state;
      listener?.(state);
    },
    setState: (state) => {
      box.current = state;
    },
  };
}

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

function renderModal(open = true): ReturnType<typeof render> {
  return render(
    <ProfileModal
      name="default"
      open={open}
      onClose={() => {}}
      onChanged={() => {}}
    />,
  );
}

async function startNameEdit(): Promise<HTMLInputElement> {
  fireEvent.click(
    await screen.findByRole("button", { name: "agents.nameLabel" }),
  );
  return screen.getByRole("textbox", {
    name: "agents.nameLabel",
  }) as HTMLInputElement;
}

afterEach(() => {
  Reflect.deleteProperty(window, "desktopAuth");
});

describe("ProfileModal name editor", () => {
  it("does not save a canceled Escape edit when blur fires afterward", async () => {
    installDesktopAuth({
      authenticated: false,
      endpointConfig: null,
      user: null,
      expiresAt: null,
    });
    const api = installHermesAPI([profile()]);
    renderModal();

    const input = await startNameEdit();
    fireEvent.change(input, { target: { value: "Edited Agent" } });
    fireEvent.keyDown(input, { key: "Escape" });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(api.setProfileName).not.toHaveBeenCalled();
    });
    expect(screen.getAllByText("Default Agent").length).toBeGreaterThan(0);
  });

  it("still saves on blur after a canceled edit is reopened", async () => {
    installDesktopAuth({
      authenticated: false,
      endpointConfig: null,
      user: null,
      expiresAt: null,
    });
    const api = installHermesAPI([profile()]);
    renderModal();

    const canceledInput = await startNameEdit();
    fireEvent.change(canceledInput, { target: { value: "Canceled Agent" } });
    fireEvent.keyDown(canceledInput, { key: "Escape" });

    const savedInput = await startNameEdit();
    fireEvent.change(savedInput, { target: { value: "Saved Agent" } });
    fireEvent.blur(savedInput);

    await waitFor(() => {
      expect(api.setProfileName).toHaveBeenCalledWith("default", "Saved Agent");
    });
  });
});

describe("ProfileModal portal account meta", () => {
  it("shows displayName and backendUrl when signed in", async () => {
    installDesktopAuth(signedInState());
    installHermesAPI([profile()]);
    renderModal();

    expect(await screen.findByText("Alice Chen")).toBeTruthy();
    const url = screen.getByText("http://192.168.102.247:4510");
    expect(url).toBeTruthy();
    expect(url.getAttribute("title")).toBe("http://192.168.102.247:4510");
  });

  it("falls back to username when displayName is missing", async () => {
    installDesktopAuth(
      signedInState({
        user: { id: "u1", username: "alice" },
      }),
    );
    installHermesAPI([profile()]);
    renderModal();

    expect(await screen.findByText("alice")).toBeTruthy();
    expect(screen.getByText("http://192.168.102.247:4510")).toBeTruthy();
  });

  it("shows not-signed-in when unauthenticated", async () => {
    installDesktopAuth({
      authenticated: false,
      endpointConfig: {
        backendUrl: "http://192.168.102.247:4510",
        authPrefix: "/api/v1/auth",
        aiosHomeUrl: "http://127.0.0.1:3000",
      },
      user: null,
      expiresAt: null,
    });
    installHermesAPI([profile()]);
    renderModal();

    expect(await screen.findByText("auth.notSignedIn")).toBeTruthy();
    expect(screen.queryByText("http://192.168.102.247:4510")).toBeNull();
  });

  it("updates account meta when auth state changes", async () => {
    const auth = installDesktopAuth({
      authenticated: false,
      endpointConfig: null,
      user: null,
      expiresAt: null,
    });
    installHermesAPI([profile()]);
    renderModal();

    expect(await screen.findByText("auth.notSignedIn")).toBeTruthy();

    auth.emit(signedInState());

    expect(await screen.findByText("Alice Chen")).toBeTruthy();
    expect(screen.getByText("http://192.168.102.247:4510")).toBeTruthy();
  });

  it("refetches account meta when the modal reopens", async () => {
    const auth = installDesktopAuth(signedInState());
    installHermesAPI([profile()]);
    const view = renderModal();

    expect(await screen.findByText("http://192.168.102.247:4510")).toBeTruthy();

    auth.setState(
      signedInState({
        endpointConfig: {
          backendUrl: "http://portal.example:4510",
          authPrefix: "/api/v1/auth",
          aiosHomeUrl: "http://127.0.0.1:3000",
        },
      }),
    );
    view.rerender(
      <ProfileModal
        name="default"
        open={false}
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );
    view.rerender(
      <ProfileModal
        name="default"
        open
        onClose={() => {}}
        onChanged={() => {}}
      />,
    );

    expect(await screen.findByText("http://portal.example:4510")).toBeTruthy();
  });
});
