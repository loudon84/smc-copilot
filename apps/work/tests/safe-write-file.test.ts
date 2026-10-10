import { describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { safeWriteFile } from "../src/main/utils";

const TEST_DIR = join(tmpdir(), `hermes-safe-write-${Date.now()}`);

describe("safeWriteFile", () => {
  it("creates parent directories before writing", () => {
    const filePath = join(TEST_DIR, "nested", "config.yaml");

    safeWriteFile(filePath, "provider: openai\n");

    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, "utf-8")).toBe("provider: openai\n");
  });

  it("replaces an existing file through a same-directory temp file", () => {
    const dir = join(TEST_DIR, "replace");
    const filePath = join(dir, "models.json");
    mkdirSync(dir, { recursive: true });

    safeWriteFile(filePath, "old");
    safeWriteFile(filePath, "new");

    expect(readFileSync(filePath, "utf-8")).toBe("new");
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    );
  });

  it("falls back to overwrite when rename fails with EXDEV", async () => {
    vi.resetModules();
    vi.doMock("fs", async (importOriginal) => {
      const actual = await importOriginal<typeof import("fs")>();
      return {
        ...actual,
        renameSync: () => {
          const err = new Error(
            "cross-device link not permitted",
          ) as NodeJS.ErrnoException;
          err.code = "EXDEV";
          throw err;
        },
      };
    });
    const { safeWriteFile: writeWithExdev } = await import("../src/main/utils");
    const dir = join(TEST_DIR, "exdev");
    const filePath = join(dir, "runtime-provider-adoption.json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, "old", "utf-8");

    writeWithExdev(filePath, '{"provider":"custom","model":"kimi"}');

    expect(readFileSync(filePath, "utf-8")).toBe(
      '{"provider":"custom","model":"kimi"}',
    );
    expect(readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual(
      [],
    );
    vi.doUnmock("fs");
    vi.resetModules();
  });
});
