import type {
  GeneHubBundle,
  GeneHubInstallBundlePreview,
  GeneHubInstallBundlePreviewFile,
  GeneHubBundlePreviewValidation,
  GeneHubSkill,
  HermesProfileRegisterInput,
  InstallJob,
  InstallJobAction,
  InstalledSkillRecord,
} from "../../shared/genehub/genehub-contract";
import type { DesktopDeviceIdentity } from "../../shared/genehub/genehub-contract";
import { GeneHubError } from "../../shared/genehub/genehub-errors";
import { fetchGeneHubDescriptor } from "./genehub-backend-descriptor";
import { genehubFetch } from "./genehub-http";

async function requireDescriptor() {
  const result = await fetchGeneHubDescriptor();
  if (!result.ok || !result.descriptor) {
    throw new GeneHubError(
      result.error?.code === "GENEHUB_BACKEND_URL_MISSING"
        ? "GENEHUB_BACKEND_URL_MISSING"
        : result.error?.code === "GENEHUB_DESCRIPTOR_MISSING"
          ? "GENEHUB_DESCRIPTOR_MISSING"
          : "GENEHUB_BACKEND_UNREACHABLE",
      result.error?.message ?? "GeneHub descriptor unavailable",
    );
  }
  if (!result.descriptor.enabled) {
    throw new GeneHubError("GENEHUB_DISABLED", "GeneHub is disabled on server");
  }
  return result.descriptor;
}

export function mapGeneHubSkill(raw: Record<string, unknown>): GeneHubSkill {
  const permissionsList = Array.isArray(raw.permissions)
    ? raw.permissions.map(String)
    : [];

  const permissionsObj =
    raw.permissions && !Array.isArray(raw.permissions)
      ? (raw.permissions as Record<string, unknown>)
      : {};

  const installedStatus = String(raw.installed_status ?? raw.installedStatus ?? "");

  return {
    geneSlug: String(raw.gene_slug ?? raw.geneSlug ?? raw.slug ?? ""),
    geneVersion: String(raw.gene_version ?? raw.geneVersion ?? raw.version ?? ""),
    skillName: String(raw.skill_name ?? raw.skillName ?? raw.slug ?? ""),
    displayName: String(raw.display_name ?? raw.displayName ?? raw.name ?? raw.slug ?? ""),
    description: String(raw.description ?? raw.short_description ?? ""),
    category: raw.category ? String(raw.category) : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    installed: Boolean(raw.installed ?? installedStatus === "installed"),
    installedVersion: raw.installed_version
      ? String(raw.installed_version)
      : raw.installedVersion
        ? String(raw.installedVersion)
        : undefined,
    updateAvailable: Boolean(raw.update_available ?? raw.updateAvailable),
    permissions: {
      canInstall:
        permissionsList.includes("install") ||
        Boolean(permissionsObj.can_install ?? permissionsObj.canInstall),
      canUpdate:
        permissionsList.includes("update") ||
        Boolean(permissionsObj.can_update ?? permissionsObj.canUpdate),
      canUninstall:
        permissionsList.includes("uninstall") ||
        Boolean(permissionsObj.can_uninstall ?? permissionsObj.canUninstall),
    },
  };
}

export function mapGeneHubJob(raw: Record<string, unknown>): InstallJob {
  const rawSource = raw.job_source ?? raw.source;
  let source: InstallJob["source"];
  if (typeof rawSource === "string") {
    if (
      rawSource === "mcp_agent_request" ||
      rawSource === "desktop_manual" ||
      rawSource === "server_assigned"
    ) {
      source = rawSource;
    }
  }
  return {
    jobId: String(raw.job_id ?? raw.jobId ?? raw.id ?? ""),
    profileId: String(raw.profile_id ?? raw.profileId ?? ""),
    profileName: raw.profile_name ? String(raw.profile_name) : raw.profileName ? String(raw.profileName) : undefined,
    geneSlug: String(raw.gene_slug ?? raw.geneSlug ?? ""),
    geneVersion: String(raw.gene_version ?? raw.geneVersion ?? ""),
    skillName: String(raw.skill_name ?? raw.skillName ?? ""),
    action: String(raw.action ?? raw.job_type ?? raw.jobType ?? "install") as InstallJobAction,
    status: String(raw.status ?? "pending") as InstallJob["status"],
    source,
    createdAt: raw.created_at ? String(raw.created_at) : raw.createdAt ? String(raw.createdAt) : undefined,
    assignedAt: raw.assigned_at ? String(raw.assigned_at) : undefined,
    claimedAt: raw.claimed_at ? String(raw.claimed_at) : undefined,
    lastUpdatedAt: raw.updated_at
      ? String(raw.updated_at)
      : raw.last_updated_at
        ? String(raw.last_updated_at)
        : raw.lastUpdatedAt
          ? String(raw.lastUpdatedAt)
          : undefined,
    errorCode: raw.error_code ? String(raw.error_code) : undefined,
    errorMessage: raw.error_message ? String(raw.error_message) : undefined,
  };
}

