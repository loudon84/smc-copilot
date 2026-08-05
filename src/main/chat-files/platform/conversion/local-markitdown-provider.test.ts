/**
 * Unit tests for LocalMarkItDownProvider (mocked spawn).
 */

import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  LocalMarkItDownProvider,
  resetMarkItDownAvailabilityCache,
} from "./local-markitdown-provider";

function mockChild(opts: {
  stdout?: string;
  stderr?: string;
  code?: number;
  delayMs?: number;
  emitError?: Error;
}): EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
  killed: boolean;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
    killed: boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });

  const delay = opts.delayMs ?? 5;
  setTimeout(() => {
    if (opts.emitError) {
      child.emit("error", opts.emitError);
      return;
    }
    if (opts.stdout) child.stdout.emit("data", Buffer.from(opts.stdout));
    if (opts.stderr) child.stderr.emit("data", Buffer.from(opts.stderr));
    child.emit("close", opts.code ?? 0);
  }, delay);

  return child;
}

describe("LocalMarkItDownProvider", () => {
  let dir: string;

  afterEach(() => {
    resetMarkItDownAvailabilityCache();
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  // @lat: [[file-platform#MarkItDown conversion]]
  it("converts via spawn and returns markdown stdout", async () => {
    dir = mkdtempSync(join(tmpdir(), "md-"));
    const filePath = join(dir, "doc.pdf");
    writeFileSync(filePath, "%PDF-1.4");

    const spawnFn = vi.fn(() =>
      mockChild({ stdout: "# Hello\n\nConverted body\n", code: 0 }),
    ) as unknown as typeof import("child_process").spawn;

    const provider = new LocalMarkItDownProvider({
      bin: "markitdown",
      spawnFn,
      timeoutMs: 5000,
    });
    const result = await provider.convert({
      path: filePath,
      mime: "application/pdf",
    });
    expect(result.markdown).toContain("Converted body");
    expect(spawnFn).toHaveBeenCalledWith(
      "markitdown",
      [filePath],
      expect.objectContaining({ shell: false }),
    );
  });

  it("rejects non-zero exit codes", async () => {
    dir = mkdtempSync(join(tmpdir(), "md-"));
    const filePath = join(dir, "doc.pdf");
    writeFileSync(filePath, "%PDF");

    const spawnFn = vi.fn(() =>
      mockChild({ stderr: "boom", code: 2 }),
    ) as unknown as typeof import("child_process").spawn;

    const provider = new LocalMarkItDownProvider({
      bin: "markitdown",
      spawnFn,
    });
    await expect(
      provider.convert({ path: filePath, mime: "application/pdf" }),
    ).rejects.toMatchObject({
      fileError: { code: "FILE_PARSE_FAILED" },
    });
  });

  it("times out and kills the child", async () => {
    dir = mkdtempSync(join(tmpdir(), "md-"));
    const filePath = join(dir, "doc.pdf");
    writeFileSync(filePath, "%PDF");

    const spawnFn = vi.fn(() =>
      mockChild({ stdout: "never", code: 0, delayMs: 5000 }),
    ) as unknown as typeof import("child_process").spawn;

    const provider = new LocalMarkItDownProvider({
      bin: "markitdown",
      spawnFn,
      timeoutMs: 30,
    });
    await expect(
      provider.convert({ path: filePath, mime: "application/pdf" }),
    ).rejects.toMatchObject({
      fileError: { code: "FILE_PARSE_FAILED" },
    });
  });

  it("aborts when signal is aborted", async () => {
    dir = mkdtempSync(join(tmpdir(), "md-"));
    const filePath = join(dir, "doc.pdf");
    writeFileSync(filePath, "%PDF");

    const spawnFn = vi.fn(() =>
      mockChild({ stdout: "slow", code: 0, delayMs: 5000 }),
    ) as unknown as typeof import("child_process").spawn;

    const provider = new LocalMarkItDownProvider({
      bin: "markitdown",
      spawnFn,
      timeoutMs: 10_000,
    });
    const controller = new AbortController();
    const pending = provider.convert({
      path: filePath,
      mime: "application/pdf",
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("surfaces FILE_NOT_IMPLEMENTED when the binary is missing", async () => {
    dir = mkdtempSync(join(tmpdir(), "md-"));
    const filePath = join(dir, "doc.pdf");
    writeFileSync(filePath, "%PDF");

    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    const spawnFn = vi.fn(() =>
      mockChild({ emitError: err }),
    ) as unknown as typeof import("child_process").spawn;

    const provider = new LocalMarkItDownProvider({
      bin: "markitdown-missing-binary",
      spawnFn,
    });
    await expect(
      provider.convert({ path: filePath, mime: "application/pdf" }),
    ).rejects.toMatchObject({
      fileError: { code: "FILE_NOT_IMPLEMENTED" },
    });
  });
});
