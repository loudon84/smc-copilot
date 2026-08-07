import { BrowserWindow, shell } from "electron";
import { join } from "path";
import { is } from "../utils/electron-toolkit-wrapper";
import icon from "../../resources/icon.png?asset";
import { bindMainBrowserWindow } from "../window/window-ipc";
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MINIMUM_WINDOW_HEIGHT,
  MINIMUM_WINDOW_WIDTH,
} from "../../shared/shell/main-page-constants";
import { readWindowState, saveWindowState } from "./window-state-store";

/**
 * 主窗口控制器
 *
 * 负责 BrowserWindow 的创建、生命周期管理、事件绑定和窗口状态持久化。
 * 从 src/main/index.ts 抽离，使主进程入口更清晰。
 */
export class MainWindowController {
  private win: BrowserWindow | null = null;

  constructor() {
    this.createWindow();
  }

  /**
   * 获取主窗口实例
   */
  getWindow(): BrowserWindow | null {
    return this.win;
  }

  /**
   * 向 Renderer 发送消息
   */
  sendToRenderer(channel: string, ...args: unknown[]): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(channel, ...args);
    }
  }

  /**
   * 创建主窗口
   */
  private createWindow(): void {
    // 读取保存的窗口状态
    const savedState = readWindowState();

    this.win = new BrowserWindow({
      width: savedState.width || DEFAULT_WINDOW_WIDTH,
      height: savedState.height || DEFAULT_WINDOW_HEIGHT,
      x: savedState.x,
      y: savedState.y,
      minWidth: MINIMUM_WINDOW_WIDTH,
      minHeight: MINIMUM_WINDOW_HEIGHT,
      show: false,
      autoHideMenuBar: false,
      ...(process.platform === "darwin"
        ? {
            titleBarStyle: "hiddenInset" as const,
            trafficLightPosition: { x: 16, y: 16 },
          }
        : {
            frame: false,
            titleBarStyle: "hidden" as const,
          }),
      ...(process.platform === "linux" ? { icon } : {}),
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        webviewTag: true,
      },
    });

    // 如果之前是最大化状态，则最大化
    if (savedState.isMaximized) {
      this.win.maximize();
    }

    // 窗口准备好后显示
    this.win.on("ready-to-show", () => {
      this.win?.show();
    });

    // 渲染进程崩溃处理
    this.win.webContents.on("render-process-gone", (_event, details) => {
      console.error(
        "[CRASH] Renderer process gone:",
        details.reason,
        details.exitCode,
      );
    });

    // 控制台消息转发
    this.win.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        if (level >= 2) {
          console.error(`[RENDERER ERROR] ${message} (${sourceId}:${line})`);
        }
      },
    );

    // 加载失败处理
    this.win.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription) => {
        console.error("[LOAD FAIL]", errorCode, errorDescription);
      },
    );

    // 外部链接处理
    this.win.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });

    // 加载页面
    if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
      this.win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
      this.win.loadFile(join(__dirname, "../renderer/index.html"));
    }

    // 绑定窗口到 IPC 系统
    bindMainBrowserWindow(this.win);

    // 窗口关闭时清理
    this.win.on("closed", () => {
      bindMainBrowserWindow(null);
      this.win = null;
    });

    // 窗口大小/位置变化时保存状态
    this.win.on("resized", () => this.saveState());
    this.win.on("moved", () => this.saveState());
  }

  /**
   * 保存当前窗口状态
   */
  private saveState(): void {
    if (!this.win || this.win.isDestroyed()) return;

    const [width, height] = this.win.getSize();
    const [x, y] = this.win.getPosition();
    const isMaximized = this.win.isMaximized();

    saveWindowState({
      width,
      height,
      x,
      y,
      isMaximized,
    });
  }
}
