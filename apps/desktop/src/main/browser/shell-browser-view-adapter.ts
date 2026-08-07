import type { BrowserViewBounds } from "../../shared/browser/browser-contract";
import type { BrowserViewPort } from "./browser-viewport";
import type { ShellViewManager } from "../shell/views/shell-view-manager";
import { BROWSER_PARTITION } from "./browser-types";

export const WEB_OPERATOR_LAYER_ID = "web-operator";

export class ShellBrowserViewAdapter implements BrowserViewPort {
  constructor(private readonly shellViewManager: ShellViewManager) {}

  async createView(url: string): Promise<void> {
    const existing = this.shellViewManager.getView(WEB_OPERATOR_LAYER_ID);

    if (!existing) {
      await this.shellViewManager.createView(
        WEB_OPERATOR_LAYER_ID,
        "web-operator",
        url,
        {
          layer: "content",
          partition: BROWSER_PARTITION,
          contextIsolation: true,
          nodeIntegration: false,
        },
      );
      return;
    }

    await existing.load(url);
  }

  async navigate(url: string): Promise<void> {
    await this.createView(url);
  }

  destroyView(): void {
    this.shellViewManager.destroyView(WEB_OPERATOR_LAYER_ID);
  }

  updateBounds(bounds: BrowserViewBounds): void {
    const existing = this.shellViewManager.getView(WEB_OPERATOR_LAYER_ID);
    if (!existing) return;

    if (bounds.width < 1 || bounds.height < 1) {
      this.shellViewManager.deactivateView(WEB_OPERATOR_LAYER_ID);
      return;
    }

    this.shellViewManager.activateView(WEB_OPERATOR_LAYER_ID, bounds);
  }

  getExternalWebContents(): Electron.WebContents | null {
    return this.shellViewManager.getView(WEB_OPERATOR_LAYER_ID)?.getWebContents() ?? null;
  }

  isReady(): boolean {
    return this.shellViewManager.getView(WEB_OPERATOR_LAYER_ID)?.isReady() ?? false;
  }
}
