/**
 * Plugin API 契约
 *
 * 定义插件系统与 Shell 之间的接口规范。
 * 插件拥有完整 Node.js 访问权限（无沙箱）。
 */

import type { BrowserWindow } from "electron";
import type { EventEmitter } from "events";

/**
 * 插件清单
 */
export interface PluginManifest {
  /** 插件 ID（唯一标识符） */
  id: string;
  /** 插件名称 */
  name: string;
  /** 版本号（semver） */
  version: string;
  /** 描述 */
  description?: string;
  /** 作者 */
  author?: string | { name: string; email?: string };
  /** 插件入口文件（相对路径） */
  main: string;
  /** 支持的 Shell 版本范围 */
  engines?: {
    shell?: string;
  };
  /** 激活事件 */
  activationEvents?: string[];
  /** 贡献点 */
  contributes?: PluginContributes;
  /** 依赖的其他插件 */
  dependencies?: Record<string, string>;
  /** 许可证 */
  license?: string;
  /** 主页 URL */
  homepage?: string;
  /** 仓库 URL */
  repository?: string;
}

/**
 * 插件贡献点
 */
export interface PluginContributes {
  /** 命令 */
  commands?: Array<{
    id: string;
    title: string;
    category?: string;
    icon?: string;
    keybinding?: string;
  }>;
  /** 菜单项 */
  menus?: Record<string, Array<{
    command: string;
    group?: string;
    when?: string;
  }>>;
  /** 配置项 */
  configuration?: {
    title?: string;
    properties?: Record<string, {
      type: string;
      default?: unknown;
      description?: string;
      enum?: unknown[];
    }>;
  };
  /** 视图容器 */
  views?: Record<string, Array<{
    id: string;
    name: string;
    when?: string;
  }>>;
  /** 侧边栏视图 */
  viewsContainers?: Record<string, Array<{
    id: string;
    title: string;
    icon: string;
  }>>;
  /** 快捷键 */
  keybindings?: Array<{
    command: string;
    key: string;
    when?: string;
  }>;
}

/**
 * 插件上下文
 * 每个插件实例获得的上下文对象
 */
export interface PluginContext {
  /** 插件 ID */
  readonly id: string;
  /** 插件版本 */
  readonly version: string;
  /** 插件目录 */
  readonly extensionPath: string;
  /** 插件数据存储路径 */
  readonly storagePath: string;
  /** 全局状态存储 */
  readonly globalState: PluginStorage;
  /** 工作区状态存储 */
  readonly workspaceState: PluginStorage;
  /** 日志记录器 */
  readonly logger: PluginLogger;
  /** 环境变量 */
  readonly environment: Record<string, string | undefined>;
  /** 订阅管理 */
  readonly subscriptions: PluginSubscription[];
  /** 注册清理函数 */
  onDidDispose: (callback: () => void) => void;
}

/**
 * 插件存储
 */
export interface PluginStorage {
  get<T>(key: string, defaultValue?: T): T | undefined;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): string[];
}

/**
 * 插件日志记录器
 */
export interface PluginLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * 插件订阅
 */
export interface PluginSubscription {
  dispose(): void;
}

/**
 * 插件 API 接口
 * Shell 暴露给插件的 API
 */
export interface PluginAPI {
  /** 版本 */
  readonly version: string;
  /** 事件总线 */
  readonly events: EventEmitter;
  /** 主窗口 */
  readonly window: BrowserWindow | null;
  
  // 命令系统
  commands: {
    registerCommand(id: string, callback: (...args: unknown[]) => unknown): PluginSubscription;
    executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined>;
  };
  
  // UI 集成
  ui: {
    showNotification(message: string, options?: NotificationOptions): void;
    showModal(key: string, data?: unknown): Promise<unknown>;
    showDropdown(key: string, anchor: unknown, data?: unknown): Promise<unknown>;
    createWebviewPanel(id: string, title: string, options?: WebviewOptions): WebviewPanel;
  };
  
