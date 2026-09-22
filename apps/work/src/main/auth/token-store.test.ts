import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredAuthSession } from "../../shared/auth/auth-contract";

vi.mock("electron", () => ({
  app: {
    getPath: () => "E:/tmp/work-auth-test-userdata",
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}));

import {
  clearStoredSession,
  getSessionEpoch,
  readStoredSession,
  readStoredSessionSync,
  resetStoredSessionChangeListenersForTests,
  setKeytarFactoryForTests,
  subscribeStoredSessionChanges,
  writeStoredSession,
} from "./token-store";

const sample: StoredAuthSession = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: "2026-08-24T00:00:00.000Z",
  tokenType: "Bearer",
  user: { id: "u1", username: "alice" },
};

describe("token-store session-change subscription", () => {
  afterEach(async () => {
    setKeytarFactoryForTests(null);
    resetStoredSessionChangeListenersForTests();
    await clearStoredSession();
  });

  it("notifies listeners after write and clear", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStoredSessionChanges(listener);

    await writeStoredSession(sample);
    expect(listener).toHaveBeenCalledTimes(1);

    await clearStoredSession();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await writeStoredSession(sample);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify logout until durable keytar wipe finishes", async () => {
    let releaseDelete!: () => void;
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const store = new Map<string, string>();
    store.set("session", JSON.stringify(sample));

    setKeytarFactoryForTests(async () => ({
      getPassword: async () => store.get("session") ?? null,
      setPassword: async (_s, _a, password) => {
        store.set("session", password);
      },
      deletePassword: async () => {
        await deleteGate;
        store.delete("session");
        return true;
      },
    }));

    await writeStoredSession(sample);
    const listener = vi.fn();
    subscribeStoredSessionChanges(listener);
    listener.mockClear();

    const clearPromise = clearStoredSession();
    // While durable wipe is still gated, renderer must not be told "logged out"
    // yet — otherwise LoginScreen getState can rehydrate from keytar.
    await Promise.resolve();
    expect(listener).not.toHaveBeenCalled();
    expect(store.has("session")).toBe(true);

    releaseDelete();
    await clearPromise;
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.has("session")).toBe(false);
    expect(readStoredSessionSync()).toBeNull();
  });

  it("defeats concurrent readStoredSession rehydrate during clear", async () => {
    let releaseDelete!: () => void;
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve;
    });
    const store = new Map<string, string>();
    store.set("session", JSON.stringify(sample));

    setKeytarFactoryForTests(async () => ({
      getPassword: async () => store.get("session") ?? null,
      setPassword: async (_s, _a, password) => {
        store.set("session", password);
      },
      deletePassword: async () => {
        await deleteGate;
        store.delete("session");
        return true;
      },
    }));

    await writeStoredSession(sample);
    expect(readStoredSessionSync()?.accessToken).toBe("access");

    const clearPromise = clearStoredSession();
    // Simulate LoginScreen getState while wipe is in flight.
    const raced = readStoredSession();
    releaseDelete();
    await clearPromise;
    await raced;

    expect(readStoredSessionSync()).toBeNull();
    expect(await readStoredSession()).toBeNull();
  });

  it("rejects stale writeStoredSession from a pre-logout refresh epoch", async () => {
    await writeStoredSession(sample);
    const epochBeforeLogout = getSessionEpoch();

    await clearStoredSession();
    expect(getSessionEpoch()).toBeGreaterThan(epochBeforeLogout);

    const wrote = await writeStoredSession(
      { ...sample, accessToken: "stale-refresh" },
      { expectedEpoch: epochBeforeLogout },
    );
    expect(wrote).toBe(false);
    expect(await readStoredSession()).toBeNull();
  });
});
