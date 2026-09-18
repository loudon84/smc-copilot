/**
 * Load Work-bundled Hermes release identity for Native Bootstrap (T4).
 * Golden values mirror release/client-release.yaml; runtime prefers
 * resources/hermes-native/release-source.json over full release assemble.
 */
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface HermesReleaseSource {
  schemaVersion: number;
  installUrl: string;
  originUrls: {
    http: string | null;
    https: string | null;
    ssh: string | null;
  };
  allowedHosts: string[];
  defaultBranch: string;
  approvedCommit: string;
  policyVersion: string;
  repositoryIdentity: string;
  compatibility?: {
    minVersion: string;
    testedVersion: string;
  };
  gateway?: {
    host: string;
    port: number;
  };
  bootstrap?: {
    authMode: string;
  };
}

function stripUserinfo(url: string): string {
  const raw = url.trim();
  if (/^git@[^/]+:/.test(raw)) return raw;
  try {
    const u = new URL(raw);
    u.username = "";
    u.password = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

/** PRD §12.2 canonical repository key → sha256:<hex>. */
export function repositoryIdentity(url: string): string {
  const raw = (url || "").trim();
  let host = "";
  let path = "";

  if (/^git@[^/]+:/.test(raw)) {
    const rest = raw.slice("git@".length);
    const colon = rest.indexOf(":");
    host = rest.slice(0, colon).toLowerCase();
    path = rest.slice(colon + 1).replace(/^\/+/, "");
  } else if (raw.startsWith("ssh://")) {
    const cleaned = stripUserinfo(raw);
    const u = new URL(cleaned);
    host = (u.hostname || "").toLowerCase();
    path = (u.pathname || "").replace(/^\/+/, "");
  } else {
    const cleaned = stripUserinfo(raw);
    const u = new URL(cleaned);
    host = (u.hostname || "").toLowerCase();
    path = (u.pathname || "").replace(/^\/+/, "");
  }

  path = path.replace(/\/+$/, "");
  if (path.endsWith(".git")) path = path.slice(0, -".git".length);

  const key = `git|${host}|${path}`;
  const digest = createHash("sha256").update(key, "utf8").digest("hex");
  return `sha256:${digest}`;
}

export function candidateReleaseSourcePaths(
  extras: string[] = [],
): string[] {
  const out: string[] = [...extras];
  const resourcesPath =
    typeof process !== "undefined" &&
    typeof (process as NodeJS.Process & { resourcesPath?: string })
      .resourcesPath === "string"
      ? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      : undefined;
  if (resourcesPath) {
    out.push(join(resourcesPath, "hermes-native", "release-source.json"));
  }
  // Dev / electron-vite: app resources next to package.
  out.push(
    join(__dirname, "../../../resources/hermes-native/release-source.json"),
  );
  out.push(
    join(process.cwd(), "resources/hermes-native/release-source.json"),
  );
  out.push(
    join(
      process.cwd(),
      "apps/work/resources/hermes-native/release-source.json",
    ),
  );
  return out;
}

export function loadReleaseSource(
  explicitPath?: string | null,
): HermesReleaseSource {
  const paths = explicitPath
    ? [explicitPath, ...candidateReleaseSourcePaths()]
    : candidateReleaseSourcePaths();
  for (const p of paths) {
    if (!p || !existsSync(p)) continue;
    const raw = JSON.parse(readFileSync(p, "utf-8")) as HermesReleaseSource;
    if (!raw.installUrl || !raw.approvedCommit) {
      throw new Error(
        `RELEASE_CONFIG_INVALID: incomplete release-source at ${p}`,
      );
    }
    if (!raw.repositoryIdentity) {
      raw.repositoryIdentity = repositoryIdentity(raw.installUrl);
    }
    return raw;
  }
  throw new Error(
    "RELEASE_CONFIG_INVALID: hermes-native/release-source.json not found",
  );
}

export function redactForLog(text: string): string {
  return text
    .replace(/([a-z]+:\/\/)([^/@\s]+)@/gi, "$1***@")
    .replace(
      /(authorization|token|password|api[_-]?key)\s*[:=]\s*\S+/gi,
      "$1=***",
    );
}
