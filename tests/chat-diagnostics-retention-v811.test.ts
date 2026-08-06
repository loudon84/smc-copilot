/**
 * v8.1.1 — Diagnostics retention + encryption + fileIds.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("../src/main/chat-runtime/chat-runtime-store-router", async () => {
  const actual = await vi.importActual<
    typeof import("../src/main/chat-runtime/chat-runtime-store-router")
  >("../src/main/chat-runtime/chat-runtime-store-router");
  return { ...actual, getStoreDb: () => null };
});

import {
  __resetChatRuntimeStoreForTests,
  upsertRun,
  upsertTurn,
} from "../src/main/chat-runtime/chat-runtime-store";
import {
  buildChatDiagnosticsExport,
  decryptRequestSnapshot,
  encryptRequestSnapshot,
  shouldRetainRecord,
} from "../src/main/chat-runtime/chat-diagnostics-service";

describe("chat diagnostics retention (v8.1.1)", () => {
  beforeEach(() => {
    __resetChatRuntimeStoreForTests();
  });

  // @lat: [[durable-chat-runtime-tests#Durable Chat Runtime tests#Diagnostics fileIds]]
  it("includes real fileIds from turn snapshots", () => {
    upsertRun({
      runId: "rd",
      profileId: "default",
      status: "completed",
      pendingInteractions: [],
      lastEventSequence: 1,
      updatedAt: Date.now(),
    });
    upsertTurn({
      turnId: "td",
      runId: "rd",
      profileId: "default",
      status: "completed",
      startedAt: Date.now(),
      lastSequence: 1,
      requestSnapshotJson: JSON.stringify({
        attachments: [{ id: "file-1", name: "a.txt" }],
        attachmentIds: ["file-2"],
      }),
    });
    const diag = buildChatDiagnosticsExport({ runId: "rd" });
    expect("ok" in diag && diag.ok === false).toBe(false);
    if ("ok" in diag) return;
    expect(diag.fileIds).toContain("file-1");
    expect(diag.fileIds).toContain("file-2");
  });

  it("encrypts and decrypts request snapshots", () => {
    const plain = JSON.stringify({ message: "secret" });
    const blob = encryptRequestSnapshot(plain, "test-secret");
    expect(blob.startsWith("v1:")).toBe(true);
    expect(decryptRequestSnapshot(blob, "test-secret")).toBe(plain);
  });

  it("applies retention windows", () => {
    const now = Date.now();
    expect(shouldRetainRecord("completed", now - 10 * 86400000, now)).toBe(true);
    expect(shouldRetainRecord("completed", now - 40 * 86400000, now)).toBe(false);
    expect(shouldRetainRecord("error", now - 40 * 86400000, now)).toBe(true);
  });
});
