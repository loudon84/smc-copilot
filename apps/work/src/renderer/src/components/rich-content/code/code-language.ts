// Box Drawing (U+2500–U+257F) plus Block Elements (U+2580–U+259F): tree
// connectors like ├──── └──── │ and the shading/progress-bar glyphs █ ░ ▒ ▓.
const BOX_DRAWING_RE = /[\u2500-\u259F]/;

// A block is a "box diagram" (tree output, table borders, progress bars) only
// when box-drawing characters dominate it — at least half of its non-empty
// lines contain one. A single │ in a string literal or comment must NOT
// demote a whole source file to plain text, but a tree diagram (box chars on
// nearly every line) should never go through Prism: it fragments each glyph
// into nested token spans, which Electron renderers with imperfect Unicode
// metrics can visually truncate or misalign.
export function isBoxDiagram(code: string): boolean {
  const lines = code.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return false;
  const boxLines = lines.filter((line) => BOX_DRAWING_RE.test(line)).length;
  return boxLines * 2 >= lines.length;
}
