import { Tray, Menu, nativeImage, BrowserWindow, app } from "electron";
import { resolveTrayIconPath } from "./tray-icon-path";

/**
 * Tray 图标配置
 */
interface TrayIconConfig {
  /** 标准图标路径 */
  iconPath: string;
  /** macOS 模板图标路径（可选） */
  macTemplateIconPath?: string;
  /** Windows ICO 路径（可选） */
  windowsIconPath?: string;
}

/**
 * Tray 菜单配置
 */
interface TrayMenuConfig {
  /** 显示窗口标签 */
  showWindowLabel: string;
  /** 隐藏窗口标签 */
  hideWindowLabel: string;
  /** 退出标签 */
  quitLabel: string;
  /** Gateway 状态标签 */
  gatewayStatusLabel?: string;
  /** 当前 Profile 标签 */
  currentProfileLabel?: string;
}

/**
 * TrayManager - 系统托盘管理器
 *
 * 管理托盘图标、菜单、事件处理
 */
export class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow;
  private iconConfig: TrayIconConfig;
  private menuConfig: TrayMenuConfig;
  private gatewayRunning = false;
  private currentProfile = "default";

  constructor(
    mainWindow: BrowserWindow,
    iconConfig: TrayIconConfig,
    menuConfig: TrayMenuConfig,
    private readonly onQuit: () => void,
  ) {
    this.mainWindow = mainWindow;
    this.iconConfig = iconConfig;
    this.menuConfig = menuConfig;
  }

  /**
   * 创建托盘
   */
  create(): void {
    if (this.tray) return;

    const icon = this.loadIcon();
    this.tray = new Tray(icon);

    this.tray.setToolTip("SMC-Copilot");
    this.updateContextMenu();

    // 点击托盘图标显示/隐藏窗口
    this.tray.on("click", () => {
      this.toggleWindow();
    });

    // macOS 双击
    this.tray.on("double-click", () => {
      this.showWindow();
    });

    console.log("[TRAY] Tray created successfully");
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  /**
   * 更新 Gateway 状态
   */
  setGatewayRunning(running: boolean): void {
    this.gatewayRunning = running;
    this.updateContextMenu();
  }

  /**
   * 更新当前 Profile
   */
  setCurrentProfile(profile: string): void {
    this.currentProfile = profile;
    this.updateContextMenu();
  }

  /**
   * 加载图标
   */
  private loadIcon(): ReturnType<typeof nativeImage.createFromPath> {
    let iconPath: string;

    if (process.platform === "darwin" && this.iconConfig.macTemplateIconPath) {
      iconPath = this.iconConfig.macTemplateIconPath;
    } else if (process.platform === "win32" && this.iconConfig.windowsIconPath) {
      iconPath = this.iconConfig.windowsIconPath;
    } else {
      iconPath = this.iconConfig.iconPath;
    }

    const icon = nativeImage.createFromPath(iconPath);

    if (icon.isEmpty()) {
      throw new Error(`[TRAY] Failed to load tray icon: ${iconPath}`);
    }

    if (process.platform === "darwin") {
      icon.setTemplateImage(true);
    }

    return icon;
  }

  /**
   * 更新右键菜单
   */
  private updateContextMenu(): void {
    if (!this.tray) return;

    const isVisible = this.mainWindow.isVisible();
    const toggleLabel = isVisible
      ? this.menuConfig.hideWindowLabel
      : this.menuConfig.showWindowLabel;

    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: "SMC-Copilot",
        enabled: false,
      },
      { type: "separator" },
      ...(this.menuConfig.currentProfileLabel
        ? [
            {
              label: `${this.menuConfig.currentProfileLabel}: ${this.currentProfile}`,
              enabled: false,
            },
          ]
        : []),
      ...(this.menuConfig.gatewayStatusLabel
        ? [
            {
              label: `${this.menuConfig.gatewayStatusLabel}: ${
                this.gatewayRunning ? "Running" : "Stopped"
              }`,
              enabled: false,
            },
          ]
        : []),
      { type: "separator" },
      {
        label: toggleLabel,
        click: () => this.toggleWindow(),
      },
      { type: "separator" },
      {
        label: this.menuConfig.quitLabel,
        click: () => {
          this.onQuit();
        },
      },
    ];

    const contextMenu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * 切换窗口显示/隐藏
   */
  private toggleWindow(): void {
    if (this.mainWindow.isVisible()) {
      this.hideWindow();
    } else {
      this.showWindow();
    }
  }

  /**
   * 显示窗口
   */
  private showWindow(): void {
    this.mainWindow.show();
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.focus();
    this.updateContextMenu();
  }

  /**
   * 隐藏窗口
   */
  private hideWindow(): void {
    this.mainWindow.hide();
    this.updateContextMenu();
  }

  /**
   * 检查是否已创建
   */
  isCreated(): boolean {
    return this.tray !== null;
  }
}

// 全局单例
let trayManagerInstance: TrayManager | null = null;

export function createTrayManager(
  mainWindow: BrowserWindow,
  iconConfig?: Partial<TrayIconConfig>,
  menuConfig?: Partial<TrayMenuConfig>,
  onQuit: () => void = () => app.quit(),
): TrayManager {
  const trayIconPath = resolveTrayIconPath();

  const defaultIconConfig: TrayIconConfig = {
    iconPath: trayIconPath,
    macTemplateIconPath: trayIconPath,
    windowsIconPath: trayIconPath,
    ...iconConfig,
  };

  const defaultMenuConfig: TrayMenuConfig = {
    showWindowLabel: "Show Window",
    hideWindowLabel: "Hide Window",
    quitLabel: "Quit",
    gatewayStatusLabel: "Gateway",
    currentProfileLabel: "Profile",
    ...menuConfig,
  };

  trayManagerInstance = new TrayManager(
    mainWindow,
    defaultIconConfig,
    defaultMenuConfig,
    onQuit,
  );
  return trayManagerInstance;
}

export function getTrayManager(): TrayManager | null {
  return trayManagerInstance;
}

export function destroyTrayManager(): void {
  trayManagerInstance?.destroy();
  trayManagerInstance = null;
}
