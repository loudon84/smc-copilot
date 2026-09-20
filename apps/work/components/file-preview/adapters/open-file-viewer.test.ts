import { describe, expect, it, vi } from "vitest";

const textPlugin = vi.fn(() => ({ name: "text" }));
const imagePlugin = vi.fn(() => ({ name: "image" }));
const pdfPlugin = vi.fn(() => ({ name: "pdf" }));
const officePlugin = vi.fn(() => ({ name: "office" }));
const FileViewer = vi.fn(() => null);

vi.mock("@open-file-viewer/core", () => ({
  textPlugin,
  imagePlugin,
  pdfPlugin,
  officePlugin,
}));
vi.mock("@open-file-viewer/core/style.css", () => ({}));
vi.mock("@open-file-viewer/react", () => ({
  FileViewer,
}));
vi.mock("pdfjs-dist/build/pdf.worker.mjs?url", () => ({
  default: "/mock-pdf.worker.mjs",
}));
vi.mock("pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url", () => ({
  default: "/mock-standard_fonts/LiberationSans-Regular.ttf",
}));
vi.mock("pdfjs-dist/cmaps/Adobe-GB1-UCS2.bcmap?url", () => ({
  default: "/mock-cmaps/Adobe-GB1-UCS2.bcmap",
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
        standardFontDataUrl: "/mock-standard_fonts/",
        cMapUrl: "/mock-cmaps/",
        cMapPacked: true,
      }),
    );
    expect(officePlugin).toHaveBeenCalled();
  });

  it("passes width/height 100% so Hybrid pane fills instead of OFV default px", async () => {
    const React = await import("react");
    const { createElement } = React;
    const { OpenFileViewerAdapter } = await import("./open-file-viewer");
    FileViewer.mockClear();
    createElement(OpenFileViewerAdapter, {
      file: new File([""], "a.pdf", { type: "application/pdf" }),
      fileName: "a.pdf",
    });
    // Adapter is a component — render via React to invoke FileViewer
    const { render } = await import("@testing-library/react");
    render(
      createElement(OpenFileViewerAdapter, {
        file: new File([""], "a.pdf", { type: "application/pdf" }),
        fileName: "a.pdf",
      }),
    );
    expect(FileViewer).toHaveBeenCalledWith(
      expect.objectContaining({
        width: "100%",
        height: "100%",
      }),
      undefined,
    );
  });
});
