/**
 * Image parser — metadata only (no OCR in Phase 4).
 */

import type { FileParser, FileParserInput } from "../../../shared/files";
import { baseParsedDoc } from "./text-read";

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"]);

export const imageParser: FileParser = {
  id: "image",
  version: 1,
  priority: 50,
  supports(input: FileParserInput): boolean {
    const ext = (input.extension || "").toLowerCase();
    if (IMAGE_EXT.has(ext)) return true;
    return (input.mime || "").toLowerCase().startsWith("image/");
  },
  async parse(input, _signal) {
    const text = `[Image] ${input.name} — OCR not enabled (${input.mime || "image"}, ${input.size} bytes)`;
    return baseParsedDoc({
      fileId: input.fileId,
      parserId: this.id,
      parserVersion: this.version,
      text,
      truncated: false,
      title: input.name,
      metadata: {
        category: "image",
        mime: input.mime || "",
        size: input.size,
        ocr: false,
      },
      sections: [],
    });
  },
};
