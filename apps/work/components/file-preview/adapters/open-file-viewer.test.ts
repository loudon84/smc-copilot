import { describe, expect, it, vi } from "vitest";

const textPlugin = vi.fn(() => ({ name: "text" }));
const imagePlugin = vi.fn(() => ({ name: "image" }));
const pdfPlugin = vi.fn(() => ({ name: "pdf" }));
const officePlugin = vi.fn(() => ({ name: "office" }));

vi.mock("@open-file-viewer/core", () => ({
  textPlugin,
  imagePlugin,
  pdfPlugin,
  officePlugin,
}));
vi.mock("@open-file-viewer/core/style.css", () => ({}));
vi.mock("@open-file-viewer/react", () => ({
  FileViewer: () => null,
}));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "/mock-pdf.worker.mjs",
}));

describe("OpenFileViewerAdapter plugins", () => {
  it("registers text, image, pdf, and office plugins", async () => {
    await import("./open-file-viewer");
    expect(textPlugin).toHaveBeenCalled();
    expect(imagePlugin).toHaveBeenCalled();
    expect(pdfPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        workerSrc: "/mock-pdf.worker.mjs",
        useFetchData: true,
      }),
    );
    expect(officePlugin).toHaveBeenCalled();
  });
});
