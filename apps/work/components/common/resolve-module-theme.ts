import { THEMES, type ThemeAppearance } from "@renderer/constants";

const APPEARANCE = new Map(THEMES.map((theme) => [theme.id, theme.appearance]));

export type ModuleTheme = ThemeAppearance;

export function resolveModuleTheme(workThemeId: string | null | undefined): ModuleTheme {
  if (!workThemeId) return "dark";
  const known = APPEARANCE.get(workThemeId);
  if (known) return known;
  if (workThemeId.endsWith("-light")) return "light";
  return "dark";
}

export function readRootWorkThemeId(
  root: ParentNode | null | undefined = globalThis.document?.documentElement,
): string | null {
  if (!root || !("getAttribute" in root)) return null;
  const value = (root as Element).getAttribute("data-theme");
  return value && value.length > 0 ? value : null;
}
