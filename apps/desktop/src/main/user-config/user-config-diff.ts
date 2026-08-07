import type {
  ConfigDiffItem,
  DesktopBootstrapConfig,
} from "../../shared/user-config/user-config-contract";

const SENSITIVE_KEYWORDS = [
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "apiKeyRef",
  "password",
  "secret",
  "privateKey",
  "credential",
];

function isSensitivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SENSITIVE_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

function maskValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > 0 ? "••••••••" : "";
  return "[masked]";
}

function flatten(
  obj: unknown,
  prefix = "",
  out: Record<string, unknown> = {},
): Record<string, unknown> {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object" || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      flatten(val, path, out);
    } else {
      out[path] = val;
    }
  }
  return out;
}

export function diffBootstrapConfig(
  local: DesktopBootstrapConfig | null,
  remote: DesktopBootstrapConfig,
): ConfigDiffItem[] {
  const localFlat = flatten(local ?? {});
  const remoteFlat = flatten(remote);
  const keys = new Set([...Object.keys(localFlat), ...Object.keys(remoteFlat)]);
  const items: ConfigDiffItem[] = [];

  for (const path of keys) {
    const hasLocal = Object.prototype.hasOwnProperty.call(localFlat, path);
    const hasRemote = Object.prototype.hasOwnProperty.call(remoteFlat, path);
    const sensitive = isSensitivePath(path);

    if (!hasLocal && hasRemote) {
      items.push({
        path,
        type: "added",
        localValue: undefined,
        remoteValue: sensitive ? maskValue(remoteFlat[path]) : remoteFlat[path],
        sensitive,
      });
    } else if (hasLocal && !hasRemote) {
      items.push({
        path,
        type: "removed",
        localValue: sensitive ? maskValue(localFlat[path]) : localFlat[path],
        remoteValue: undefined,
        sensitive,
      });
    } else if (JSON.stringify(localFlat[path]) !== JSON.stringify(remoteFlat[path])) {
      items.push({
        path,
        type: "changed",
        localValue: sensitive ? maskValue(localFlat[path]) : localFlat[path],
        remoteValue: sensitive ? maskValue(remoteFlat[path]) : remoteFlat[path],
        sensitive,
      });
    }
  }

  return items.sort((a, b) => a.path.localeCompare(b.path));
}
