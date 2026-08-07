import { BrowserWindow } from "electron";
import { EventEmitter } from "events";
import type {
  ShellDropdownKey,
  OverlayBounds,
  DropdownPosition,
} from "../../../shared/shell/overlay-contract";

/**
 * DropdownManager - Dropdown 管理器
 *
 * 注意：Dropdown 保持由 React 渲染，不创建独立 WebContentsView。
 * 此类作为 IPC 桥接，负责：
 * - 通知 Renderer 显示/隐藏 Dropdown
 * - 管理 Dropdown 状态
 * - 处理位置计算（锚点定位）
 */
export class DropdownManager extends EventEmitter {
  private mainWindow: BrowserWindow;
  private activeDropdowns: Map<ShellDropdownKey, DropdownPosition> = new Map();
  private dropdownState: Map<
    ShellDropdownKey,
    "hidden" | "showing" | "visible" | "hiding"
  > = new Map();

  constructor(mainWindow: BrowserWindow) {
    super();
    this.mainWindow = mainWindow;
  }

  /**
   * 显示 Dropdown
   *
   * @param key - Dropdown Key
   * @param position - 位置信息（锚点 bounds）
   * @param data - 传递给 Dropdown 的数据
   */
  showDropdown(
    key: ShellDropdownKey,
    position: DropdownPosition,
    data?: unknown,
  ): void {
    // 记录状态
    this.activeDropdowns.set(key, position);
    this.dropdownState.set(key, "showing");

    // 发送 IPC 消息到 Renderer
    this.mainWindow.webContents.send("dropdown:show", {
      key,
      anchorBounds: position.anchorBounds,
      preferredDirection: position.preferredDirection ?? "down",
      data,
    });

    this.dropdownState.set(key, "visible");
    this.emit("dropdownShown", key, position);
  }

  /**
   * 关闭指定 Dropdown
   *
   * @param key - Dropdown Key
   */
  closeDropdown(key: ShellDropdownKey): void {
    if (!this.activeDropdowns.has(key)) return;

    this.dropdownState.set(key, "hiding");

    // 发送 IPC 消息到 Renderer
    this.mainWindow.webContents.send("dropdown:close", { key });

    this.activeDropdowns.delete(key);
    this.dropdownState.set(key, "hidden");
    this.emit("dropdownClosed", key);
  }

  /**
   * 关闭所有 Dropdown
   */
  closeAll(): void {
    // 发送 IPC 消息到 Renderer
    this.mainWindow.webContents.send("dropdown:close-all");

    // 清理状态
    this.activeDropdowns.clear();
    for (const key of this.dropdownState.keys()) {
      this.dropdownState.set(key, "hidden");
    }

    this.emit("allDropdownsClosed");
  }

  /**
   * 切换 Dropdown 显示状态
   *
   * @param key - Dropdown Key
   * @param position - 位置信息
   * @param data - 传递给 Dropdown 的数据
   */
  toggleDropdown(
    key: ShellDropdownKey,
    position: DropdownPosition,
    data?: unknown,
  ): void {
    if (this.isDropdownVisible(key)) {
      this.closeDropdown(key);
    } else {
      this.showDropdown(key, position, data);
    }
  }

  /**
   * 检查 Dropdown 是否可见
   *
   * @param key - Dropdown Key
   */
  isDropdownVisible(key: ShellDropdownKey): boolean {
    return this.dropdownState.get(key) === "visible";
  }

  /**
   * 获取 Dropdown 状态
   *
   * @param key - Dropdown Key
   */
  getDropdownState(
    key: ShellDropdownKey,
  ): "hidden" | "showing" | "visible" | "hiding" {
    return this.dropdownState.get(key) ?? "hidden";
  }

  /**
   * 获取所有活跃的 Dropdown Keys
   */
  getActiveDropdowns(): ShellDropdownKey[] {
    return Array.from(this.activeDropdowns.keys());
  }

  /**
   * 更新 Dropdown 位置
   *
   * @param key - Dropdown Key
   * @param position - 新位置
   */
  updatePosition(key: ShellDropdownKey, position: DropdownPosition): void {
    if (!this.activeDropdowns.has(key)) return;

    this.activeDropdowns.set(key, position);

    // 发送位置更新到 Renderer
    this.mainWindow.webContents.send("dropdown:update-position", {
      key,
      anchorBounds: position.anchorBounds,
      preferredDirection: position.preferredDirection ?? "down",
    });

    this.emit("dropdownPositionUpdated", key, position);
  }

  /**
   * 计算 Dropdown 最佳位置（防止超出窗口边界）
   *
   * @param anchorBounds - 锚点元素 bounds
   * @param dropdownSize - Dropdown 尺寸
   * @param preferredDirection - 首选方向
   * @returns 计算后的位置
   */
  calculatePosition(
    anchorBounds: OverlayBounds,
    dropdownSize: { width: number; height: number },
    preferredDirection: "down" | "up" | "left" | "right" = "down",
  ): { x: number; y: number } {
    const winBounds = this.mainWindow.getBounds();
    const margin = 8;

    let x = anchorBounds.x;
    let y = anchorBounds.y + anchorBounds.height + margin; // 默认向下

    switch (preferredDirection) {
      case "up":
        y = anchorBounds.y - dropdownSize.height - margin;
        break;
      case "left":
        x = anchorBounds.x - dropdownSize.width - margin;
        y = anchorBounds.y;
        break;
      case "right":
        x = anchorBounds.x + anchorBounds.width + margin;
        y = anchorBounds.y;
        break;
      case "down":
      default:
        y = anchorBounds.y + anchorBounds.height + margin;
        break;
    }

    // 边界检查：确保不超出窗口
    if (x + dropdownSize.width > winBounds.width - margin) {
      x = winBounds.width - dropdownSize.width - margin;
    }
    if (x < margin) {
      x = margin;
    }
    if (y + dropdownSize.height > winBounds.height - margin) {
      // 如果向下超出，尝试向上
      y = anchorBounds.y - dropdownSize.height - margin;
    }
    if (y < margin) {
      y = margin;
    }

    return { x, y };
  }

  /**
   * 应用退出时清理
   */
  destroyAll(): void {
    this.closeAll();
    this.removeAllListeners();
  }
}
