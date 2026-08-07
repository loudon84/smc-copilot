import { globalShortcut, app, ipcMain, BrowserWindow } from "electron";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { profileHome } from "../utils";

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
  /** 快捷键 ID */
  id: string;
  /** 快捷键名称 */
  name: string;
  /** 快捷键描述 */
  description: string;
  /** 快捷键组合 (Electron Accelerator 格式) */
  accelerator: string;
  /** 是否启用 */
  enabled: boolean;
  /** 是否全局快捷键 */
  global: boolean;
  /** 动作类型 */
  action: string;
  /** 动作数据 */
  actionData?: unknown;
}

/**
 * 快捷键配置存储
 */
interface ShortcutsStorage {
  version: number;
  shortcuts: ShortcutConfig[];
  conflicts: string[];
}

/**
 * 默认快捷键配置
 */
const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  {
    id: "toggle-window",
    name: "Toggle Window",
    description: "Show or hide the main window",
    accelerator: "CmdOrCtrl+Shift+H",
    enabled: true,
    global: true,
    action: "window.toggle",
  },
  {
    id: "new-chat",
    name: "New Chat",
    description: "Start a new chat session",
    accelerator: "CmdOrCtrl+N",
    enabled: true,
    global: false,
    action: "chat.new",
  },
  {
    id: "quick-action",
    name: "Quick Action",
    description: "Open quick actions menu",
    accelerator: "CmdOrCtrl+Shift+P",
    enabled: true,
    global: true,
    action: "palette.open",
  },
  {
    id: "command-palette",
    name: "Command Palette",
    description: "Open command palette",
    accelerator: "CmdOrCtrl+Shift+K",
    enabled: true,
    global: false,
    action: "palette.open",
  },
  {
    id: "focus-input",
    name: "Focus Input",
    description: "Focus chat input field",
    accelerator: "CmdOrCtrl+L",
    enabled: true,
    global: false,
    action: "chat.focus",
  },
  {
    id: "toggle-theme",
    name: "Toggle Theme",
    description: "Toggle between light and dark mode",
    accelerator: "CmdOrCtrl+Shift+L",
    enabled: true,
    global: false,
    action: "theme.toggle",
  },
  {
    id: "settings",
    name: "Settings",
    description: "Open settings",
    accelerator: "CmdOrCtrl+,",
    enabled: true,
    global: false,
    action: "settings.open",
  },
];

/**
 * ShortcutManager - 全局快捷键管理器
 *
 * 功能：
 * - 管理全局/应用内快捷键
 * - 快捷键配置持久化
 * - 冲突检测
 * - 与主窗口集成
 */
export class ShortcutManager extends EventEmitter {
  private shortcuts: Map<string, ShortcutConfig> = new Map();
  private registeredGlobals: Set<string> = new Set();
  private configPath: string;
  private mainWindow: BrowserWindow | null = null;
  private conflictCheckEnabled = true;

