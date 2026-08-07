import { BrowserWindow, BrowserWindowConstructorOptions, ipcMain, screen } from "electron";
import { join } from "path";
import { EventEmitter } from "events";
import { is } from "../utils/electron-toolkit-wrapper";

/**
 * 窗口类型
 */
export type WindowType = "main" | "chat" | "settings" | "devtools" | "custom";

/**
 * 窗口配置
 */
export interface WindowConfig {
  /** 窗口类型 */
  type: WindowType;
  /** 窗口 ID */
  id: string;
  /** 父窗口 ID */
  parentId?: string;
  /** 窗口标题 */
  title?: string;
  /** 窗口 URL 或文件路径 */
  url?: string;
  /** 窗口尺寸和位置 */
  bounds?: {
    x?: number;
    y?: number;
    width: number;
    height: number;
  };
  /** 是否记住位置和大小 */
  rememberBounds?: boolean;
  /** 最小尺寸 */
  minSize?: { width: number; height: number };
  /** 最大尺寸 */
  maxSize?: { width: number; height: number };
  /** 是否可调整大小 */
  resizable?: boolean;
  /** 是否显示关闭按钮 */
  closable?: boolean;
  /** 是否最小化到托盘而不是关闭 */
  minimizeToTray?: boolean;
  /** 是否总是在顶部 */
  alwaysOnTop?: boolean;
  /** 是否模态窗口 */
  modal?: boolean;
  /** 额外的 WebPreferences */
  webPreferences?: BrowserWindowConstructorOptions["webPreferences"];
  /** 窗口创建时显示 */
  show?: boolean;
}

/**
 * 窗口实例信息
 */
export interface WindowInstance {
  /** 窗口 ID */
  id: string;
  /** 窗口类型 */
  type: WindowType;
  /** 窗口对象 */
  window: BrowserWindow;
  /** 配置 */
  config: WindowConfig;
  /** 创建时间 */
  createdAt: number;
  /** 最后活动时间 */
  lastActiveAt: number;
  /** 关联的数据 */
  data?: unknown;
}

/**
 * WindowManager - 多窗口管理器
 *
 * 管理所有应用窗口的生命周期：
 * - 创建/销毁窗口
 * - 窗口状态管理
 * - 窗口间通信
 * - 窗口池化（可选）
 */
export class WindowManager extends EventEmitter {
  private windows: Map<string, WindowInstance> = new Map();
  private mainWindowId: string | null = null;
  private preloadPath: string;
  private defaultIcon?: string;
  private windowCounter = 0;

  constructor(preloadPath: string, defaultIcon?: string) {
    super();
    this.preloadPath = preloadPath;
    this.defaultIcon = defaultIcon;
  }

  /**
   * 创建窗口
   */
  createWindow(config: WindowConfig): WindowInstance | null {
    // 如果指定了 ID 且窗口已存在，返回现有窗口
    if (config.id && this.windows.has(config.id)) {
      const existing = this.windows.get(config.id)!;
      existing.window.focus();
      return existing;
    }

    // 生成唯一 ID
    const windowId = config.id || `window-${config.type}-${++this.windowCounter}-${Date.now()}`;

    // 获取父窗口
    let parentWindow: BrowserWindow | undefined;
    if (config.parentId) {
      const parent = this.windows.get(config.parentId);
      if (parent) {
        parentWindow = parent.window;
      }
    }

    // 计算默认位置和大小
    const bounds = this.calculateBounds(config, parentWindow);

    // 构建窗口选项
    const windowOptions: BrowserWindowConstructorOptions = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      minWidth: config.minSize?.width ?? 400,
      minHeight: config.minSize?.height ?? 300,
      maxWidth: config.maxSize?.width,
      maxHeight: config.maxSize?.height,
      resizable: config.resizable ?? true,
      closable: config.closable ?? true,
      alwaysOnTop: config.alwaysOnTop ?? false,
      modal: config.modal ?? false,
      parent: config.modal ? parentWindow : undefined,
      show: false, // 先不显示，加载完成后再显示
      title: config.title || "SMC-Copilot",
      autoHideMenuBar: false,
      icon: this.defaultIcon,
      webPreferences: {
        preload: this.preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true,
        ...config.webPreferences,
      },
      ...(process.platform === "darwin" && config.type === "main"
        ? {
            titleBarStyle: "hiddenInset",
            trafficLightPosition: { x: 16, y: 16 },
          }
        : process.platform !== "darwin"
          ? {
              frame: config.type === "main" ? false : true,
              titleBarStyle: config.type === "main" ? "hidden" : "default",
            }
          : {}),
    };

