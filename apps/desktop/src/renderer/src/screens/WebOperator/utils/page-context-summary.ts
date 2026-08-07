import type { HermesPanelPageContext } from "../../../components/hermes";

const MAX_SUMMARY_CHARS = 100;

export function buildPageContextSummary(ctx: HermesPanelPageContext): string {
  const title = ctx.payload.title?.trim() || "（无标题）";
  const url = ctx.payload.url?.trim() || ctx.summary;
  const raw = ctx.summary || `${title} · ${url}`;
  if (raw.length <= MAX_SUMMARY_CHARS) return raw;
  return `${raw.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}
