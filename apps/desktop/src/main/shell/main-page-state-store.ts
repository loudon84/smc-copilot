import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { MainPagePersistedState } from "../../shared/shell/main-page-state-contract";
import { migrateMainPageState } from "./main-page-state-migrate";
import { profileHome } from "../utils";

/** Persists under ~/.hermes/desktop/ (aligned with other desktop shell state). */
function getStatePath(): string {
  const dir = join(profileHome(), "desktop");
  mkdirSync(dir, { recursive: true });
  return join(dir, "main-page-state.json");
}

export function readMainPageState(): MainPagePersistedState {
  try {
    const raw = JSON.parse(readFileSync(getStatePath(), "utf-8")) as unknown;
    return migrateMainPageState(raw);
  } catch {
    return migrateMainPageState(null);
  }
}

export function writeMainPageState(state: MainPagePersistedState): void {
  if (state.version !== 2) {
    throw new Error("Invalid main page state: version must be 2");
  }
  writeFileSync(getStatePath(), JSON.stringify(state, null, 2), "utf-8");
}
