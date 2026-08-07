import { BrowserWindow, WebContentsView, ipcMain } from "electron";

import { AIOS_HOME_PARTITION } from "../../shared/shell/browser-partitions";

const AIOS_PARTITION = AIOS_HOME_PARTITION;

/**
 * @deprecated V1.9 停用。由 ShellViewManager 统一管理 View。
 * 保留文件仅为兼容性参考，不应在新代码中使用。
 */
export class AiOsWebContentsController {
  private view: WebContentsView | null = null;
  private mainWindow: BrowserWindow;
  private homeUrl: string;

  constructor(mainWindow: BrowserWindow, frontendPort: number = 3000) {
    this.mainWindow = mainWindow;
    this.homeUrl = `http://127.0.0.1:${frontendPort}`;
    this.registerIpc();
  }

  setHomeUrl(url: string): void {
    this.homeUrl = url;
  }

  async loadHome(): Promise<void> {
    if (!this.view || this.view.webContents.isDestroyed()) {
      this.view = new WebContentsView({
        webPreferences: {
          sandbox: true,
          partition: AIOS_PARTITION,
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      this.mainWindow.contentView.addChildView(this.view);
    }
    await this.view.webContents.loadURL(this.homeUrl);
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.setBounds(bounds);
    }
  }

  reload(): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.reload();
    }
  }

  hide(): void {
    if (this.view) {
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }

  show(bounds: { x: number; y: number; width: number; height: number }): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.setBounds(bounds);
    }
  }

  destroy(): void {
    if (this.view) {
      this.mainWindow.contentView.removeChildView(this.view);
      if (!this.view.webContents.isDestroyed()) {
        this.view.webContents.close();
      }
      this.view = null;
    }
  }

  openDevTools(): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.openDevTools({ mode: "detach" });
    }
  }

  isReady(): boolean {
    return this.view !== null && !this.view.webContents.isDestroyed();
  }

  private registerIpc(): void {
    ipcMain.handle("aios:view:load-home", async () => {
      await this.loadHome();
    });

    ipcMain.handle("aios:view:set-bounds", (_event, bounds: { x: number; y: number; width: number; height: number }) => {
      this.setBounds(bounds);
    });

    ipcMain.handle("aios:view:reload", () => {
      this.reload();
    });

    ipcMain.handle("aios:view:hide", () => {
      this.hide();
    });

    ipcMain.handle("aios:view:destroy", () => {
      this.destroy();
    });
  }
}
