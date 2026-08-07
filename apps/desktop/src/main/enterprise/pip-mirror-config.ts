import type { PipMirrorConfig } from "../../shared/enterprise/pip-mirror-presets";
import {
  DEFAULT_PIP_MIRROR,
  resolvePipMirrorFromPreset,
  trustedHostFromPipIndexUrl,
  type PipMirrorPresetId,
} from "../../shared/enterprise/pip-mirror-presets";

import { loadDeploymentConfig } from "./deployment-config";
import { readRuntimeConfig } from "./desktop-runtime-config";

export interface PipMirrorResolveInput {
  pipIndexUrl?: string;
  trustedHost?: string;
  pipMirrorPreset?: PipMirrorPresetId;
}

export function resolvePipMirrorConfig(
  input: PipMirrorResolveInput = {},
): PipMirrorConfig {
  if (input.pipMirrorPreset) {
    const fromPreset = resolvePipMirrorFromPreset(input.pipMirrorPreset, {
      pipIndexUrl: input.pipIndexUrl,
      trustedHost: input.trustedHost,
    });
    if (fromPreset.pipIndexUrl) {
      return fromPreset;
    }
  }

  if (input.pipIndexUrl?.trim()) {
    const pipIndexUrl = input.pipIndexUrl.trim();
    return {
      pipIndexUrl,
      trustedHost:
        input.trustedHost?.trim() || trustedHostFromPipIndexUrl(pipIndexUrl),
    };
  }

  const runtime = readRuntimeConfig();
  if (runtime?.pipMirror?.pipIndexUrl) {
    return runtime.pipMirror;
  }

  const deployment = loadDeploymentConfig();
  if (deployment.ok && deployment.config?.runtime.pipIndexUrl) {
    return {
      pipIndexUrl: deployment.config.runtime.pipIndexUrl,
      trustedHost: deployment.config.runtime.trustedHost || "",
    };
  }

  const envUrl =
    process.env.HERMES_PIP_INDEX_URL?.trim() ||
    process.env.PIP_INDEX_URL?.trim();
  if (envUrl) {
    return {
      pipIndexUrl: envUrl,
      trustedHost:
        process.env.PIP_TRUSTED_HOST?.trim() ||
        process.env.HERMES_PIP_TRUSTED_HOST?.trim() ||
        trustedHostFromPipIndexUrl(envUrl),
    };
  }

  return { ...DEFAULT_PIP_MIRROR };
}
