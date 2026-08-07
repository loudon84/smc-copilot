/**
 * Fallback parser — path/name reference only, no content extraction.
 * Used for denied extensions and unsupported types.
 */

import type { FileParser, FileParserInput } from "../../../../shared/files";
import { baseParsedDoc } from "./text-read";

export const fallbackParser: FileParser = {
  id: "fallback",
  version: 1,
  priority: 0,
  supports(_input: FileParserInput): boolean {
    return true;
  },
  async parse(input, _signal) {
    const text = `[File reference] ${input.name} (${input.size} bytes, ${input.mime || "unknown"})`;
    return baseParsedDoc({
      fileId: input.fileId,
      parserId: this.id,
      parserVersion: this.version,
      text,
      truncated: false,
      title: input.name,
      metadata: {
        category: "reference",
        reason: "fallback-no-content",
        extension: input.extension || "",
        size: input.size,
      },
      sections: [{ id: "ref", title: input.name, text }],
    });
  },
};