export function normalizeGeneHubBundleFiles(input: unknown): Array<{
  relativePath: string;
  content: string;
  encoding: "utf-8" | "base64";
}> {
  if (Array.isArray(input)) {
    return input.map((f) => ({
      relativePath: String(
        (f as Record<string, unknown>).relative_path ??
          (f as Record<string, unknown>).relativePath ??
          "",
      ),
      content: String((f as Record<string, unknown>).content ?? ""),
      encoding:
        ((f as Record<string, unknown>).encoding as "utf-8" | "base64" | undefined) ?? "utf-8",
    }));
  }

  if (input && typeof input === "object") {
    return Object.entries(input as Record<string, unknown>).map(([relativePath, content]) => ({
      relativePath,
      content: String(content ?? ""),
      encoding: "utf-8" as const,
    }));
  }

  return [];
}

function mapBundle(raw: Record<string, unknown>, jobId: string): GeneHubBundle {
  const manifestRaw = (raw.manifest as Record<string, unknown> | undefined) ?? {};
  const files = normalizeGeneHubBundleFiles(raw.files);
  const scripts = normalizeGeneHubBundleFiles(raw.scripts);

  return {
    jobId,
    manifest: {
      geneSlug: String(manifestRaw.gene_slug ?? manifestRaw.geneSlug ?? ""),
      geneVersion: String(manifestRaw.gene_version ?? manifestRaw.geneVersion ?? ""),
      skillName: String(manifestRaw.skill_name ?? manifestRaw.skillName ?? ""),
      manifestHash: manifestRaw.manifest_hash
        ? String(manifestRaw.manifest_hash)
        : manifestRaw.manifestHash
          ? String(manifestRaw.manifestHash)
          : undefined,
      bundleHash: manifestRaw.bundle_hash
        ? String(manifestRaw.bundle_hash)
        : manifestRaw.bundleHash
          ? String(manifestRaw.bundleHash)
          : undefined,
      signature: manifestRaw.signature ? String(manifestRaw.signature) : undefined,
      compatibility: manifestRaw.compatibility as GeneHubBundle["manifest"]["compatibility"],
    },
    files,
    scripts: scripts.length ? scripts : undefined,
  };
}

export async function registerDevice(
  identity: DesktopDeviceIdentity,
): Promise<{ deviceId: string }> {
  const descriptor = await requireDescriptor();
  try {
    const data = await genehubFetch<Record<string, unknown>>(descriptor, "/devices/register", {
      method: "POST",
      body: {
        device_name: identity.deviceName,
        device_fingerprint: identity.deviceFingerprint,
        os_type: identity.osType,
        os_version: identity.osVersion,
        app_version: identity.appVersion,
      },
    });
    return { deviceId: String(data.device_id ?? data.deviceId ?? identity.deviceFingerprint) };
  } catch (err) {
    if (err instanceof GeneHubError) {
      throw new GeneHubError("GENEHUB_DEVICE_REGISTER_FAILED", err.message);
    }
    throw err;
  }
}

export async function registerHermesProfile(
  profile: HermesProfileRegisterInput,
): Promise<{ profileId: string }> {
  const descriptor = await requireDescriptor();
  try {
    const data = await genehubFetch<Record<string, unknown>>(descriptor, "/hermes/profiles/register", {
      method: "POST",
      body: {
        desktop_device_id: profile.desktopDeviceId,
        profile_name: profile.profileName,
        hermes_home: profile.hermesHome,
        gateway_url: profile.gatewayUrl,
        gateway_port: profile.gatewayPort,
        runtime_version: profile.runtimeVersion,
        capabilities: profile.capabilities,
      },
    });
    return { profileId: String(data.profile_id ?? data.profileId ?? profile.profileId) };
  } catch (err) {
    if (err instanceof GeneHubError) {
      throw new GeneHubError("GENEHUB_PROFILE_REGISTER_FAILED", err.message);
    }
    throw err;
  }
}

export async function heartbeat(payload: {
  deviceId: string;
  profiles: Array<{ profileId: string; profileName: string; status: string }>;
}): Promise<{ ok: boolean; serverConfig?: Record<string, unknown> }> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<Record<string, unknown>>(descriptor, "/heartbeat", {
    method: "POST",
    body: {
      desktop_device_id: payload.deviceId,
      profiles: payload.profiles.map((p) => ({
        profile_id: p.profileId,
        profile_name: p.profileName,
        status: p.status,
      })),
    },
  });
  return {
    ok: true,
    serverConfig: (data.config as Record<string, unknown> | undefined) ?? data.server_config as Record<string, unknown> | undefined,
  };
}

