const STORAGE_KEY = "weboperator-hermes-panel-session-bindings";

type BindingMap = Record<string, string>;

function readMap(): BindingMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as BindingMap)
      : {};
  } catch {
    return {};
  }
}

function writeMap(map: BindingMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota */
  }
}

export function scopeKeyWebOperatorPage(scopeKey: string): string {
  return `weboperator:${scopeKey}`;
}

export function getPanelSessionBinding(scopeKey: string): string | undefined {
  const id = readMap()[scopeKey];
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

export function setPanelSessionBinding(scopeKey: string, sessionId: string): void {
  const map = readMap();
  map[scopeKey] = sessionId;
  writeMap(map);
}

export function clearPanelSessionBinding(scopeKey: string): void {
  const map = readMap();
  if (!(scopeKey in map)) return;
  delete map[scopeKey];
  writeMap(map);
}
