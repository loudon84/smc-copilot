import type { ReactElement } from "react";
import {
  imagePlugin,
  officePlugin,
  pdfPlugin,
  textPlugin,
} from "@open-file-viewer/core";
import { FileViewer } from "@open-file-viewer/react";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import pdfStandardFontSample from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import pdfCmapSample from "pdfjs-dist/cmaps/Adobe-GB1-UCS2.bcmap?url";

function assetDirectoryUrl(fileUrl: string, fileName: string): string {
  const idx = fileUrl.lastIndexOf(fileName);
  if (idx < 0) {
    const slash = fileUrl.lastIndexOf("/");
    return slash >= 0 ? fileUrl.slice(0, slash + 1) : fileUrl;
  }
  return fileUrl.slice(0, idx);
}

const PDF_STANDARD_FONT_DATA_URL = assetDirectoryUrl(
  pdfStandardFontSample,
  "LiberationSans-Regular.ttf",
);
const PDF_CMAP_URL = assetDirectoryUrl(pdfCmapSample, "Adobe-GB1-UCS2.bcmap");

export type OpenFileViewerAdapterProps = {
  file: File;
  fileName: string;
};

/** FP-001 plugins: text (md/txt/code/json/html), image, pdf, office (docx SHOULD). */
const PREVIEW_PLUGINS = [
  textPlugin(),
  imagePlugin(),
  pdfPlugin({
    workerSrc: pdfWorkerSrc,
    // Avoid worker network stream issues in Electron / some bundlers.
    useFetchData: true,
    // Local assets only — CSP font-src/connect-src block jsDelivr CDN.
    standardFontDataUrl: PDF_STANDARD_FONT_DATA_URL,
    cMapUrl: PDF_CMAP_URL,
    cMapPacked: true,
  }),
  officePlugin(),
];

/**
 * Sole open-file-viewer boundary for FilePreview Framework.
 * Host is flex-filled (`h-full`); FileViewer must receive height/width or it
 * paints a fixed inline height on `.ofv-root` and ignores the Hybrid pane.
 */
export function OpenFileViewerAdapter({
  file,
  fileName,
}: OpenFileViewerAdapterProps): ReactElement {
  return (
    <div
      className="file-preview-ofv-host h-full min-h-0 w-full"
      data-testid="file-preview-ofv-host"
    >
      <FileViewer
        file={file}
        fileName={fileName}
        plugins={PREVIEW_PLUGINS}
        width="100%"
        height="100%"
      />
    </div>
  );
}
