// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({ hermesHome: "" }));

vi.mock("../installer", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
}));

describe("file-security", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-files-sec-"));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  async function load() {
    return import("./file-security");
  }

  it("rejects denied extensions", async () => {
    const sec = await load();
    expect(sec.isDeniedExtension("payload.exe")).toBe(true);
    expect(sec.isDeniedExtension("script.PS1")).toBe(true);
    expect(sec.isDeniedExtension("notes.md")).toBe(false);
    expect(sec.extensionFromName("archive.tar.gz")).toBe("gz");
  });

  it("assertImportAllowed blocks denied types and oversized files", async () => {
    const sec = await load();
    const { DEFAULT_DESKTOP_FILES_CONFIG } = await import(
      "../../shared/files"
    );
    const denied = sec.assertImportAllowed(
      "evil.bat",
      10,
      DEFAULT_DESKTOP_FILES_CONFIG,
    );
    expect(denied?.code).toBe("FILE_TYPE_DENIED");

    const tooBig = sec.assertImportAllowed(
      "huge.txt",
      (DEFAULT_DESKTOP_FILES_CONFIG.maxImportMb + 1) * 1024 * 1024,
      DEFAULT_DESKTOP_FILES_CONFIG,
    );
    expect(tooBig?.code).toBe("FILE_TOO_LARGE");

    expect(
      sec.assertImportAllowed("ok.txt", 12, DEFAULT_DESKTOP_FILES_CONFIG),
    ).toBeNull();
  });

  it("blocks path traversal outside managed root", async () => {
    const sec = await load();
    const root = join(mockState.hermesHome, "desktop", "files");
    mkdirSync(root, { recursive: true });
    const outside = join(mockState.hermesHome, "outside.txt");
    writeFileSync(outside, "x");

    expect(() =>
      sec.assertPathAllowed(outside, {
        allowOutsideManaged: false,
        managedRoot: root,
      }),
    ).toThrow(/outside/i);

    // Allowed when explicitly permitting outside paths (picker import).
    expect(() =>
      sec.assertPathAllowed(outside, { allowOutsideManaged: true }),
    ).not.toThrow();
  });

  it("canonicalizes symlinks that escape the managed root", async () => {
    const sec = await load();
    const root = join(mockState.hermesHome, "managed");
    mkdirSync(root, { recursive: true });
    const secret = join(mockState.hermesHome, "secret.txt");
    writeFileSync(secret, "secret");
    const link = join(root, "escape-link");
    try {
      symlinkSync(secret, link);
    } catch {
      // Symlinks may require elevation on Windows — skip.
      return;
    }
    expect(() =>
      sec.assertPathAllowed(link, {
        allowOutsideManaged: false,
        managedRoot: root,
      }),
    ).toThrow();
  });

  it("detects magic kinds", async () => {
    const sec = await load();
    expect(sec.detectMagicKind(Buffer.from("%PDF-1.7"))).toBe("pdf");
    expect(
      sec.detectMagicKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    ).toBe("image");
    expect(sec.detectMagicKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image",
    );
    expect(sec.detectMagicKind(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(
      "zip",
    );
    expect(sec.detectMagicKind(Buffer.from("hello world\nplain text"))).toBe(
      "text",
    );
  });
});