    try {
      // 创建窗口
      const window = new BrowserWindow(windowOptions);

      // 创建窗口实例
      const instance: WindowInstance = {
        id: windowId,
        type: config.type,
        window,
        config,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };

      // 设置窗口 ID
      (window as unknown as { _windowId: string })._windowId = windowId;

      // 记录主窗口
      if (config.type === "main") {
        this.mainWindowId = windowId;
      }

      // 加载 URL
      this.loadWindowContent(window, config);

      // 绑定事件
      this.bindWindowEvents(window, instance);

      // 保存到 Map
      this.windows.set(windowId, instance);

      console.log(`[WINDOW] Created ${config.type} window: ${windowId}`);
      this.emit("window:created", instance);

      // 显示窗口
      if (config.show !== false) {
        window.once("ready-to-show", () => {
          window.show();
        });
      }

      return instance;
    } catch (err) {
      console.error("[WINDOW] Failed to create window:", err);
      return null;
    }
  }

  /**
   * 加载窗口内容
   */
  private loadWindowContent(window: BrowserWindow, config: WindowConfig): void {
    if (config.url) {
      // 加载指定 URL
      if (config.url.startsWith("http://") || config.url.startsWith("https://")) {
        window.loadURL(config.url);
      } else {
        window.loadFile(config.url);
      }
    } else {
      // 加载默认内容
      switch (config.type) {
        case "main":
          this.loadMainWindow(window);
          break;
        case "chat":
          this.loadChatWindow(window, config);
          break;
        case "settings":
          this.loadSettingsWindow(window);
          break;
        default:
          this.loadMainWindow(window);
      }
    }
  }

  /**
   * 加载主窗口内容
   */
  private loadMainWindow(window: BrowserWindow): void {
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      window.loadFile(join(__dirname, "../renderer/index.html"));
    }
  }

  /**
   * 加载聊天窗口内容
   */
  private loadChatWindow(window: BrowserWindow, config: WindowConfig): void {
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/chat-window/${config.id}`);
    } else {
      window.loadFile(join(__dirname, "../renderer/index.html"), {
        hash: `#/chat-window/${config.id}`,
      });
    }
  }

  /**
   * 加载设置窗口内容
   */
  private loadSettingsWindow(window: BrowserWindow): void {
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      window.loadURL(`${process.env["ELECTRON_RENDERER_URL"]}#/settings`);
    } else {
      window.loadFile(join(__dirname, "../renderer/index.html"), {
        hash: "#/settings",
      });
    }
  }

  /**
   * 绑定窗口事件
   */
  private bindWindowEvents(window: BrowserWindow, instance: WindowInstance): void {
    // 窗口即将关闭
    window.on("close", (event) => {
      // 如果不是主窗口且配置了最小化到托盘
      if (instance.config.type !== "main" && instance.config.minimizeToTray) {
        event.preventDefault();
        window.hide();
        return;
      }

      this.emit("window:close", instance);
    });

    // 窗口已关闭
    window.on("closed", () => {
      this.windows.delete(instance.id);
      this.emit("window:closed", instance);
    });

    // 窗口获得焦点
    window.on("focus", () => {
      instance.lastActiveAt = Date.now();
      this.emit("window:focus", instance);
    });

    // 窗口失去焦点
    window.on("blur", () => {
      this.emit("window:blur", instance);
    });

    // 窗口最大化
    window.on("maximize", () => {
      this.emit("window:maximize", instance);
    });

    // 窗口取消最大化
    window.on("unmaximize", () => {
      this.emit("window:unmaximize", instance);
    });

    // 窗口最小化
    window.on("minimize", () => {
      this.emit("window:minimize", instance);
    });

    // 窗口恢复
    window.on("restore", () => {
      this.emit("window:restore", instance);
    });
  }

  /**
   * 计算窗口位置和大小
   */
  private calculateBounds(
    config: WindowConfig,
    parentWindow?: BrowserWindow,
  ): { x: number; y: number; width: number; height: number } {
    const width = config.bounds?.width ?? 1000;
    const height = config.bounds?.height ?? 700;

    let x = config.bounds?.x;
    let y = config.bounds?.y;

    // 如果有父窗口，相对父窗口居中
    if (parentWindow && config.modal) {
      const parentBounds = parentWindow.getBounds();
      x = parentBounds.x + (parentBounds.width - width) / 2;
      y = parentBounds.y + (parentBounds.height - height) / 2;
    }

    // 如果没有指定位置，使用屏幕居中
    if (x === undefined || y === undefined) {
      const display = screen.getPrimaryDisplay();
      x = (display.workAreaSize.width - width) / 2;
      y = (display.workAreaSize.height - height) / 2;
    }

    return { x, y, width, height };
  }

  /**
   * 获取窗口
   */
  getWindow(id: string): WindowInstance | undefined {
    return this.windows.get(id);
  }

  /**
   * 获取窗口对象
   */
  getBrowserWindow(id: string): BrowserWindow | undefined {
    return this.windows.get(id)?.window;
  }

  /**
   * 获取所有窗口
   */
  getAllWindows(): WindowInstance[] {
    return Array.from(this.windows.values());
  }

  /**
   * 获取特定类型的所有窗口
   */
  getWindowsByType(type: WindowType): WindowInstance[] {
    return this.getAllWindows().filter((w) => w.type === type);
  }

  /**
   * 获取主窗口
   */
  getMainWindow(): WindowInstance | null {
    if (this.mainWindowId) {
      return this.windows.get(this.mainWindowId) || null;
    }
    return null;
  }

  /**
   * 关闭窗口
   */
  closeWindow(id: string): boolean {
    const instance = this.windows.get(id);
    if (!instance) {
      return false;
    }

    instance.window.close();
    return true;
  }

  /**
   * 隐藏窗口
   */
  hideWindow(id: string): boolean {
    const instance = this.windows.get(id);
    if (!instance) {
      return false;
    }

    instance.window.hide();
    return true;
  }

  /**
   * 显示窗口
   */
  showWindow(id: string): boolean {
    const instance = this.windows.get(id);
    if (!instance) {
      return false;
    }

    instance.window.show();
    instance.window.focus();
    return true;
  }

  /**
   * 聚焦窗口
   */
  focusWindow(id: string): boolean {
    const instance = this.windows.get(id);
    if (!instance) {
      return false;
    }

    instance.window.focus();
    return true;
  }

  /**
   * 发送消息到窗口
   */
  sendToWindow(id: string, channel: string, ...args: unknown[]): boolean {
    const instance = this.windows.get(id);
    if (!instance || instance.window.isDestroyed()) {
      return false;
    }

    instance.window.webContents.send(channel, ...args);
    return true;
  }

  /**
   * 广播消息到所有窗口
   */
  broadcast(channel: string, ...args: unknown[]): void {
    for (const instance of this.windows.values()) {
      if (!instance.window.isDestroyed()) {
        instance.window.webContents.send(channel, ...args);
      }
    }
  }

  /**
   * 广播到特定类型的窗口
   */
  broadcastToType(type: WindowType, channel: string, ...args: unknown[]): void {
    for (const instance of this.windows.values()) {
      if (instance.type === type && !instance.window.isDestroyed()) {
        instance.window.webContents.send(channel, ...args);
      }
    }
  }

  /**
   * 获取活动窗口
   */
  getActiveWindow(): WindowInstance | null {
    const focused = BrowserWindow.getFocusedWindow();
    if (!focused) {
      return null;
    }

    const windowId = (focused as unknown as { _windowId: string })._windowId;
    return this.windows.get(windowId) || null;
  }

  /**
   * 销毁所有窗口
   */
  destroyAllWindows(): void {
    // 先关闭所有非主窗口
    for (const [id, instance] of this.windows) {
      if (instance.config.type !== "main") {
        instance.window.destroy();
      }
    }

    // 最后关闭主窗口
    const mainWindow = this.getMainWindow();
    if (mainWindow) {
      mainWindow.window.destroy();
    }

    this.windows.clear();
    this.mainWindowId = null;
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.destroyAllWindows();
    this.removeAllListeners();
  }
}

// 全局单例
let windowManagerInstance: WindowManager | null = null;

export function createWindowManager(preloadPath: string, defaultIcon?: string): WindowManager {
  windowManagerInstance = new WindowManager(preloadPath, defaultIcon);
  return windowManagerInstance;
}

export function getWindowManager(): WindowManager | null {
  return windowManagerInstance;
}

export function destroyWindowManager(): void {
  windowManagerInstance?.destroy();
  windowManagerInstance = null;
}
