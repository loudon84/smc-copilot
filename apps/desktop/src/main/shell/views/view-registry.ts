import type {
  ShellViewKind,
  ViewRegistryEntry,
} from "../../../shared/shell/view-contract";
import {
  PORTAL_PARTITION,
  WEB_OPERATOR_PARTITION,
} from "../../../shared/shell/browser-partitions";
import { resolveCompiledPreloadPath } from "../../utils/preload-paths";

/** Compiled preload for WebOperator CRM bridge (out/preload/crm-bridge-preload.js). */
function crmBridgePreloadPath(): string {
  return resolveCompiledPreloadPath("crm-bridge-preload.js");
}

/**
 * ShellView session partition strategy (V3.2.1):
 *
 * - portal: persist:aios-home (+ token header injection on whitelisted origins)
 * - web-operator: persist:web-operator (no token injection)
 * - external-browser:*: persist:external-browser-{uuid} per tab (required at create; no token)
 */
export class ViewRegistry {
  private entries: Map<ShellViewKind, ViewRegistryEntry> = new Map();

  constructor() {
    this.registerDefaults();
  }

  register(kind: ShellViewKind, entry: ViewRegistryEntry): void {
    this.entries.set(kind, entry);
  }

  get(kind: ShellViewKind): ViewRegistryEntry | undefined {
    return this.entries.get(kind);
  }

  has(kind: ShellViewKind): boolean {
    return this.entries.has(kind);
  }

  getAllKinds(): ShellViewKind[] {
    return Array.from(this.entries.keys());
  }

  private registerDefaults(): void {
    this.register("web-operator", {
      kind: "web-operator",
      defaultLayer: "content",
      defaultPartition: WEB_OPERATOR_PARTITION,
      // sandbox:true breaks crm-bridge-preload on Windows WebContentsView
      defaultSandbox: false,
      defaultContextIsolation: true,
      defaultPreload: crmBridgePreloadPath(),
    });

    this.register("portal", {
      kind: "portal",
      defaultLayer: "content",
      defaultPartition: PORTAL_PARTITION,
      defaultSandbox: true,
      defaultContextIsolation: true,
      defaultPreload: undefined,
    });

    // Per-tab partition required at create — see externalBrowserPartition()
    this.register("external-browser", {
      kind: "external-browser",
      defaultLayer: "content",
      defaultSandbox: true,
    });

    // renderer-root 不纳入 ShellViewManager 管理
  }
}

export const viewRegistry = new ViewRegistry();
