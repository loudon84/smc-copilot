import { ipcRenderer } from "electron";
import type { StartupDecision } from "../shared/startup/startup-contract";

/**
 * Shell API - 桌面壳层基础能力
 *
 * 从 hermesAPI 抽离的壳层相关 API，通过 window.smcShell 暴露。
 * 与 hermesAPI 共存，新代码优先使用 smcShell。
 */

export const shellApi = {
  /**
   * 解析启动决策
   *
   * 由 Main Process 根据连接配置和运行时状态计算启动路由。
   * 这是 Startup Gate 的核心 API。
   */
  resolveStartupDecision: (): Promise<StartupDecision> =>
    ipcRenderer.invoke("startup:resolve-decision"),

  /**
   * 获取应用版本
   */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke("get-app-version"),

  /**
   * 窗口控制（Windows/Linux 无边框窗口）
   */
  windowControls: {
    minimize: (): Promise<void> => ipcRenderer.invoke("window:minimize"),
    maximizeOrRestore: (): Promise<void> =>
      ipcRenderer.invoke("window:maximize-or-restore"),
    close: (): Promise<void> => ipcRenderer.invoke("window:close"),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke("window:is-maximized"),
  },

  /**
   * 打开外部链接
   */
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke("open-external", url),

  /**
   * 退出应用（绕过「关闭到托盘」）
   */
  quitApp: (): Promise<void> => ipcRenderer.invoke("app:quit"),
};
