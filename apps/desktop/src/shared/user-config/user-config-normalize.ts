import type { DesktopBootstrapConfig } from "./user-config-contract";
import { getDefaultAuthEndpointConfig } from "../auth/auth-url";

type BootstrapConfigInput = Omit<DesktopBootstrapConfig, "schemaVersion"> & {
  schemaVersion?: 1 | 2;
};

/** Normalize v1 configs to schema v2 with aiosHomeUrl / authPrefix. */
export function normalizeBootstrapConfig(
  config: BootstrapConfigInput,
): DesktopBootstrapConfig {
  const defaults = getDefaultAuthEndpointConfig();
  const aiosHomeUrl =
    config.aios.aiosHomeUrl ?? config.aios.frontendUrl ?? defaults.aiosHomeUrl;
  const authPrefix = config.aios.authPrefix ?? defaults.authPrefix;

  return {
    ...config,
    schemaVersion: 2,
    aios: {
      ...config.aios,
      authPrefix,
      aiosHomeUrl,
      frontendUrl: aiosHomeUrl,
    },
  };
}
