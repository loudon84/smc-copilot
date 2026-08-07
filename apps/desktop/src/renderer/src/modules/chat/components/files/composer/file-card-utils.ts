/**
 * Tiny formatting helpers shared by the File UI card components.
 * Kept dependency-free (no i18n) so these components can render
 * standalone in tests without an I18nProvider.
 */

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
