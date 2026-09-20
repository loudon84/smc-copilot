// @vitest-environment node
/**
 * Content Readability Gate integration: zero mutation before hash.
 */
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  hashCalls: 0,
  upsertCalls: 0,
  storeCalls: 0,
  assocCalls: 0,
  validateCalls: 0,
}));

vi.mock("../runtime/hermes-runtime-paths", () => ({
  get HERMES_HOME() {
    return mockState.hermesHome;
  },
  getHermesHome: () => mockState.hermesHome,
}));

vi.mock("electron", () => ({
  app: {
    getPath: () => mockState.hermesHome,
    setPath: () => undefined,
  },
}));

vi.mock("./file-config", async () => {
  const actual = await vi.importActual<typeof import("./file-config")>(
    "./file-config",
  );
  return {
    ...actual,
    readDesktopFilesConfig: (profile?: string) => ({
      ...actual.readDesktopFilesConfig(profile),
      managedStorage: true,
      copyPickerFiles: true,
    }),
  };
});

vi.mock("./file-metadata", async () => {
  const actual = await vi.importActual<typeof import("./file-metadata")>(
    "./file-metadata",
  );
  return {
    ...actual,
    hashOrError: async (path: string) => {
      mockState.hashCalls += 1;
      return actual.hashOrError(path);
    },
  };
});

vi.mock("./file-store", async () => {
  const actual = await vi.importActual<typeof import("./file-store")>(
    "./file-store",
  );
  return {
    ...actual,
    storeManagedCopy: async (...args: Parameters<typeof actual.storeManagedCopy>) => {
      mockState.storeCalls += 1;
      return actual.storeManagedCopy(...args);
    },
  };
});

vi.mock("./file-association-store", async () => {
  const actual = await vi.importActual<
    typeof import("./file-association-store")
  >("./file-association-store");
  return {
    ...actual,
    upsertManagedFile: (...args: Parameters<typeof actual.upsertManagedFile>) => {
      mockState.upsertCalls += 1;
      return actual.upsertManagedFile(...args);
    },
    insertAssociation: (...args: Parameters<typeof actual.insertAssociation>) => {
      mockState.assocCalls += 1;
      return actual.insertAssociation(...args);
    },
  };
});

vi.mock("./protected-file-detector", async () => {
  const actual = await vi.importActual<
    typeof import("./protected-file-detector")
  >("./protected-file-detector");
  return {
    ...actual,
    validateFileContent: async (
      ...args: Parameters<typeof actual.validateFileContent>
    ) => {
      mockState.validateCalls += 1;
      return actual.validateFileContent(...args);
    },
  };
});

vi.mock("./jobs/parse-file-job", () => ({
  scheduleParseJob: () => undefined,
}));

describe("importOnePath content gate", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-pfc-import-"));
    mockState.hashCalls = 0;
    mockState.upsertCalls = 0;
    mockState.storeCalls = 0;
    mockState.assocCalls = 0;
    mockState.validateCalls = 0;
    vi.resetModules();
  });

  afterEach(async () => {
    try {
      const store = await import("./file-association-store");
      store.closeFileIndexDb();
      for (const id of ["default", "sess-1"]) {
        try {
          store.closeFileIndexDb(id);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
    try {
      rmSync(mockState.hermesHome, { recursive: true, force: true });
    } catch {
      // Windows may briefly lock; ignore cleanup failures in tests.
    }
  });

  function sample(name: string, data: Buffer | string): string {
    const p = join(mockState.hermesHome, name);
    writeFileSync(p, data);
    return p;
  }

  it("blocks invalid pdf before hash/mutation (A-PFC-002)", async () => {
    const { importOnePath } = await import("./file-import-service");
    const path = sample("encrypted.pdf", Buffer.alloc(32, 0x11));
    const result = await importOnePath(path, {
      sessionId: "sess-1",
      source: "picker",
      mode: "local",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FILE_CONTENT_ENCRYPTED_OR_INVALID");
      expect(result.error.message).not.toMatch(/confirmed Eisoo/i);
    }
    expect(mockState.hashCalls).toBe(0);
    expect(mockState.storeCalls).toBe(0);
    expect(mockState.upsertCalls).toBe(0);
    expect(mockState.assocCalls).toBe(0);
  });

  it("allows valid pdf through gate then hashes (A-PFC-001)", async () => {
    const { importOnePath } = await import("./file-import-service");
    const path = sample("ok.pdf", Buffer.from("%PDF-1.7\n%EOF\n"));
    const result = await importOnePath(path, {
      sessionId: "sess-1",
      source: "picker",
      mode: "local",
    });
    expect(result.ok).toBe(true);
    expect(mockState.hashCalls).toBe(1);
    expect(mockState.upsertCalls).toBe(1);
  });

  it("skips gate when path policy rejects (A-PFC-011)", async () => {
    const { importOnePath } = await import("./file-import-service");
    const result = await importOnePath("\0bad", {
      sessionId: "sess-1",
      source: "picker",
      mode: "local",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).not.toBe("FILE_CONTENT_ENCRYPTED_OR_INVALID");
    }
    expect(mockState.validateCalls).toBe(0);
    expect(mockState.hashCalls).toBe(0);
  });

  it("does not log secret marker from content (A-PFC-010)", async () => {
    const marker = "SMC_SECRET_CONTENT_MARKER_20260920";
    const { importOnePath } = await import("./file-import-service");
    const path = sample(
      "marked.pdf",
      Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from(marker)]),
    );
    const lines: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    await importOnePath(path, {
      sessionId: "sess-1",
      source: "picker",
      mode: "local",
    });
    spy.mockRestore();
    const joined = lines.join("\n");
    expect(joined).toContain("CONTENT_CHECK");
    expect(joined).not.toContain(marker);
  });
});
