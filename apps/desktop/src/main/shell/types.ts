/**
 * Shell 模块共享类型
 *
 * MainWindowController、ViewManager、OverlayManager 等壳层组件共享的类型。
 */

/** 窗口状态（用于持久化） */
export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

/** Shell 窗口选项 */
export interface ShellWindowOptions {
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  show?: boolean;
  frame?: boolean;
  titleBarStyle?: "default" | "hidden" | "hiddenInset";
  webPreferences?: Electron.WebPreferences;
}
