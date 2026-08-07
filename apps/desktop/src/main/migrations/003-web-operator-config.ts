import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Ensure Web Operator config lives under ~/.hermes/desktop/web-operator (profile-aware layout).
 */
export function migrateWebOperatorConfig(): void {
  const targetDir = join(homedir(), ".hermes", "desktop", "web-operator");
  const targetConfig = join(targetDir, "web-operator.config.json");
  mkdirSync(targetDir, { recursive: true });

  if (existsSync(targetConfig)) return;

  const legacyPaths = [
    join(homedir(), ".hermes", "web-operator.config.json"),
    join(homedir(), ".hermes", "desktop", "web-operator.config.json"),
  ];

  for (const legacyPath of legacyPaths) {
    if (!existsSync(legacyPath)) continue;
    try {
      const raw = readFileSync(legacyPath, "utf-8");
      writeFileSync(targetConfig, raw, "utf-8");
      return;
    } catch {
      /* try next */
    }
  }

  writeFileSync(
    targetConfig,
    JSON.stringify({ enabled: true, requireConfirmation: true }, null, 2),
    "utf-8",
  );
}
