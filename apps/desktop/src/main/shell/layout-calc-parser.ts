/**
 * Safe calc() expression parser for layout bounds.
 * Supports only + and - with px and % units (no multiply/divide).
 */
export function evaluateLayoutCalc(
  expression: string,
  baseSize: number,
): number {
  const normalized = expression
    .replace(/(\d+(?:\.\d+)?)%/g, (_match, percent: string) => {
      return String((baseSize * parseFloat(percent)) / 100);
    })
    .replace(/(\d+(?:\.\d+)?)px/g, "$1")
    .replace(/\s+/g, "");

  const tokens = normalized.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!tokens) {
    return 0;
  }

  const result = tokens.reduce((sum, token) => sum + Number(token), 0);
  return Math.max(0, Math.floor(result));
}
