import { BrowserWindow } from "electron";
import { EventEmitter } from "events";

/**
 * Shell 全局状态
 */
export interface ShellState {
  /** 当前活跃 Profile */
  activeProfile: string;
  /** Gateway 运行状态 */
  gatewayRunning: boolean;
  /** 连接模式 */
  connectionMode: "local" | "remote" | "ssh";
  /** 当前活跃视图 ID */
  currentView: string;
  /** 显示的 Modals */
  modals: Array<{ key: string; showing: boolean }>;
  /** 显示的 Dropdowns */
  dropdowns: Array<{ key: string; showing: boolean }>;
  /** 窗口是否聚焦 */
  windowFocused: boolean;
  /** 窗口是否最大化 */
  windowMaximized: boolean;
}

/**
 * ShellStateManager - 全局状态管理器
 *
 * 跨视图共享状态，连接 ViewEventBus 与 Renderer。
 */
export class ShellStateManager extends EventEmitter {
  private mainWindow: BrowserWindow;
  private state: ShellState;

  constructor(mainWindow: BrowserWindow) {
    super();
    this.mainWindow = mainWindow;
    this.state = {
      activeProfile: "default",
      gatewayRunning: false,
      connectionMode: "local",
      currentView: "chat",
      modals: [],
      dropdowns: [],
      windowFocused: true,
      windowMaximized: false,
    };

    this.bindWindowEvents();
  }

  /**
   * 获取当前状态
   */
  getState(): ShellState {
    return { ...this.state };
  }

  /**
   * 更新 Profile
   */
  setActiveProfile(profile: string): void {
    if (this.state.activeProfile === profile) return;
    this.state.activeProfile = profile;
    this.notifyStateChange("activeProfile", profile);
  }

  /**
   * 更新 Gateway 状态
   */
  setGatewayRunning(running: boolean): void {
    if (this.state.gatewayRunning === running) return;
    this.state.gatewayRunning = running;
    this.notifyStateChange("gatewayRunning", running);
  }

  /**
   * 更新连接模式
   */
  setConnectionMode(mode: "local" | "remote" | "ssh"): void {
    if (this.state.connectionMode === mode) return;
    this.state.connectionMode = mode;
    this.notifyStateChange("connectionMode", mode);
  }

  /**
   * 更新当前视图
   */
  setCurrentView(viewId: string): void {
    if (this.state.currentView === viewId) return;
    this.state.currentView = viewId;
    this.notifyStateChange("currentView", viewId);
  }

  /**
   * 添加 Modal
   */
  addModal(key: string): void {
    if (this.state.modals.some((m) => m.key === key)) return;
    this.state.modals.push({ key, showing: true });
    this.notifyStateChange("modals", this.state.modals);
  }

  /**
   * 移除 Modal
   */
  removeModal(key: string): void {
    const index = this.state.modals.findIndex((m) => m.key === key);
    if (index === -1) return;
    this.state.modals.splice(index, 1);
    this.notifyStateChange("modals", this.state.modals);
  }

  /**
   * 添加 Dropdown
   */
  addDropdown(key: string): void {
    if (this.state.dropdowns.some((d) => d.key === key)) return;
    this.state.dropdowns.push({ key, showing: true });
    this.notifyStateChange("dropdowns", this.state.dropdowns);
  }

  /**
   * 移除 Dropdown
   */
  removeDropdown(key: string): void {
    const index = this.state.dropdowns.findIndex((d) => d.key === key);
    if (index === -1) return;
    this.state.dropdowns.splice(index, 1);
    this.notifyStateChange("dropdowns", this.state.dropdowns);
  }

  /**
   * 通知 Renderer 状态变更
   */
  private notifyStateChange<K extends keyof ShellState>(
    key: K,
    value: ShellState[K]
  ): void {
    this.emit("stateChange", key, value, this.state);
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("shell:state-change", {
        key,
        value,
        state: this.state,
      });
    }
  }

  /**
   * 绑定窗口事件
   */
  private bindWindowEvents(): void {
    this.mainWindow.on("focus", () => {
      this.state.windowFocused = true;
      this.notifyStateChange("windowFocused", true);
    });

    this.mainWindow.on("blur", () => {
      this.state.windowFocused = false;
      this.notifyStateChange("windowFocused", false);
    });

    this.mainWindow.on("maximize", () => {
      this.state.windowMaximized = true;
      this.notifyStateChange("windowMaximized", true);
    });

    this.mainWindow.on("unmaximize", () => {
      this.state.windowMaximized = false;
      this.notifyStateChange("windowMaximized", false);
    });
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.removeAllListeners();
  }
}

// 全局单例（在 index.ts 中初始化）
let shellStateManager: ShellStateManager | null = null;

export function createShellStateManager(mainWindow: BrowserWindow): ShellStateManager {
  shellStateManager = new ShellStateManager(mainWindow);
  return shellStateManager;
}

export function getShellStateManager(): ShellStateManager | null {
  return shellStateManager;
}
