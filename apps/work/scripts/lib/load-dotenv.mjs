import { existsSync, readFileSync } from "node:fs";

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function loadDotEnvFile(path, target = process.env) {
  if (!existsSync(path)) {
    return { loaded: false, keys: [] };
  }

  const text = readFileSync(path, "utf8");
  const keys = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(rawLine);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (target[key]) continue;

    target[key] = stripWrappingQuotes(rawValue.trim());
    keys.push(key);
  }

  return { loaded: true, keys };
}