export async function listAuthorizedSkills(profileId: string): Promise<GeneHubSkill[]> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<{ skills?: unknown[] } | unknown[]>(
    descriptor,
    `/genehub/skills?profile_id=${encodeURIComponent(profileId)}`,
  );
  const list = Array.isArray(data) ? data : (data.skills ?? []);
  return list.map((item) => mapGeneHubSkill(item as Record<string, unknown>));
}

export async function createInstallJob(input: {
  profileId: string;
  geneSlug: string;
  action: InstallJobAction;
  version?: string;
}): Promise<InstallJob> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<Record<string, unknown>>(descriptor, "/hermes/install-jobs", {
    method: "POST",
    body: {
      profile_id: input.profileId,
      gene_slug: input.geneSlug,
      version: input.version ?? "latest",
      job_type: input.action,
    },
  });
  return mapGeneHubJob(data);
}

export async function listPendingJobs(profileId: string): Promise<InstallJob[]> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<{ jobs?: unknown[] } | unknown[]>(
    descriptor,
    `/hermes/install-jobs/pending?profile_id=${encodeURIComponent(profileId)}`,
  );
  const list = Array.isArray(data) ? data : (data.jobs ?? []);
  return list.map((item) => mapGeneHubJob(item as Record<string, unknown>));
}

function mapPreviewFile(raw: Record<string, unknown>): GeneHubInstallBundlePreviewFile {
  const kindRaw = raw.kind;
  const kind =
    kindRaw === "skill" || kindRaw === "doc" || kindRaw === "config" || kindRaw === "other"
      ? kindRaw
      : undefined;
  const riskRaw = raw.risk_level ?? raw.riskLevel;
  const riskLevel =
    riskRaw === "low" || riskRaw === "medium" || riskRaw === "high" ? riskRaw : undefined;
  const size =
    raw.size != null ? Number(raw.size) : raw.size_hint != null ? Number(raw.size_hint) : undefined;
  return {
    relativePath: String(raw.relative_path ?? raw.relativePath ?? ""),
    size,
    sizeHint: size,
    sha256: raw.sha256 ? String(raw.sha256) : undefined,
    kind,
    entry: raw.entry != null ? Boolean(raw.entry) : undefined,
    riskLevel,
  };
}

export function mapBundlePreview(raw: Record<string, unknown>, jobId: string): GeneHubInstallBundlePreview {
  const validationRaw = (raw.validation_preview ?? raw.validationPreview) as
    | Record<string, unknown>
    | undefined;
  const compatibilityRaw = (raw.compatibility as Record<string, unknown> | undefined) ?? {};
  const validationPreview: GeneHubBundlePreviewValidation | undefined = validationRaw
    ? {
        hasSkill: Boolean(validationRaw.has_skill ?? validationRaw.hasSkill),
        hasScripts: Boolean(validationRaw.has_scripts ?? validationRaw.hasScripts),
        requiresSignature: Boolean(
          validationRaw.requires_signature ?? validationRaw.requiresSignature,
        ),
        signaturePresent: Boolean(
          validationRaw.signature_present ?? validationRaw.signaturePresent,
        ),
        pathWarnings: Array.isArray(validationRaw.path_warnings ?? validationRaw.pathWarnings)
          ? ((validationRaw.path_warnings ?? validationRaw.pathWarnings) as unknown[]).map(String)
          : [],
        compatibilityWarnings: Array.isArray(
          validationRaw.compatibility_warnings ?? validationRaw.compatibilityWarnings,
        )
          ? (
              (validationRaw.compatibility_warnings ??
                validationRaw.compatibilityWarnings) as unknown[]
            ).map(String)
          : [],
      }
    : undefined;

  const filesRaw = raw.files;
  const files = Array.isArray(filesRaw)
    ? filesRaw.map((f) => mapPreviewFile(f as Record<string, unknown>))
    : [];
  const scriptsRaw = raw.scripts;
  const scripts = Array.isArray(scriptsRaw)
    ? scriptsRaw.map((f) => mapPreviewFile(f as Record<string, unknown>))
    : [];

  const geneSlug = String(raw.gene_slug ?? raw.geneSlug ?? "");
  const geneVersion = String(raw.gene_version ?? raw.geneVersion ?? "");
  const skillName = String(raw.skill_name ?? raw.skillName ?? "");

  return {
    jobId: String(raw.job_id ?? raw.jobId ?? jobId),
    geneSlug,
    geneVersion,
    skillName,
    action: String(raw.action ?? "install") as InstallJob["action"],
    manifestHash: raw.manifest_hash
      ? String(raw.manifest_hash)
      : raw.manifestHash
        ? String(raw.manifestHash)
        : undefined,
    bundleHash: raw.bundle_hash
      ? String(raw.bundle_hash)
      : raw.bundleHash
        ? String(raw.bundleHash)
        : undefined,
    compatibility: {
      profiles: Array.isArray(compatibilityRaw.profiles)
        ? compatibilityRaw.profiles.map(String)
        : undefined,
      hermesVersion: compatibilityRaw.hermes_version
        ? String(compatibilityRaw.hermes_version)
        : compatibilityRaw.hermesVersion
          ? String(compatibilityRaw.hermesVersion)
          : undefined,
      desktopVersion: compatibilityRaw.desktop_version
        ? String(compatibilityRaw.desktop_version)
        : compatibilityRaw.desktopVersion
          ? String(compatibilityRaw.desktopVersion)
          : undefined,
    },
    manifest: {
      geneSlug,
      geneVersion,
      skillName,
      manifestHash: raw.manifest_hash ? String(raw.manifest_hash) : undefined,
      bundleHash: raw.bundle_hash ? String(raw.bundle_hash) : undefined,
    },
    files,
    scripts: scripts.length ? scripts : undefined,
    validationPreview,
  };
}

