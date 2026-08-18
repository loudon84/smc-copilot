import { createHash } from "crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { basename, join } from "path";

export const RELEASE_MANIFEST_SCHEMA = "smc.work.release.v1";

export function getInstallerName(version) {
  return `smc-work-${version}-setup.exe`;
}

export function getBlockmapName(version) {
  return `${getInstallerName(version)}.blockmap`;
}

export function getRequiredReleaseFiles(version) {
  return [
    getInstallerName(version),
    getBlockmapName(version),
    "latest.yml",
    "SHA256SUMS.txt",
    "release-manifest.json",
  ];
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function readPackageVersion(packageJsonPath) {
  const pkg = readJson(packageJsonPath);
  if (!pkg?.version || typeof pkg.version !== "string") {
    throw new Error(`package.json missing string version: ${packageJsonPath}`);
  }
  return pkg.version.trim();
}

export function validateReleaseVersion(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Invalid release version: ${version}`);
  }
  return version;
}

export function validateUpdateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new Error("SMC_WORK_UPDATE_URL is required");
  }
  const value = rawUrl.trim();
  if (!value) throw new Error("SMC_WORK_UPDATE_URL is empty");
  if (value.includes("${")) {
    throw new Error("SMC_WORK_UPDATE_URL must not contain unexpanded variables");
  }
  if (!value.startsWith("https://")) {
    throw new Error("SMC_WORK_UPDATE_URL must use https://");
  }
  const parsed = new URL(value);
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    throw new Error("SMC_WORK_UPDATE_URL must not point to localhost");
  }
  if (parsed.hostname === "example.com" || parsed.hostname.endsWith(".example.com")) {
    throw new Error("SMC_WORK_UPDATE_URL must not point to example.com");
  }
  if (!parsed.pathname.endsWith("/work/stable/")) {
    throw new Error("SMC_WORK_UPDATE_URL must end with /work/stable/");
  }
  return value;
}

export function parseSimpleYaml(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    map.set(key, rawValue.replace(/^['"]|['"]$/g, "").trim());
  }
  return map;
}

export function readLatestYml(releaseDir) {
  const latestPath = join(releaseDir, "latest.yml");
  const content = readFileSync(latestPath, "utf8");
  const map = parseSimpleYaml(content);
  return {
    content,
    version: map.get("version") ?? "",
    path: map.get("path") ?? "",
  };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function writeSha256Sums(releaseDir, fileNames) {
  const lines = fileNames.map((fileName) => `${sha256File(join(releaseDir, fileName))}  ${fileName}`);
  writeFileSync(join(releaseDir, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
}

export function verifySha256Sums(releaseDir) {
  const sumsPath = join(releaseDir, "SHA256SUMS.txt");
  const lines = readFileSync(sumsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    throw new Error("SHA256SUMS.txt is empty");
  }
  for (const line of lines) {
    const match = /^([a-f0-9]{64})\s{2}(.+)$/.exec(line);
    if (!match) throw new Error(`Invalid SHA256SUMS line: ${line}`);
    const [, expected, fileName] = match;
    const filePath = join(releaseDir, fileName);
    if (!existsSync(filePath)) throw new Error(`Missing artifact for SHA256SUMS: ${fileName}`);
    const actual = sha256File(filePath);
    if (actual !== expected) {
      throw new Error(`SHA256 mismatch for ${fileName}`);
    }
  }
}

export function assertReleaseArtifacts(releaseDir, version) {
  validateReleaseVersion(version);
  const installer = getInstallerName(version);
  const blockmap = getBlockmapName(version);
  for (const fileName of [installer, blockmap, "latest.yml"]) {
    const filePath = join(releaseDir, fileName);
    if (!existsSync(filePath)) {
      throw new Error(`Missing release artifact: ${fileName}`);
    }
    if (!statSync(filePath).isFile()) {
      throw new Error(`Release artifact is not a file: ${fileName}`);
    }
  }
  const latest = readLatestYml(releaseDir);
  if (latest.version !== version) {
    throw new Error(`latest.yml version mismatch: expected ${version}, got ${latest.version || "<empty>"}`);
  }
  if (basename(latest.path) !== installer) {
    throw new Error(`latest.yml path mismatch: expected ${installer}, got ${latest.path || "<empty>"}`);
  }
}

export function buildReleaseManifest({
  version,
  gitCommit,
  updateUrl,
  installer,
  sha256,
  signed,
  createdAt = new Date().toISOString(),
}) {
  return {
    schema: RELEASE_MANIFEST_SCHEMA,
    version,
    gitCommit,
    platform: "windows",
    arch: "x64",
    updateChannel: "stable",
    updateUrl,
    installer,
    sha256,
    signed,
    createdAt,
  };
}

function main() {
  const [, , command, ...args] = process.argv;
  if (!command) return;

  if (command === "validate-url") {
    validateUpdateUrl(args[0] ?? "");
    return;
  }

  if (command === "validate-release") {
    const [releaseDir, version] = args;
    if (!releaseDir || !version) {
      throw new Error("Usage: validate-release <releaseDir> <version>");
    }
    assertReleaseArtifacts(releaseDir, version);
    verifySha256Sums(releaseDir);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
