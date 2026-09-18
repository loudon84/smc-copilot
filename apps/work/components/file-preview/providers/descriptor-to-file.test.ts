import { describe, expect, it, vi, afterEach } from "vitest";
import { fileFromPreviewDescriptor } from "./descriptor-to-file";

describe("fileFromPreviewDescriptor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects file:// localUrl (CSP cannot fetch it)", async () => {
    await expect(
      fileFromPreviewDescriptor(
        {
          title: "a.jpg",
          mime: "image/jpeg",
          localUrl: "file:///C:/ProgramData/SMC/Hermes/desktop/files/objects/ab/abc",
        },
        "a.jpg",
      ),
    ).rejects.toThrow(/PREVIEW_FILE_URL_BLOCKED/);
  });

  it("fetches hermes-file-preview:// into a File", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
    }));
    vi.stubGlobal("fetch", fetchImpl);

    const resolved = await fileFromPreviewDescriptor(
      {
        title: "a.jpg",
        mime: "image/jpeg",
        localUrl: "hermes-file-preview://mf-1",
      },
      "a.jpg",
    );
    expect(resolved.format).toBe("image");
    expect(resolved.fileName).toBe("a.jpg");
    expect(fetchImpl).toHaveBeenCalledWith("hermes-file-preview://mf-1");
  });
});
