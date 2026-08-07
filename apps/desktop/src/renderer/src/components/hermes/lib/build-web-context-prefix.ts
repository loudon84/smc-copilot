import type { HermesPanelPageContext } from "../types";

const MAX_PREFIX_CHARS = 12_000;

export function buildWebContextPrefix(ctx: HermesPanelPageContext | null | undefined): string {
  if (!ctx) return "";
  const summary = ctx.summary ?? "";
  let dataStr = "";
  try {
    dataStr = JSON.stringify(ctx.payload);
  } catch {
    dataStr = String(ctx.payload);
  }
  const clipped =
    dataStr.length > MAX_PREFIX_CHARS
      ? `${dataStr.slice(0, MAX_PREFIX_CHARS)}\n…（已截断）`
      : dataStr;
  return `[上下文类型: ${ctx.type}]\n摘要: ${summary}\n数据:\n${clipped}\n\n`;
}
