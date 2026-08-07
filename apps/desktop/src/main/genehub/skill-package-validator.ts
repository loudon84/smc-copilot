import { createHash, createPublicKey, verify as cryptoVerify } from "crypto";
import { isAbsolute, normalize, resolve, sep } from "path";
import type { GeneHubBundle } from "../../shared/genehub/genehub-contract";
import { GENEHUB_SKILL_NAME_PATTERN } from "../../shared/genehub/genehub-contract";
import { GeneHubError } from "../../shared/genehub/genehub-errors";
import { getGeneHubConfig } from "./genehub-config";
import { appendInstallLog } from "./genehub-install-log";

const FORBIDDEN_PATH_PATTERNS = [
  /\.\./,
  /^[A-Za-z]:\\/,
  /^\\\\/,
  /^\//,
];

function pathNotAllowed(message: string): GeneHubError {
  return new GeneHubError("GENEHUB_PATH_NOT_ALLOWED", message);
}

export function assertValidSkillName(skillName: string): void {
  if (!GENEHUB_SKILL_NAME_PATTERN.test(skillName)) {
    throw new GeneHubError(
      "GENEHUB_INVALID_SKILL_NAME",
      `Invalid skill name: ${skillName}`,
    );
  }
}

export function assertSafeRelativePath(relativePath: string, hermesHome: string): string {
  const trimmed = relativePath.replace(/\\/g, "/").trim();
  if (!trimmed || trimmed.includes("\0")) {
    throw pathNotAllowed(`Invalid file path: ${relativePath}`);
  }

  for (const pattern of FORBIDDEN_PATH_PATTERNS) {
    if (pattern.test(trimmed) || pattern.test(relativePath)) {
      throw pathNotAllowed(`Forbidden path: ${relativePath}`);
    }
  }

  if (isAbsolute(trimmed)) {
    throw pathNotAllowed(`Absolute path not allowed: ${relativePath}`);
  }

  const resolved = resolve(hermesHome, trimmed);
  const normalizedHome = resolve(hermesHome);
  if (resolved !== normalizedHome && !resolved.startsWith(`${normalizedHome}${sep}`)) {
    throw pathNotAllowed(`Path escapes hermes home: ${relativePath}`);
  }

  return normalize(trimmed);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function buildSignaturePayload(manifest: GeneHubBundle["manifest"]): string {
  return `${manifest.manifestHash ?? ""}:${manifest.bundleHash ?? ""}`;
}

function verifyWithKey(
  signature: string,
  payload: string,
  publicKeyPem: string,
  algorithm: "ed25519" | "rsa-sha256" | undefined,
): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    if (algorithm === "rsa-sha256") {
      return cryptoVerify(
        "RSA-SHA256",
        Buffer.from(payload, "utf8"),
        key,
        Buffer.from(signature, "base64"),
      );
    }
    return cryptoVerify(null, Buffer.from(payload, "utf8"), key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}

export function verifyGeneHubSignature(bundle: GeneHubBundle, jobId: string, geneSlug: string): void {
  const config = getGeneHubConfig();
  const manifest = bundle.manifest;

  if (!config.verifySignature) {
    appendInstallLog({
      jobId,
      geneSlug,
      step: "signature_skipped",
      status: "info",
      message: "Signature verification disabled by config",
    });
    return;
  }

  if (!manifest.signature?.trim()) {
    throw new GeneHubError("GENEHUB_SIGNATURE_INVALID", "Bundle signature is missing");
  }

  if (!config.trustedPublicKeys.length) {
    throw new GeneHubError(
      "GENEHUB_SIGNATURE_INVALID",
      "No trusted public keys configured for signature verification",
    );
  }

  const payload = buildSignaturePayload(manifest);
  const algorithm = config.signatureAlgorithm ?? "ed25519";
  const verified = config.trustedPublicKeys.some((key) =>
    verifyWithKey(manifest.signature!, payload, key, algorithm),
  );

  if (!verified) {
    throw new GeneHubError("GENEHUB_SIGNATURE_INVALID", "Bundle signature verification failed");
  }
}

export function validateGeneHubBundle(
  bundle: GeneHubBundle,
  hermesHome: string,
  profileName?: string,
  jobId?: string,
): void {
  const manifest = bundle.manifest;

  if (!manifest.geneSlug?.trim() || !manifest.skillName?.trim()) {
    throw new GeneHubError("GENEHUB_BUNDLE_INVALID", "Bundle manifest missing geneSlug or skillName");
  }

  assertValidSkillName(manifest.skillName);

  if (!bundle.files.some((f) => f.relativePath.endsWith("SKILL.md") || f.relativePath === "SKILL.md")) {
    throw new GeneHubError("GENEHUB_BUNDLE_INVALID", "Bundle must include SKILL.md");
  }

  const allowedProfiles = manifest.compatibility?.profiles;
  if (allowedProfiles?.length && profileName) {
    if (!allowedProfiles.includes(profileName)) {
      throw new GeneHubError(
        "GENEHUB_BUNDLE_INVALID",
        `Bundle compatibility profiles do not include ${profileName}`,
      );
    }
  }

  for (const file of bundle.files) {
    assertSafeRelativePath(file.relativePath, hermesHome);
  }

  for (const script of bundle.scripts ?? []) {
    assertSafeRelativePath(script.relativePath, hermesHome);
  }

  if (manifest.manifestHash) {
    const manifestPayload = JSON.stringify({
      geneSlug: manifest.geneSlug,
      geneVersion: manifest.geneVersion,
      skillName: manifest.skillName,
    });
    const computed = hashContent(manifestPayload);
    if (computed !== manifest.manifestHash) {
      throw new GeneHubError("GENEHUB_HASH_MISMATCH", "Manifest hash mismatch");
    }
  }

  if (manifest.bundleHash) {
    const payload = JSON.stringify(bundle.files.map((f) => [f.relativePath, f.content]));
    const computed = hashContent(payload);
    if (computed !== manifest.bundleHash) {
      throw new GeneHubError("GENEHUB_HASH_MISMATCH", "Bundle hash mismatch");
    }
  }

  verifyGeneHubSignature(bundle, jobId ?? bundle.jobId, manifest.geneSlug);
}