  // 存储
  storage: {
    global: PluginStorage;
    workspace: PluginStorage;
    secrets: SecretStorage;
  };
  
  // 网络
  network: {
    fetch(url: string, options?: RequestInit): Promise<Response>;
    createServer(port: number, handler: (req: unknown, res: unknown) => void): unknown;
  };
  
  // 文件系统（受限路径）
  fs: {
    readFile(path: string, encoding?: string): Promise<string | Buffer>;
    writeFile(path: string, data: string | Buffer): Promise<void>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string, recursive?: boolean): Promise<void>;
    readdir(path: string): Promise<string[]>;
    watch(path: string, callback: (event: string, filename: string) => void): PluginSubscription;
  };
  
  // 进程（受限）
  process: {
    spawn(command: string, args?: string[], options?: unknown): ChildProcess;
    exec(command: string, options?: unknown): Promise<{ stdout: string; stderr: string }>;
  };
  
  // Shell 集成
  shell: {
    openExternal(url: string): Promise<void>;
    showItemInFolder(path: string): void;
    beep(): void;
  };
  
  // 状态
  state: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
    onDidChange<T>(key: string, callback: (value: T | undefined) => void): PluginSubscription;
  };
}

/**
 * 通知选项
 */
export interface NotificationOptions {
  type?: "info" | "warning" | "error" | "success";
  duration?: number;
  actions?: Array<{
    id: string;
    label: string;
  }>;
}

/**
 * Webview 选项
 */
export interface WebviewOptions {
  preserveFocus?: boolean;
  viewColumn?: number;
  localResourceRoots?: string[];
}

/**
 * Webview Panel
 */
export interface WebviewPanel {
  readonly id: string;
  readonly title: string;
  readonly visible: boolean;
  readonly active: boolean;
  readonly webview: Webview;
  
  reveal(): void;
  hide(): void;
  dispose(): void;
  
  onDidDispose: (callback: () => void) => PluginSubscription;
  onDidChangeViewState: (callback: (e: { visible: boolean; active: boolean }) => void) => PluginSubscription;
}

/**
 * Webview
 */
export interface Webview {
  html: string;
  options: WebviewOptions;
  postMessage(message: unknown): void;
  onDidReceiveMessage: (callback: (message: unknown) => void) => PluginSubscription;
}

/**
 * 子进程
 */
export interface ChildProcess {
  readonly pid: number;
  readonly stdout: EventEmitter;
  readonly stderr: EventEmitter;
  readonly stdin: EventEmitter;
  
  kill(signal?: string): boolean;
  on(event: "exit", callback: (code: number | null, signal: string | null) => void): void;
  on(event: "error", callback: (error: Error) => void): void;
}

/**
 * Secret Storage
 */
export interface SecretStorage {
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * 插件激活函数签名
 */
export type PluginActivateFunction = (context: PluginContext, api: PluginAPI) => void | Promise<void>;

/**
 * 插件停用函数签名
 */
export type PluginDeactivateFunction = () => void | Promise<void>;

/**
 * 加载的插件
 */
export interface LoadedPlugin {
  /** 插件清单 */
  manifest: PluginManifest;
  /** 插件目录 */
  path: string;
  /** 是否已激活 */
  activated: boolean;
  /** 上下文（激活后可用） */
  context?: PluginContext;
  /** 激活函数 */
  activate?: PluginActivateFunction;
  /** 停用函数 */
  deactivate?: PluginDeactivateFunction;
  /** 导出对象 */
  exports?: unknown;
  /** 激活时间 */
  activateTime?: number;
  /** 加载错误 */
  error?: Error;
}

/**
 * 插件事件
 */
export interface PluginEvents {
  "plugin:loaded": (plugin: LoadedPlugin) => void;
  "plugin:activated": (plugin: LoadedPlugin) => void;
  "plugin:deactivated": (plugin: LoadedPlugin) => void;
  "plugin:unloaded": (pluginId: string) => void;
  "plugin:error": (pluginId: string, error: Error) => void;
}
