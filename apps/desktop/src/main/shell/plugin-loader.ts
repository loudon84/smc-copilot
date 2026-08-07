import { readdirSync, existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { EventEmitter } from "events";
import { app } from "electron";
import type {
  PluginManifest,
  LoadedPlugin,
  PluginContext,
  PluginAPI,
  PluginStorage,
  PluginLogger,
  PluginSubscription,
  PluginActivateFunction,
  PluginDeactivateFunction,
} from "../../shared/plugin/plugin-contract";
import { profileHome } from "../utils";

/**
 * 插件加载器
 *
 * 负责：
 * - 扫描插件目录
 * - 加载插件清单
 * - 验证插件
 * - 管理插件生命周期
 */
export class PluginLoader extends EventEmitter {
  private pluginsDir: string;
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private pluginAPI: PluginAPI | null = null;
  private storageDir: string;

  constructor(pluginAPI?: PluginAPI) {
    super();
    this.pluginsDir = join(profileHome(), "plugins");
    this.storageDir = join(profileHome(), "desktop", "plugin-storage");
    this.pluginAPI = pluginAPI || null;
  }

  /**
   * 设置插件 API
   */
  setPluginAPI(api: PluginAPI): void {
    this.pluginAPI = api;
  }

  /**
   * 扫描并加载所有插件
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    console.log("[PLUGIN] Scanning plugins directory:", this.pluginsDir);

    if (!existsSync(this.pluginsDir)) {
      console.log("[PLUGIN] Plugins directory does not exist, creating...");
      return [];
    }

    const entries = readdirSync(this.pluginsDir);
    const plugins: LoadedPlugin[] = [];

    for (const entry of entries) {
      const pluginPath = join(this.pluginsDir, entry);
      const stat = statSync(pluginPath);

      if (!stat.isDirectory()) {
        continue;
      }

      try {
        const plugin = await this.loadPlugin(pluginPath);
        if (plugin) {
          plugins.push(plugin);
          this.loadedPlugins.set(plugin.manifest.id, plugin);
          this.emit("plugin:loaded", plugin);
        }
      } catch (err) {
        console.error(`[PLUGIN] Failed to load plugin at ${pluginPath}:`, err);
        this.emit("plugin:error", entry, err);
      }
    }

    console.log(`[PLUGIN] Loaded ${plugins.length} plugins`);
    return plugins;
  }

  /**
   * 加载单个插件
   */
  async loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
    const manifestPath = join(pluginPath, "package.json");

    if (!existsSync(manifestPath)) {
      console.warn(`[PLUGIN] No package.json found at ${pluginPath}`);
      return null;
    }

    // 读取并解析清单
    const manifestContent = readFileSync(manifestPath, "utf-8");
    const manifest: PluginManifest = JSON.parse(manifestContent);

    // 验证清单
    if (!this.validateManifest(manifest)) {
      throw new Error(`Invalid manifest for plugin at ${pluginPath}`);
    }

    // 检查版本兼容性
    if (!this.checkCompatibility(manifest)) {
      console.warn(`[PLUGIN] Plugin ${manifest.id} is not compatible with current Shell version`);
    }

    // 检查是否已加载
    if (this.loadedPlugins.has(manifest.id)) {
      console.warn(`[PLUGIN] Plugin ${manifest.id} is already loaded`);
      return this.loadedPlugins.get(manifest.id)!;
    }

    // 创建插件对象
    const plugin: LoadedPlugin = {
      manifest,
      path: pluginPath,
      activated: false,
    };

    // 尝试加载主入口
    const mainPath = join(pluginPath, manifest.main);
    if (existsSync(mainPath)) {
      try {
        // 清除 require 缓存
        delete require.cache[require.resolve(mainPath)];
        
        // 加载模块
        const module = require(mainPath);
        
        plugin.activate = module.activate as PluginActivateFunction;
        plugin.deactivate = module.deactivate as PluginDeactivateFunction;
        plugin.exports = module;
      } catch (err) {
        console.error(`[PLUGIN] Failed to load module for ${manifest.id}:`, err);
        plugin.error = err as Error;
      }
    }

    return plugin;
  }

  /**
   * 激活插件
   */
  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      console.error(`[PLUGIN] Plugin ${pluginId} not found`);
      return false;
    }

    if (plugin.activated) {
      console.warn(`[PLUGIN] Plugin ${pluginId} is already activated`);
      return true;
    }

    if (!plugin.activate) {
      console.warn(`[PLUGIN] Plugin ${pluginId} has no activate function`);
      return false;
    }

    try {
      console.log(`[PLUGIN] Activating plugin: ${pluginId}`);
      const startTime = Date.now();

      // 创建上下文
      const context = this.createContext(plugin);
      plugin.context = context;

      // 调用激活函数
      await plugin.activate(context, this.pluginAPI!);

      plugin.activated = true;
      plugin.activateTime = Date.now() - startTime;

      console.log(`[PLUGIN] Plugin ${pluginId} activated in ${plugin.activateTime}ms`);
      this.emit("plugin:activated", plugin);

      return true;
    } catch (err) {
      console.error(`[PLUGIN] Failed to activate plugin ${pluginId}:`, err);
      plugin.error = err as Error;
      this.emit("plugin:error", pluginId, err);
      return false;
    }
  }

  /**
   * 停用插件
   */
  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      console.error(`[PLUGIN] Plugin ${pluginId} not found`);
      return false;
    }

    if (!plugin.activated) {
      console.warn(`[PLUGIN] Plugin ${pluginId} is not activated`);
      return true;
    }

    try {
      console.log(`[PLUGIN] Deactivating plugin: ${pluginId}`);

      // 调用停用函数
      if (plugin.deactivate) {
        await plugin.deactivate();
      }

      // 清理订阅
      if (plugin.context?.subscriptions) {
        for (const subscription of plugin.context.subscriptions) {
          try {
            subscription.dispose();
          } catch (err) {
            console.error(`[PLUGIN] Error disposing subscription:`, err);
          }
        }
        plugin.context.subscriptions.length = 0;
      }

      plugin.activated = false;

      console.log(`[PLUGIN] Plugin ${pluginId} deactivated`);
      this.emit("plugin:deactivated", plugin);

      return true;
    } catch (err) {
      console.error(`[PLUGIN] Error during deactivation of ${pluginId}:`, err);
      this.emit("plugin:error", pluginId, err);
      return false;
    }
  }

  /**
   * 卸载插件
   */
  async unloadPlugin(pluginId: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin) {
      return false;
    }

    // 先停用
    if (plugin.activated) {
      await this.deactivatePlugin(pluginId);
    }

    // 从 Map 中移除
    this.loadedPlugins.delete(pluginId);
    
    this.emit("plugin:unloaded", pluginId);
    console.log(`[PLUGIN] Plugin ${pluginId} unloaded`);

    return true;
  }

  /**
   * 激活所有插件
   */
  async activateAll(): Promise<void> {
    console.log("[PLUGIN] Activating all plugins...");

    for (const [pluginId, plugin] of this.loadedPlugins) {
      // 检查激活事件
      if (plugin.manifest.activationEvents) {
        // 如果有激活事件，等待相应事件触发
        // 这里简化处理，直接激活
      }

      await this.activatePlugin(pluginId);
    }
  }

  /**
   * 停用所有插件
   */
  async deactivateAll(): Promise<void> {
    console.log("[PLUGIN] Deactivating all plugins...");

    // 逆序停用，保持依赖关系
    const plugins = Array.from(this.loadedPlugins.values()).reverse();

    for (const plugin of plugins) {
      if (plugin.activated) {
        await this.deactivatePlugin(plugin.manifest.id);
      }
    }
  }

  /**
   * 获取所有已加载的插件
   */
  getAllPlugins(): LoadedPlugin[] {
    return Array.from(this.loadedPlugins.values());
  }

  /**
   * 获取单个插件
   */
  getPlugin(pluginId: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(pluginId);
  }

  /**
   * 验证插件清单
   */
  private validateManifest(manifest: PluginManifest): boolean {
    if (!manifest.id) {
      console.error("[PLUGIN] Manifest missing 'id'");
      return false;
    }

    if (!manifest.name) {
      console.error("[PLUGIN] Manifest missing 'name'");
      return false;
    }

    if (!manifest.version) {
      console.error("[PLUGIN] Manifest missing 'version'");
      return false;
    }

    if (!manifest.main) {
      console.error("[PLUGIN] Manifest missing 'main'");
      return false;
    }

    // ID 格式验证（只允许字母、数字、连字符、下划线、点）
    const idRegex = /^[a-zA-Z0-9._-]+$/;
    if (!idRegex.test(manifest.id)) {
      console.error(`[PLUGIN] Invalid plugin ID: ${manifest.id}`);
      return false;
    }

    return true;
  }

  /**
   * 检查版本兼容性
   */
  private checkCompatibility(manifest: PluginManifest): boolean {
    if (!manifest.engines?.shell) {
      // 没有指定引擎版本，假设兼容
      return true;
    }

    // 这里应该实现 semver 版本比较
    // 简化处理，只检查主要版本
    const shellVersion = app.getVersion();
    const requiredVersion = manifest.engines.shell;

    // 移除 ^ ~ 等前缀
    const cleanRequired = requiredVersion.replace(/^[\^~]/, "");
    const cleanShell = shellVersion.replace(/^[\^~]/, "");

    const [requiredMajor] = cleanRequired.split(".").map(Number);
    const [shellMajor] = cleanShell.split(".").map(Number);

    return shellMajor >= requiredMajor;
  }

  /**
   * 创建插件上下文
   */
  private createContext(plugin: LoadedPlugin): PluginContext {
    const pluginStorageDir = join(this.storageDir, plugin.manifest.id);

    const context: PluginContext = {
      id: plugin.manifest.id,
      version: plugin.manifest.version,
      extensionPath: plugin.path,
      storagePath: pluginStorageDir,
      globalState: this.createStorage(join(pluginStorageDir, "global.json")),
      workspaceState: this.createStorage(join(pluginStorageDir, "workspace.json")),
      logger: this.createLogger(plugin.manifest.id),
      environment: { ...process.env },
      subscriptions: [],
      onDidDispose: (callback: () => void) => {
        // 在停用时会调用这些回调
        context.subscriptions.push({ dispose: callback });
      },
    };

    return context;
  }

  /**
   * 创建存储对象
   */
  private createStorage(filePath: string): PluginStorage {
    const data: Map<string, unknown> = new Map();

    // 加载已有数据
    try {
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(content);
        for (const [key, value] of Object.entries(parsed)) {
          data.set(key, value);
        }
      }
    } catch (err) {
      console.error(`[PLUGIN] Failed to load storage from ${filePath}:`, err);
    }

    return {
      get: <T>(key: string, defaultValue?: T): T | undefined => {
        return (data.get(key) as T) ?? defaultValue;
      },
      set: async <T>(key: string, value: T): Promise<void> => {
        data.set(key, value);
        // 这里应该异步保存到文件
      },
      remove: async (key: string): Promise<void> => {
        data.delete(key);
      },
      keys: (): string[] => {
        return Array.from(data.keys());
      },
    };
  }

  /**
   * 创建日志记录器
   */
  private createLogger(pluginId: string): PluginLogger {
    const prefix = `[PLUGIN:${pluginId}]`;

    return {
      trace: (message: string, ...args: unknown[]) => {
        console.log(`${prefix} [TRACE] ${message}`, ...args);
      },
      debug: (message: string, ...args: unknown[]) => {
        console.log(`${prefix} [DEBUG] ${message}`, ...args);
      },
      info: (message: string, ...args: unknown[]) => {
        console.log(`${prefix} [INFO] ${message}`, ...args);
      },
      warn: (message: string, ...args: unknown[]) => {
        console.warn(`${prefix} [WARN] ${message}`, ...args);
      },
      error: (message: string, ...args: unknown[]) => {
        console.error(`${prefix} [ERROR] ${message}`, ...args);
      },
    };
  }

  /**
   * 销毁加载器
   */
  async destroy(): Promise<void> {
    await this.deactivateAll();
    this.loadedPlugins.clear();
    this.removeAllListeners();
  }
}

// 全局单例
let pluginLoaderInstance: PluginLoader | null = null;

export function createPluginLoader(pluginAPI?: PluginAPI): PluginLoader {
  pluginLoaderInstance = new PluginLoader(pluginAPI);
  return pluginLoaderInstance;
}

export function getPluginLoader(): PluginLoader | null {
  return pluginLoaderInstance;
}

export function destroyPluginLoader(): Promise<void> {
  return pluginLoaderInstance?.destroy() ?? Promise.resolve();
}
