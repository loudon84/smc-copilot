// @vitest-environment node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

describe("file-store", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-files-store-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  async function load() {
    return import("./file-store");
  }

  it("creates the managed files layout under profileHome", async () => {
    const storage = await load();
    const layout = storage.ensureFilesLayout("default");
    expect(layout.root).toBe(
      join(mockState.hermesHome, "desktop", "files"),
    );
    expect(existsSync(layout.objects)).toBe(true);
    expect(existsSync(layout.parsed)).toBe(true);
    expect(existsSync(layout.previews)).toBe(true);
    expect(existsSync(layout.temp)).toBe(true);
    expect(layout.dbPath).toBe(join(layout.root, "file-index.db"));
  });

  it("hashes a file with sha256 stream", async () => {
    const storage = await load();
    const filePath = join(mockState.hermesHome, "sample.txt");
    const body = "hash-me-please";
    writeFileSync(filePath, body);
    const digest = await storage.hashFileStream(filePath);
    expect(digest).toBe(createHash("sha256").update(body).digest("hex"));
  });

  it("stores a managed copy under objects/<prefix>/<hash>", async () => {
    const storage = await load();
    const source = join(mockState.hermesHome, "doc.txt");
    writeFileSync(source, "managed-copy");
    const hash = await storage.hashFileStream(source);
    const managed = await storage.storeManagedCopy(source, hash);
    expect(managed).toBe(
      join(
        mockState.hermesHome,
        "desktop",
        "files",
        "objects",
        hash.slice(0, 2),
        hash,
      ),
    );
    expect(existsSync(managed)).toBe(true);
    expect(readFileSync(managed, "utf-8")).toBe("managed-copy");

    // Second call is a no-op copy (same path).
    const again = await storage.storeManagedCopy(source, hash);
    expect(again).toBe(managed);
  });

  it("stageClipboardBytes writes via attachment staging", async () => {
    const storage = await load();
    const bytes = Buffer.from("paste-bytes").toString("base64");
    const staged = storage.stageClipboardBytes(
      "sess-1",
      "note.txt",
      bytes,
    );
    expect(existsSync(staged)).toBe(true);
    expect(readFileSync(staged, "utf-8")).toBe("paste-bytes");
  });
});
