import { contextBridge, ipcRenderer } from "electron";
import type { InternalViewAPI } from "../shared/shell/overlay-contract";

/**
 * Internal View API
 *
 * 供 Modal 内部渲染进程使用的 API。
 * 此 API 仅在 Modal HTML 页面中通过 preload 暴露，主应用不暴露。
 *
 * 功能：
 * - getData: 获取传入的数据
 * - close: 关闭 Modal 并返回结果
 * - confirm: 确认并关闭
 * - cancel: 取消并关闭
 * - ready: 通知主进程 Modal 已准备好
 */
const internalViewApi: InternalViewAPI = {
  /** 获取传入数据 */
  getData: (): Promise<unknown> => {
    return ipcRenderer.invoke("internal-view:get-data");
  },

  /** 关闭 Modal 并返回结果（触发 resolve） */
  close: (result?: unknown): Promise<void> => {
    ipcRenderer.send("internal-view:close", result);
    return Promise.resolve();
  },

  /** 确认并关闭（触发 resolve） */
  confirm: (result?: unknown): Promise<void> => {
    ipcRenderer.send("internal-view:confirm", result);
    return Promise.resolve();
  },

  /** 取消并关闭（触发 reject） */
  cancel: (reason?: string): Promise<void> => {
    ipcRenderer.send("internal-view:cancel", reason);
    return Promise.resolve();
  },

  /** 通知主进程 Modal 已准备好 */
  ready: (): Promise<void> => {
    ipcRenderer.send("internal-view:ready");
    return Promise.resolve();
  },
};

/**
 * 检测当前环境是否为 Modal 内部渲染进程
 *
 * 通过检查 URL 路径是否包含 /modals/ 来判断
 */
function isModalRenderer(): boolean {
  // 检查当前 URL 是否包含 modals 路径
  const pathname = window.location.pathname;
  const href = window.location.href;

  // 开发环境: http://localhost:{port}/modals/...
  // 生产环境: app://./modals/... 或 file://.../modals/...
  return (
    pathname.includes("/modals/") ||
    pathname.includes("\\modals\\") ||
    href.includes("/modals/") ||
    href.includes("%5Cmodals%5C")
  );
}

/**
 * 检测当前环境是否为 Dropdown 内部渲染进程
 *
 * Dropdown 保持在主渲染进程中，不需要独立 preload
 */
function isDropdownRenderer(): boolean {
  return false; // Dropdown 使用主渲染进程
}

/**
 * 注册 Internal View API
 *
 * 仅在 Modal 渲染进程中暴露
 */
export function registerInternalViewApi(): void {
  if (!isModalRenderer()) {
    // 不是 Modal 渲染进程，不注册
    return;
  }

  if (process.contextIsolated) {
    try {
      contextBridge.exposeInMainWorld("internalView", internalViewApi);
      console.log("[InternalViewApi] Registered for modal");
    } catch (error) {
      console.error("[InternalViewApi] Failed to register:", error);
    }
  } else {
    // @ts-ignore (define in dts)
    window.internalView = internalViewApi;
  }
}

export { internalViewApi };
