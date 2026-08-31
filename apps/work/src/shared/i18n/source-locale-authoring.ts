export const SOURCE_LOCALE_ID = "en";

const LOCALES_RE = /(?:^|\/)src\/shared\/i18n\/locales\/([^/]+)\//;

export function localeIdFromPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, "/");
  const match = normalized.match(LOCALES_RE);
  return match ? match[1] : null;
}

// @lat: [[i18n#Simultaneous-creation guard]]
export function classifyLocalePackageChanges(filePaths: string[]): {
  sourceFiles: string[];
  otherFiles: string[];
} {
  const sourceFiles: string[] = [];
  const otherFiles: string[] = [];
  for (const filePath of filePaths) {
    const locale = localeIdFromPath(filePath);
    if (!locale) continue;
    if (locale === SOURCE_LOCALE_ID) sourceFiles.push(filePath);
    else otherFiles.push(filePath);
  }
  return { sourceFiles, otherFiles };
}

export function simultaneousLocaleCreationMessage(classified: {
  sourceFiles: string[];
  otherFiles: string[];
}): string | null {
  if (classified.sourceFiles.length === 0 || classified.otherFiles.length === 0) {
    return null;
  }
  return [
    "i18n source-locale-only: feature changes may edit locales/en only.",
    "Non-English locale packages must be translated later by an administrator.",
    `English: ${classified.sourceFiles.join(", ")}`,
    `Other: ${classified.otherFiles.join(", ")}`,
  ].join("\n");
}
