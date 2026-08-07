import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "../installer";
import type { WindowState } from "./types";

const STATE_DIR = join(HERMES_HOME, "desktop");
const STATE_FILE = join(STATE_DIR, "window-state.json");

/**
 * 读取保存的窗口状态
 */
export function readWindowState(): Partial<WindowState> {
  if (!existsSync(STATE_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(STATE_FILE, "utf-8");
    return JSON.parse(content) as WindowState;
  } catch {
    return {};
  }
}

/**
 * 保存窗口状态
 */
export function saveWindowState(state: WindowState): void {
  try {
    if (!existsSync(STATE_DIR)) {
      mkdirSync(STATE_DIR, { recursive: true });
    }
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // 保存失败不应影响应用运行
    console.error("[WINDOW STATE] Failed to save window state");
  }
}
