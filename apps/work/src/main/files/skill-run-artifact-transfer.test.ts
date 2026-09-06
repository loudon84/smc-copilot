// @vitest-environment node
import { createHash } from "crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  hermesHome: "",
  authorizedFetch: vi.fn(),
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

vi.mock("../auth/authorized-backend-transport", () => ({
  createAuthorizedBackendTransport: () => ({
    authorizedFetch: mockState.authorizedFetch,
  }),
}));

vi.mock("./file-config", () => ({
  readDesktopFilesConfig: () => ({
    preview: { maxTransferMb: 8 },
  }),
}));

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

describe("streamSkillRunArtifactBytes", () => {
  beforeEach(() => {
    mockState.hermesHome = mkdtempSync(join(tmpdir(), "hermes-skill-xfer-"));
    mockState.authorizedFetch.mockReset();
  });

  afterEach(() => {
    rmSync(mockState.hermesHome, { recursive: true, force: true });
  });

  it("downloads only the Bundle run-scoped path", async () => {
    mockState.authorizedFetch.mockResolvedValue(new Response("hello", { status: 200 }));
    const dest = join(mockState.hermesHome, "out.bin");
    const { streamSkillRunArtifactBytes } = await import(
      "./skill-run-artifact-transfer"
    );
    const result = await streamSkillRunArtifactBytes({
      artifactId: "art-1",
      runId: "run-9",
      destinationPath: dest,
    });
    expect(mockState.authorizedFetch).toHaveBeenCalledWith(
      "/api/v1/runs/run-9/artifacts/art-1/download",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result.path).toBe(dest);
    expect(existsSync(`${dest}.partial`)).toBe(false);
    expect(readFileSync(dest, "utf8")).toBe("hello");
  });

  it("throws when runId is missing and never hits an unscoped download", async () => {
    const { streamSkillRunArtifactBytes } = await import(
      "./skill-run-artifact-transfer"
    );
    await expect(
      streamSkillRunArtifactBytes({ artifactId: "art-1" }),
    ).rejects.toMatchObject({
      name: "FilePlatformError",
      fileError: { code: "FILE_NOT_FOUND" },
    });
    expect(mockState.authorizedFetch).not.toHaveBeenCalled();
    const source = readFileSync(
      join(fileURLToPath(new URL(".", import.meta.url)), "skill-run-artifact-transfer.ts"),
      "utf8",
    );
    expect(source).not.toContain("/api/v1/artifacts/");
  });

  it("fail-closes size cap and checksum mismatch and removes partial files", async () => {
    const dest = join(mockState.hermesHome, "capped.bin");
    const { streamSkillRunArtifactBytes } = await import(
      "./skill-run-artifact-transfer"
    );

    mockState.authorizedFetch.mockResolvedValue(
      new Response("too-large-payload", { status: 200 }),
    );
    await expect(
      streamSkillRunArtifactBytes({
        artifactId: "art-1",
        runId: "run-9",
        destinationPath: dest,
        maxBytes: 4,
      }),
    ).rejects.toMatchObject({
      name: "FilePlatformError",
      fileError: { code: "FILE_TOO_LARGE" },
    });
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.partial`)).toBe(false);

    mockState.authorizedFetch.mockImplementation(
      async () => new Response("hello", { status: 200 }),
    );
    await expect(
      streamSkillRunArtifactBytes({
        artifactId: "art-1",
        runId: "run-9",
        destinationPath: dest,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({
      name: "FilePlatformError",
      fileError: { code: "FILE_INTEGRITY_MISMATCH" },
    });
    expect(existsSync(dest)).toBe(false);
    expect(existsSync(`${dest}.partial`)).toBe(false);

    const okHash = sha256("hello");
    const ok = await streamSkillRunArtifactBytes({
      artifactId: "art-1",
      runId: "run-9",
      destinationPath: dest,
      expectedSha256: okHash,
    });
    expect(ok.hash).toBe(okHash);
    expect(existsSync(dest)).toBe(true);
  });
});
