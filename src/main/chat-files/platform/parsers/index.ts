/**
 * Built-in File Platform parsers (text / markdown / code / office / pdf / epub / image / fallback).
 */

export { textParser } from "./text-parser";
export { markdownParser } from "./markdown-parser";
export { codeParser, EXTENSION_TO_LANGUAGE } from "./code-parser";
export { officeParser } from "./office-parser";
export { pdfParser } from "./pdf-parser";
export { markitdownParser } from "./markitdown-parser";
export { epubParser } from "./epub-parser";
export { imageParser } from "./image-parser";
export { fallbackParser } from "./fallback-parser";
export { readZipEntries, stripXmlToText } from "./zip-util";
export {
  readTextFileCapped,
  maxParseBytes,
  baseParsedDoc,
} from "./text-read";
