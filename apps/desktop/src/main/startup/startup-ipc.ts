import { ipcMain } from "electron";
import { resolveStartupDecision } from "./startup-decision";

/**
 * 设置 Startup Gate IPC 处理器
 *
 * 注册 startup:resolve-decision 通道，供 Renderer 查询启动决策。
 */
export function setupStartupIPC(): void {
  ipcMain.handle("startup:resolve-decision", async () => {
    return resolveStartupDecision();
  });
}
