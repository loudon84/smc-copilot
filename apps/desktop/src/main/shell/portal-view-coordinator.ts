import type { ShellViewManager } from "./views/shell-view-manager";
import type { ShellViewBounds } from "../../shared/shell/view-contract";
import {
  buildPortalHealthCandidates,
  fetchHttpStatus,
} from "../aios/aios-health";
import { resolveAiosHomeUrl } from "../aios/aios-home-url";
import { shouldForceReloadAiosHome } from "../../shared/aios/aios-home-url-policy";
import { beforeLoadAiosHome } from "../auth/token-header-injector";

let shellViewManagerRef: ShellViewManager | null = null;

export function bindShellViewManager(svm: ShellViewManager): void {
  shellViewManagerRef = svm;
}

export function unbindShellViewManager(): void {
  shellViewManagerRef = null;
}

/** Pick load URL: exact configured path first; fallbacks only when it is unreachable. */
export async function resolvePortalLoadUrl(): Promise<string> {
  const configured = resolveAiosHomeUrl();
  const primaryStatus = await fetchHttpStatus(configured);
  if (primaryStatus !== null && primaryStatus >= 200 && primaryStatus < 400) {
    return configured;
  }

  for (const url of buildPortalHealthCandidates(configured)) {
    if (url === configured) continue;
    const status = await fetchHttpStatus(url);
    if (status !== null && status >= 200 && status < 400) {
      return url;
    }
  }

  return configured;
}

function readVisibleBounds(
  svm: ShellViewManager,
): { active: boolean; bounds: ShellViewBounds | null } {
  const existing = svm.getView("portal");
  if (!existing) {
    return { active: false, bounds: null };
  }

  const bounds = existing.getBounds?.() ?? { x: 0, y: 0, width: 0, height: 0 };
  if (existing.isActive?.() === true && bounds.width > 0 && bounds.height > 0) {
    return { active: true, bounds };
  }

  return { active: false, bounds: null };
}

function finishPortalVisibility(
  svm: ShellViewManager,
  preserve: { active: boolean; bounds: ShellViewBounds | null },
): void {
  if (preserve.active && preserve.bounds) {
    svm.activateView("portal", preserve.bounds);
    return;
  }

  // Bootstrap / pre-layout: keep hidden until Renderer WebContentsHost setBounds.
  svm.deactivateView("portal");
}

/**
 * Ensures portal WebContentsView exists and loads the current resolved URL.
 * Updates token injection policy before load.
 */
export async function refreshPortalView(): Promise<void> {
  const svm = shellViewManagerRef;
  if (!svm) {
    return;
  }

  const preserve = readVisibleBounds(svm);

  await beforeLoadAiosHome();
  const configuredUrl = resolveAiosHomeUrl();
  const initialLoadUrl = await resolvePortalLoadUrl();
  const existing = svm.getView("portal");

  if (!existing) {
    await svm.createView("portal", "portal", initialLoadUrl, {
      layer: "content",
    });
    console.log(`[portal-coordinator] Created portal view: ${initialLoadUrl}`);
    finishPortalVisibility(svm, preserve);
    return;
  }

  const webContents = existing.getWebContents?.();
  const currentUrl = webContents?.getURL?.() ?? "";
  const state = existing.getState?.() ?? "unknown";

  const shouldReload = shouldForceReloadAiosHome(
    currentUrl,
    configuredUrl,
    state,
  );

  if (shouldReload) {
    try {
      await existing.load?.(initialLoadUrl);
      console.log(
        `[portal-coordinator] Reloaded portal view: ${initialLoadUrl}`,
      );
    } catch (err) {
      console.warn(
        "[portal-coordinator] Failed to reload portal (keeping existing view):",
        err,
      );
    }
  }

  finishPortalVisibility(svm, preserve);
}