export async function getInstallJob(jobId: string): Promise<InstallJob> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<Record<string, unknown>>(
    descriptor,
    `/hermes/install-jobs/${encodeURIComponent(jobId)}`,
  );
  return mapGeneHubJob(data);
}

export async function fetchBundlePreview(jobId: string): Promise<GeneHubInstallBundlePreview> {
  const descriptor = await requireDescriptor();
  try {
    const data = await genehubFetch<Record<string, unknown>>(
      descriptor,
      `/hermes/install-jobs/${encodeURIComponent(jobId)}/bundle-preview`,
    );
    return mapBundlePreview(data, jobId);
  } catch (err) {
    if (err instanceof GeneHubError) {
      throw new GeneHubError("GENEHUB_API_FAILED", err.message);
    }
    throw err;
  }
}

export async function ignoreInstallJob(
  jobId: string,
): Promise<{ success: boolean; status: "cancelled" }> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<Record<string, unknown>>(
    descriptor,
    `/hermes/install-jobs/${encodeURIComponent(jobId)}/ignore`,
    { method: "POST", body: {} },
  );
  return {
    success: Boolean(data.success ?? true),
    status: "cancelled",
  };
}

export async function claimJob(jobId: string): Promise<InstallJob> {
  const descriptor = await requireDescriptor();
  const data = await genehubFetch<Record<string, unknown>>(
    descriptor,
    `/hermes/install-jobs/${encodeURIComponent(jobId)}/claim`,
    { method: "POST", body: {} },
  );
  return mapGeneHubJob(data);
}

export async function downloadBundle(jobId: string): Promise<GeneHubBundle> {
  const descriptor = await requireDescriptor();
  try {
    const data = await genehubFetch<Record<string, unknown>>(
      descriptor,
      `/hermes/install-jobs/${encodeURIComponent(jobId)}/bundle`,
    );
    return mapBundle(data, jobId);
  } catch (err) {
    if (err instanceof GeneHubError) {
      throw new GeneHubError("GENEHUB_BUNDLE_DOWNLOAD_FAILED", err.message);
    }
    throw err;
  }
}

export async function updateJobStatus(
  jobId: string,
  payload: {
    status: InstallJob["status"];
    clientReport?: Record<string, unknown>;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> {
  const descriptor = await requireDescriptor();
  await genehubFetch(descriptor, `/hermes/install-jobs/${encodeURIComponent(jobId)}/status`, {
    method: "POST",
    body: {
      status: payload.status,
      client_report: payload.clientReport,
      error_code: payload.errorCode,
      error_message: payload.errorMessage,
    },
  });
}

export async function syncInstalledSkills(input: {
  profileId: string;
  skills: InstalledSkillRecord[];
}): Promise<void> {
  const descriptor = await requireDescriptor();
  await genehubFetch(descriptor, "/hermes/installed-skills/sync", {
    method: "POST",
    body: {
      profile_id: input.profileId,
      skills: input.skills.map((s) => ({
        gene_slug: s.geneSlug,
        gene_version: s.geneVersion,
        skill_name: s.skillName,
        installed_at: s.installedAt,
        source: s.source,
        job_id: s.jobId,
      })),
    },
  });
}
