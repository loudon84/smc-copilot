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
  }),
  officePlugin(),
];

/**
 * Sole open-file-viewer boundary for FilePreview Framework.
 */
export function OpenFileViewerAdapter({
  file,
  fileName,
}: OpenFileViewerAdapterProps): ReactElement {
  return (
    <div
      className="h-full min-h-[240px] w-full"
      data-testid="file-preview-ofv-host"
    >
      <FileViewer
        file={file}
        fileName={fileName}
        plugins={PREVIEW_PLUGINS}
      />
    </div>
  );
}
