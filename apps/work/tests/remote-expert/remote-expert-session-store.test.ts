import { describe, expect, it, vi } from "vitest";
import { getDbConnection } from "../../src/main/db";
import {
  getRemoteAcpSessionRef,
  upsertRemoteAcpSessionRef,
} from "../../src/main/remote-expert/remote-expert-session-store";
import type { RemoteAcpSessionRef } from "../../src/shared/remote-expert";

vi.mock("../../src/main/db", () => ({
  getDbConnection: vi.fn(),
}));

const mockedGetDb = vi.mocked(getDbConnection);

class FakeDb {
  rows = new Map<string, Record<string, unknown>>();
  exec(): void {}
  prepare(sql: string) {
    return {
      run: (...args: unknown[]) => {
        if (!sql.includes("INSERT INTO")) return;
        const [
          desktopSessionId,
          agentRef,
          acpSessionId,
          lastSeq,
          connectionState,
          updatedAt,
        ] = args;
        const existing = this.rows.get(String(desktopSessionId));
        const nextLast = existing
          ? Math.max(Number(existing.last_seq), Number(lastSeq))
          : Number(lastSeq);
        this.rows.set(String(desktopSessionId), {
          desktop_session_id: desktopSessionId,
          schema_version: 1,
          agent_ref: agentRef,
          acp_session_id: acpSessionId,
          last_seq: nextLast,
          connection_state: connectionState,
          updated_at: updatedAt,
        });
      },
      get: (id: unknown) => this.rows.get(String(id)),
    };
  }
}

describe("remote-expert session store", () => {
  it("[A-PERSIST-001] upserts, queries, and migrates to expired with lastSeq max", () => {
    const db = new FakeDb();
    mockedGetDb.mockImplementation(() => db as never);
    const first: RemoteAcpSessionRef = {
      schemaVersion: 1,
      desktopSessionId: "desk-1",
      agentRef: "sales-expert",
      acpSessionId: "acp-1",
      lastSeq: 4,
      connectionState: "active",
      updatedAt: 1,
    };
    expect(upsertRemoteAcpSessionRef(first).lastSeq).toBe(4);
    const stale: RemoteAcpSessionRef = {
      ...first,
      lastSeq: 2,
      connectionState: "expired",
      updatedAt: 2,
    };
    const stored = upsertRemoteAcpSessionRef(stale);
    expect(stored.lastSeq).toBe(4);
    expect(getRemoteAcpSessionRef("desk-1")?.connectionState).toBe("expired");
  });

  it("[A-NEG-PERSIST-001] fails closed when state db is unavailable", () => {
    mockedGetDb.mockReturnValue(null);
    expect(() =>
      upsertRemoteAcpSessionRef({
        schemaVersion: 1,
        desktopSessionId: "desk-1",
        agentRef: "sales-expert",
        acpSessionId: "acp-1",
        lastSeq: 0,
        connectionState: "active",
        updatedAt: 1,
      }),
    ).toThrow(/state db unavailable/);
  });
});
