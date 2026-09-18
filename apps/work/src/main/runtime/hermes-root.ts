/**
 * Hermes Root vs Active Profile Home (PRD A-PROFILE-001..003, A-STATE-002).
 *
 * - **Hermes Root** (`getHermesRoot`): constant Native home, typically
 *   `%LOCALAPPDATA%\hermes`. Used for checkout (`hermes-agent`), default
 *   profile state, and Work-level path resolution. MUST NOT be rewritten to
 *   `profiles\<name>` when switching profiles.
 * - **Active Profile Home** (`getActiveProfileHome`): Root for default;
 *   `Root\profiles\<name>` for named. Child-process `HERMES_HOME` for CLI
 *   may equal Active Profile Home; the Work-side Root binding stays Root.
 * - **Plugin root** (`getHermesPluginRoot`): under Active Profile Home
 *   (`…/plugins`), which remains Root-relative.
 */
import { join } from "path";
import { getHermesHome } from "./hermes-runtime-paths";
import { profileHome } from "../utils";

/**
 * Constant Hermes Root. Same as `getHermesHome()` / the live `HERMES_HOME`
 * binding when no profile-specific path override is in play.
 *
 * Do not use this as the child-process env Home for a named profile —
 * use {@link getActiveProfileHome} instead.
 */
export function getHermesRoot(): string {
  return getHermesHome();
}

/**
 * Active Profile Home under Hermes Root.
 * Default / omitted → Root; named → `Root\profiles\<name>`.
 */
export function getActiveProfileHome(profile?: unknown): string {
  return profileHome(profile);
}

/**
 * Native plugin directory for a profile: `<Active Profile Home>\plugins`.
 * Always Root-relative via {@link getActiveProfileHome}.
 */
export function getHermesPluginRoot(profile?: unknown): string {
  return join(getActiveProfileHome(profile), "plugins");
}
