// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "fs";
import { copyFile, rename, unlink } from "fs/promises";
import { createHash } from "crypto";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    copyFile: vi.fn(actual.copyFile),
    rename: vi.fn(actual.rename),
    unlink: vi.fn(actual.unlink),
  };
});

vi.mock("../runtime/hermes-runtime-paths", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
  getHermesHome: () => mockState.hermesHome,
}));

describe("file-store", () => {
  let filesystem: typeof import("fs/promises");

  beforeEach(async () => {
    filesystem =
      await vi.importActual<typeof import("fs/promises")>("fs/promises");
    vi.mocked(copyFile).mockReset().mockImplementation(filesystem.copyFile);
    vi.mocked(rename).mockReset().mockImplementation(filesystem.rename);
    vi.mocked(unlink).mockReset().mockImplementation(filesystem.unlink);
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-files-store-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  async function load() {
    return import("./file-store");
  }

  function fixture(body = "managed-copy") {
    const source = join(mockState.hermesHome, "doc.txt");
    writeFileSync(source, body);
    const hash = createHash("sha256").update(body).digest("hex");
    const target = join(
      mockState.hermesHome,
      "desktop",
      "files",
      "objects",
      hash.slice(0, 2),
      hash,
    );
    return { source, hash, target, directory: dirname(target), body };
  }

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((complete) => {
      resolve = complete;
    });
    return { promise, resolve };
  }

  function filesystemError(code: string) {
    return Object.assign(new Error(`Private source ${mockState.hermesHome}`), {
      code,
    });
  }

  it("creates the managed files layout under profileHome", async () => {
    const storage = await load();
    const layout = storage.ensureFilesLayout("default");
    expect(layout.root).toBe(join(mockState.hermesHome, "desktop", "files"));
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

    // Reuse requires no access to the original source and normalizes the hash.
    rmSync(source);
    const again = await storage.storeManagedCopy(source, hash.toUpperCase());
    expect(again).toBe(managed);
  });

  it("keeps the final object unpublished while asynchronous copying yields the event loop", async () => {
    const storage = await load();
    const { source, hash, target, directory, body } = fixture();
    const copyStarted = deferred();
    const finishCopy = deferred();
    vi.mocked(copyFile).mockImplementationOnce(async (from, temporary) => {
      await filesystem.writeFile(temporary, "partial");
      copyStarted.resolve();
      await finishCopy.promise;
      await filesystem.copyFile(from, temporary);
    });

    let settled = false;
    const operation = storage.storeManagedCopy(source, hash).then((managed) => {
      settled = true;
      return managed;
    });
    await copyStarted.promise;
    let managed: string;
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(settled).toBe(false);
      expect(existsSync(target)).toBe(false);
      const temporaryNames = readdirSync(directory);
      expect(temporaryNames).toHaveLength(1);
      expect(temporaryNames[0]).toMatch(/^\.[a-f0-9]{64}-.+\.tmp$/);
      expect(readFileSync(join(directory, temporaryNames[0]), "utf-8")).toBe(
        "partial",
      );
    } finally {
      finishCopy.resolve();
      managed = await operation;
    }
    expect(managed).toBe(target);
    expect(readFileSync(target, "utf-8")).toBe(body);
    expect(readdirSync(directory)).toEqual([hash]);
  });

  it("publishes one complete object when real filesystem copies run concurrently", async () => {
    const storage = await load();
    const { source, hash, target, directory, body } = fixture(
      "parallel-content".repeat(4096),
    );
    const results = await Promise.all(
      Array.from({ length: 8 }, () => storage.storeManagedCopy(source, hash)),
    );
    expect(results).toEqual(Array(8).fill(target));
    expect(readFileSync(target, "utf-8")).toBe(body);
    expect(readdirSync(directory)).toEqual([hash]);
  });

  it("cleans its partial temporary file and keeps storage errors private when copying fails", async () => {
    const storage = await load();
    const { source, hash, target, directory } = fixture();
    vi.mocked(copyFile).mockImplementationOnce(async (_from, temporary) => {
      await filesystem.writeFile(temporary, "partial");
      throw filesystemError("EIO");
    });
    const error = await storage
      .storeManagedCopy(source, hash)
      .catch((failure) => failure);
    expect(error.fileError).toMatchObject({
      code: "FILE_STORAGE_FAILED",
      detail: "EIO",
    });
    expect(`${error.message} ${JSON.stringify(error.fileError)}`).not.toContain(
      mockState.hermesHome,
    );
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("cleans its complete temporary file when publication fails", async () => {
    const storage = await load();
    const { source, hash, target, directory } = fixture();
    vi.mocked(rename).mockRejectedValueOnce(filesystemError("EACCES"));
    await expect(storage.storeManagedCopy(source, hash)).rejects.toMatchObject({
      fileError: { code: "FILE_STORAGE_FAILED", detail: "EACCES" },
    });
    expect(existsSync(target)).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("reuses a verified complete object when another publication wins the race", async () => {
    const storage = await load();
    const { source, hash, target, directory, body } = fixture();
    vi.mocked(rename).mockImplementationOnce(async () => {
      await filesystem.copyFile(source, target);
      throw filesystemError("EEXIST");
    });
    expect(await storage.storeManagedCopy(source, hash)).toBe(target);
    expect(readFileSync(target, "utf-8")).toBe(body);
    expect(readdirSync(directory)).toEqual([hash]);
  });

  it("does not reuse or remove another writer's incomplete final object after a publication race", async () => {
    const storage = await load();
    const { source, hash, target, directory } = fixture();
    vi.mocked(rename).mockImplementationOnce(async () => {
      await filesystem.writeFile(target, "partial");
      throw filesystemError("EEXIST");
    });
    await expect(storage.storeManagedCopy(source, hash)).rejects.toMatchObject({
      fileError: { code: "FILE_STORAGE_FAILED", detail: "EEXIST" },
    });
    expect(readFileSync(target, "utf-8")).toBe("partial");
    expect(readdirSync(directory)).toEqual([hash]);
  });

  it("rejects a non-file target without replacing it", async () => {
    const storage = await load();
    const { source, hash, target, directory } = fixture();
    mkdirSync(target, { recursive: true });
    await expect(storage.storeManagedCopy(source, hash)).rejects.toMatchObject({
      fileError: { code: "FILE_STORAGE_FAILED" },
    });
    expect(readdirSync(target)).toEqual([]);
    expect(readdirSync(directory)).toEqual([hash]);
  });

  it("rejects invalid content hashes before creating storage objects", async () => {
    const storage = await load();
    const { source } = fixture();
    await expect(
      storage.storeManagedCopy(source, "../invalid"),
    ).rejects.toMatchObject({
      fileError: { code: "FILE_STORAGE_FAILED" },
    });
    expect(existsSync(join(mockState.hermesHome, "desktop", "files"))).toBe(
      false,
    );
  });

  it("stageClipboardBytes writes via attachment staging", async () => {
    const storage = await load();
    const bytes = Buffer.from("paste-bytes").toString("base64");
    const staged = storage.stageClipboardBytes("sess-1", "note.txt", bytes);
    expect(existsSync(staged)).toBe(true);
    expect(readFileSync(staged, "utf-8")).toBe("paste-bytes");
  });
});
