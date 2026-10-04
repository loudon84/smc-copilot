import { describe, expect, it, vi } from "vitest";

vi.mock("../files/file-association-store", () => ({
  normalizeProfileId: () => "default",
  getManagedFile: () => null,
}));

vi.mock("../files/materialize-remote-expert-artifact", () => ({
  materializeRemoteExpertArtifact: vi.fn(),
}));

vi.mock("../auth/authorized-backend-transport", () => ({
  createAuthorizedBackendTransport: () => ({
    withAuthRetry: async () => {
      throw new Error("upload should not run");
    },
  }),
  AuthorizedBackendTransportError: class extends Error {},
}));

describe("remote attachment bridge", () => {
  it("does not upload when a managed file is missing", async () => {
    const { prepareAttachmentResourceLinks } = await import("./remote-attachment-bridge");
    await expect(
      prepareAttachmentResourceLinks({ profileId: "default", fileIds: ["missing"] }),
    ).rejects.toThrow(/managed file missing/);
  });
});
