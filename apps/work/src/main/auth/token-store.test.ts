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
  resetStoredSessionChangeListenersForTests,
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
});