  constructor() {
    super();
    this.configPath = join(profileHome(), "desktop", "shortcuts.json");
    this.loadShortcuts();
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * 注册所有启用的全局快捷键
   */
  registerAll(): void {
    this.unregisterAll();

    for (const shortcut of this.shortcuts.values()) {
      if (shortcut.enabled && shortcut.global) {
        this.registerGlobal(shortcut);
      }
    }

    console.log("[SHORTCUT] Registered all shortcuts");
  }

  /**
   * 注销所有全局快捷键
   */
  unregisterAll(): void {
    for (const accelerator of this.registeredGlobals) {
      globalShortcut.unregister(accelerator);
    }
    this.registeredGlobals.clear();
    console.log("[SHORTCUT] Unregistered all shortcuts");
  }

  /**
   * 注册单个全局快捷键
   */
  private registerGlobal(shortcut: ShortcutConfig): boolean {
    if (!shortcut.global || !shortcut.enabled) {
      return false;
    }

    try {
      const success = globalShortcut.register(shortcut.accelerator, () => {
        this.handleShortcut(shortcut);
      });

      if (success) {
        this.registeredGlobals.add(shortcut.accelerator);
        console.log(`[SHORTCUT] Registered: ${shortcut.id} (${shortcut.accelerator})`);
        return true;
      } else {
        console.warn(`[SHORTCUT] Failed to register: ${shortcut.id} (${shortcut.accelerator})`);
        return false;
      }
    } catch (err) {
      console.error(`[SHORTCUT] Error registering ${shortcut.id}:`, err);
      return false;
    }
  }

  /**
   * 注销单个全局快捷键
   */
  private unregisterGlobal(accelerator: string): void {
    if (this.registeredGlobals.has(accelerator)) {
      globalShortcut.unregister(accelerator);
      this.registeredGlobals.delete(accelerator);
    }
  }

  /**
   * 处理快捷键触发
   */
  private handleShortcut(shortcut: ShortcutConfig): void {
    console.log(`[SHORTCUT] Triggered: ${shortcut.id} (${shortcut.action})`);
    
    // 发送事件给监听者
    this.emit("shortcut", shortcut);
    
    // 执行内置动作
    this.executeAction(shortcut);
  }

  /**
   * 执行快捷键动作
   */
  private executeAction(shortcut: ShortcutConfig): void {
    switch (shortcut.action) {
      case "window.toggle":
        this.toggleWindow();
        break;
      case "window.show":
        this.showWindow();
        break;
      case "window.hide":
        this.hideWindow();
        break;
      case "chat.new":
        this.sendToRenderer("shortcut:new-chat");
        break;
      case "chat.focus":
        this.sendToRenderer("shortcut:focus-input");
        break;
      case "palette.open":
        this.sendToRenderer("shortcut:open-palette");
        break;
      case "theme.toggle":
        this.sendToRenderer("shortcut:toggle-theme");
        break;
      case "settings.open":
        this.sendToRenderer("shortcut:open-settings");
        break;
      default:
        // 自定义动作通过事件发出
        this.emit("action", shortcut.action, shortcut.actionData);
    }
  }

  /**
   * 切换窗口显示/隐藏
   */
  private toggleWindow(): void {
    if (!this.mainWindow) return;

    if (this.mainWindow.isVisible() && this.mainWindow.isFocused()) {
      this.mainWindow.hide();
    } else {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 显示窗口
   */
  private showWindow(): void {
    if (!this.mainWindow) return;
    this.mainWindow.show();
    this.mainWindow.focus();
  }

  /**
   * 隐藏窗口
   */
  private hideWindow(): void {
    if (!this.mainWindow) return;
    this.mainWindow.hide();
  }

  /**
   * 发送消息到 Renderer
   */
  private sendToRenderer(channel: string, data?: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 获取所有快捷键
   */
  getAllShortcuts(): ShortcutConfig[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * 获取单个快捷键
   */
  getShortcut(id: string): ShortcutConfig | undefined {
    return this.shortcuts.get(id);
  }

  /**
   * 更新快捷键
   */
  updateShortcut(id: string, updates: Partial<ShortcutConfig>): boolean {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) {
      return false;
    }

    // 如果修改了 accelerator 或 enabled，需要重新注册
    const needsReregister = 
      updates.accelerator !== undefined || 
      updates.enabled !== undefined ||
      updates.global !== undefined;

    const oldAccelerator = shortcut.accelerator;

    // 应用更新
    Object.assign(shortcut, updates);

    // 重新注册全局快捷键
    if (needsReregister && shortcut.global) {
      this.unregisterGlobal(oldAccelerator);
      if (shortcut.enabled) {
        this.registerGlobal(shortcut);
      }
    }

    this.saveShortcuts();
    this.emit("updated", shortcut);

    return true;
  }

  /**
   * 添加快捷键
   */
  addShortcut(shortcut: ShortcutConfig): boolean {
    if (this.shortcuts.has(shortcut.id)) {
      console.warn(`[SHORTCUT] Shortcut ${shortcut.id} already exists`);
      return false;
    }

    // 检查冲突
    if (this.conflictCheckEnabled) {
      const conflicts = this.checkConflicts(shortcut.accelerator);
      if (conflicts.length > 0) {
        console.warn(`[SHORTCUT] Conflict detected for ${shortcut.id}:`, conflicts);
      }
    }

    this.shortcuts.set(shortcut.id, shortcut);

    if (shortcut.enabled && shortcut.global) {
      this.registerGlobal(shortcut);
    }

    this.saveShortcuts();
    this.emit("added", shortcut);

    return true;
  }

  /**
   * 删除快捷键
   */
  removeShortcut(id: string): boolean {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) {
      return false;
    }

    // 注销全局快捷键
    if (shortcut.global) {
      this.unregisterGlobal(shortcut.accelerator);
    }

    this.shortcuts.delete(id);
    this.saveShortcuts();
    this.emit("removed", shortcut);

    return true;
  }

  /**
   * 检查快捷键冲突
   */
  checkConflicts(accelerator: string, excludeId?: string): string[] {
    const conflicts: string[] = [];

    for (const [id, shortcut] of this.shortcuts) {
      if (id !== excludeId && shortcut.accelerator === accelerator && shortcut.enabled) {
        conflicts.push(id);
      }
    }

    // 检查系统全局快捷键（仅限 macOS）
    if (process.platform === "darwin") {
      // 这里可以添加与系统快捷键的冲突检测
    }

    return conflicts;
  }

  /**
   * 验证快捷键格式
   */
  validateAccelerator(accelerator: string): boolean {
    // 基本的加速器格式验证
    // Electron 加速器格式: CmdOrCtrl+Shift+A, Alt+F4, etc.
    const validModifiers = ["Cmd", "Ctrl", "CmdOrCtrl", "Alt", "Shift", "Super"];
    const parts = accelerator.split("+");

    if (parts.length === 0) {
      return false;
    }

    // 最后一个部分应该是键码
    const key = parts[parts.length - 1];
    if (!key || key.length === 0) {
      return false;
    }

    // 前面的部分应该是修饰键
    for (let i = 0; i < parts.length - 1; i++) {
      if (!validModifiers.includes(parts[i])) {
        return false;
      }
    }

    return true;
  }

  /**
   * 加载快捷键配置
   */
  private loadShortcuts(): void {
    try {
      if (existsSync(this.configPath)) {
        const data = readFileSync(this.configPath, "utf-8");
        const storage: ShortcutsStorage = JSON.parse(data);

        // 加载保存的快捷键
        for (const shortcut of storage.shortcuts) {
          this.shortcuts.set(shortcut.id, shortcut);
        }

        // 合并默认快捷键（添加新增的默认快捷键）
        for (const defaultShortcut of DEFAULT_SHORTCUTS) {
          if (!this.shortcuts.has(defaultShortcut.id)) {
            this.shortcuts.set(defaultShortcut.id, { ...defaultShortcut });
          }
        }

        console.log(`[SHORTCUT] Loaded ${this.shortcuts.size} shortcuts`);
      } else {
        // 使用默认快捷键
        for (const shortcut of DEFAULT_SHORTCUTS) {
          this.shortcuts.set(shortcut.id, { ...shortcut });
        }
        this.saveShortcuts();
        console.log("[SHORTCUT] Using default shortcuts");
      }
    } catch (err) {
      console.error("[SHORTCUT] Failed to load shortcuts:", err);
      // 使用默认快捷键
      for (const shortcut of DEFAULT_SHORTCUTS) {
        this.shortcuts.set(shortcut.id, { ...shortcut });
      }
    }
  }

  /**
   * 保存快捷键配置
   */
  private saveShortcuts(): void {
    try {
      const dir = join(profileHome(), "desktop");
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const storage: ShortcutsStorage = {
        version: 1,
        shortcuts: Array.from(this.shortcuts.values()),
        conflicts: [],
      };

      writeFileSync(this.configPath, JSON.stringify(storage, null, 2));
    } catch (err) {
      console.error("[SHORTCUT] Failed to save shortcuts:", err);
    }
  }

  /**
   * 重置为默认快捷键
   */
  resetToDefaults(): void {
    this.unregisterAll();
    this.shortcuts.clear();

    for (const shortcut of DEFAULT_SHORTCUTS) {
      this.shortcuts.set(shortcut.id, { ...shortcut });
    }

    this.saveShortcuts();
    this.registerAll();
    this.emit("reset");

    console.log("[SHORTCUT] Reset to defaults");
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.unregisterAll();
    this.removeAllListeners();
  }
}

// 全局单例
let shortcutManagerInstance: ShortcutManager | null = null;

export function createShortcutManager(): ShortcutManager {
  shortcutManagerInstance = new ShortcutManager();
  return shortcutManagerInstance;
}

export function getShortcutManager(): ShortcutManager | null {
  return shortcutManagerInstance;
}

export function destroyShortcutManager(): void {
  shortcutManagerInstance?.destroy();
  shortcutManagerInstance = null;
}
