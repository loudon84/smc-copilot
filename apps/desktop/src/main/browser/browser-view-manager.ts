import { BrowserWindow, WebContentsView } from "electron";
import type { BrowserViewBounds } from "../../shared/browser/browser-contract";
import { BROWSER_PARTITION } from "./browser-types";
import type { BrowserViewPort } from "./browser-viewport";

/** @deprecated V2.2+ use ShellBrowserViewAdapter. Kept for rollback/tests. */
export class BrowserViewManager implements BrowserViewPort {
  private view: WebContentsView | null = null;
  private mainWindow: BrowserWindow;
  private boundsCallback: ((bounds: BrowserViewBounds) => void) | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.mainWindow.on("resize", () => {
      if (this.boundsCallback && this.view) {
        const bounds = this.view.getBounds();
        this.boundsCallback(bounds);
      }
    });
  }

  async createView(url: string): Promise<void> {
    if (this.view && !this.view.webContents.isDestroyed()) {
      await this.navigate(url);
      return;
    }

    this.view = new WebContentsView({
      webPreferences: { sandbox: true, partition: BROWSER_PARTITION },
    });
    this.mainWindow.contentView.addChildView(this.view);

    await this.view.webContents.loadURL(url);
  }

  async navigate(url: string): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      await this.createView(url);
      return;
    }
    await this.view.webContents.loadURL(url);
  }

  destroyView(): void {
    if (this.view) {
      this.mainWindow.contentView.removeChildView(this.view);
      if (!this.view.webContents.isDestroyed()) {
        this.view.webContents.close();
      }
      this.view = null;
    }
  }

  updateBounds(bounds: BrowserViewBounds): void {
    if (this.view) {
      this.view.setBounds(bounds);
    }
  }

  getExternalWebContents(): Electron.WebContents | null {
    if (!this.view || this.view.webContents.isDestroyed()) return null;
    return this.view.webContents;
  }

  isReady(): boolean {
    return this.view !== null && !this.view.webContents.isDestroyed();
  }

  onBoundsUpdate(callback: (bounds: BrowserViewBounds) => void): void {
    this.boundsCallback = callback;
  }
}
