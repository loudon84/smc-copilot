/** Canonical shell session partitions (V3.3). */
export const SHELL_PARTITIONS = {
  /** Logical portal view; physical partition unchanged for NextAuth cookies. */
  PORTAL: "persist:aios-home",
  WORKSPACES: "persist:workspaces",
  WEB_OPERATOR: "persist:web-operator",
  OFFICE: "persist:office",
  EXTERNAL_BROWSER_PREFIX: "persist:external-browser-",
} as const;

/** Portal embed partition (token injection target). */
export const PORTAL_PARTITION = SHELL_PARTITIONS.PORTAL;

/** @deprecated Use PORTAL_PARTITION */
export const AIOS_HOME_PARTITION = PORTAL_PARTITION;

/** Web Operator partition (no token injection). */
export const WEB_OPERATOR_PARTITION = SHELL_PARTITIONS.WEB_OPERATOR;

const EXTERNAL_LAYER_PREFIX = "external-browser:";

/**
 * Per-tab external browser partition.
 * layerId: external-browser:{uuid} → persist:external-browser-{uuid}
 */
export function externalBrowserPartition(layerId: string): string {
  const suffix = layerId.startsWith(EXTERNAL_LAYER_PREFIX)
    ? layerId.slice(EXTERNAL_LAYER_PREFIX.length)
    : layerId;
  return `${SHELL_PARTITIONS.EXTERNAL_BROWSER_PREFIX}${suffix}`;
}

/** @deprecated Use externalBrowserPartition */
export const externalBrowserPartitionLegacy = externalBrowserPartition;
