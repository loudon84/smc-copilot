import { existsSync, readdirSync } from "fs";
import { join } from "path";

export function findSkillRunConsumerLockDir(): string | null {
  const contractsRoot = join(process.cwd(), "../../contracts/skill-run");
  if (!existsSync(contractsRoot)) {
    return null;
  }

  try {
    const entries = readdirSync(contractsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const lockFile = join(contractsRoot, entry.name, "consumer-lock.json");
        const sumsFile = join(contractsRoot, entry.name, "SHA256SUMS");
        if (existsSync(lockFile) && existsSync(sumsFile)) {
          return join(contractsRoot, entry.name);
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function hasSkillRunConsumerLock(): boolean {
  return findSkillRunConsumerLockDir() !== null;
}
