import { BrowserWindow } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { ModalView } from "./modal-view";
import type {
  ShellModalKey,
  ModalOptions,
  ModalQueueEntry,
  OverlayBounds,
  OverlayLayout,
} from "../../../shared/shell/overlay-contract";

/**
 * ModalManager - Modal 统一管理器
 *
 * 功能：
 * - 队列管理（先进先出）
 * - 优先级支持（高优先级可打断低优先级）
 * - Promise-based API（支持 await showModal()）
 * - 自动清理
 */
export class ModalManager extends EventEmitter {
  private mainWindow: BrowserWindow;
  private queue: Array<
    ModalQueueEntry & {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      view: ModalView;
    }
  > = [];
  private currentModal: {
    entry: ModalQueueEntry;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    view: ModalView;
  } | null = null;
  private preloadPath: string;
  private modalCounter = 0;

  constructor(mainWindow: BrowserWindow, preloadPath: string) {
    super();
    this.mainWindow = mainWindow;
    this.preloadPath = preloadPath;
  }

  /**
   * 显示 Modal（返回 Promise，支持 await）
   *
   * @param key - Modal 类型 Key
   * @param data - 传递给 Modal 的数据
   * @param options - 选项
   * @returns Promise<unknown> - Modal 关闭时的返回值
   */
  showModal<T = unknown>(
    key: ShellModalKey,
    data?: unknown,
    options?: ModalOptions,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const priority = options?.priority ?? 0;
      const uncloseable = options?.uncloseable ?? false;
      const showBackdrop = options?.showBackdrop ?? true;
      const backdropOpacity = options?.backdropOpacity ?? 0.5;
      const customHtmlPath = options?.customHtmlPath;

      // 生成唯一 ID
      const id = `modal-${key}-${++this.modalCounter}-${Date.now()}`;

      // 创建 ModalView
      const view = new ModalView(id, key, this.mainWindow, this.preloadPath);

      // 构建队列条目（使用类型断言解决泛型类型问题）
      const entry = {
        key,
        data,
        priority,
        uncloseable,
        showBackdrop,
        backdropOpacity,
        customHtmlPath,
        resolve: resolve as (value: unknown) => void,
        reject: reject as (reason?: unknown) => void,
        view,
      };

      // 绑定事件
      this.bindModalEvents(view, entry.resolve, entry.reject);

      // 如果当前有 Modal 在显示
      if (this.currentModal) {
        // 检查优先级
        if (priority > this.currentModal.entry.priority) {
          // 高优先级打断当前 Modal
          this.dismissCurrentModal("interrupted by higher priority modal");
          this.processEntry(entry);
        } else {
          // 加入队列
          this.enqueue(entry);
        }
      } else {
        // 直接显示
        this.processEntry(entry);
      }
    });
  }

  /**
   * 关闭当前 Modal（触发 resolve）
   *
   * @param result - 返回值
   */
  closeModal(result?: unknown): void {
    if (!this.currentModal) return;

    const { view, resolve } = this.currentModal;

    // 隐藏并销毁
    this.hideAndDestroyView(view);

    // Resolve promise
    resolve(result);

    // 清理
    this.currentModal = null;

    // 处理队列中的下一个
    this.processNext();
  }

  /**
   * 取消当前 Modal（触发 reject）
   *
   * @param reason - 取消原因
   */
  dismissModal(reason?: string): void {
    if (!this.currentModal) return;

    this.dismissCurrentModal(reason);
  }

  /**
   * 取消所有 Modal（清空队列）
   *
   * @param reason - 取消原因
   */
  dismissAll(reason?: string): void {
    // 取消当前 Modal
    if (this.currentModal) {
      this.dismissCurrentModal(reason);
    }

    // 清空队列
    while (this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.reject(new Error(reason || "All modals dismissed"));
      this.hideAndDestroyView(entry.view);
    }
  }

  /**
   * 应用退出时清理
   */
  destroyAll(): void {
    this.dismissAll("Application quitting");
    this.removeAllListeners();
  }

  /**
   * 检查是否有 Modal 在显示
   */
  hasActiveModal(): boolean {
    return this.currentModal !== null;
  }

  /**
   * 获取当前 Modal 的 Key
   */
  getCurrentModalKey(): ShellModalKey | null {
    return this.currentModal?.entry.key ?? null;
  }

  /**
   * 获取队列长度
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 处理队列条目
   */
  private async processEntry(
    entry: ModalQueueEntry & {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      view: ModalView;
    },
  ): Promise<void> {
    try {
      // 获取 HTML 路径
      const htmlPath = this.getModalHtmlPath(entry.key, entry.customHtmlPath);

      // 创建并加载
      await entry.view.create(htmlPath, entry.data);

      // 设置当前 Modal
      this.currentModal = {
        entry,
        resolve: entry.resolve,
        reject: entry.reject,
        view: entry.view,
      };

      // 显示（默认居中）
      entry.view.show();

      // 发送显示事件
      this.emit("modalShown", entry.key, entry.data);
    } catch (err) {
      entry.reject(err);
      this.hideAndDestroyView(entry.view);
      this.processNext();
    }
  }

  /**
   * 将条目加入队列（按优先级排序）
   */
  private enqueue(
    entry: ModalQueueEntry & {
      resolve: (value: unknown) => void;
      reject: (reason?: unknown) => void;
      view: ModalView;
    },
  ): void {
    // 按优先级插入队列（高优先级在前）
    const insertIndex = this.queue.findIndex(
      (e) => e.priority < entry.priority,
    );
    if (insertIndex === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(insertIndex, 0, entry);
    }

    this.emit("modalQueued", entry.key, this.queue.length);
  }

  /**
   * 处理队列中的下一个
   */
  private processNext(): void {
    if (this.queue.length === 0) return;

    const next = this.queue.shift()!;
    this.processEntry(next);
  }

  /**
   * 取消当前 Modal
   */
  private dismissCurrentModal(reason?: string): void {
    if (!this.currentModal) return;

    const { view, reject } = this.currentModal;

    // 隐藏并销毁
    this.hideAndDestroyView(view);

    // Reject promise
    reject(new Error(reason || "Modal dismissed"));

    // 清理
    this.currentModal = null;
  }

  /**
   * 隐藏并销毁 View
   */
  private hideAndDestroyView(view: ModalView): void {
    view.hide();
    view.destroy();
  }

  /**
   * 绑定 Modal 事件
   */
  private bindModalEvents(
    view: ModalView,
    resolve: (value: unknown) => void,
    reject: (reason?: unknown) => void,
  ): void {
    // 监听 Modal 内部的消息
    view.on("hidden", () => {
      // Modal 被隐藏但未通过 close/confirm/cancel
      // 这种情况通常是外部强制关闭
    });

    // 监听 IPC 消息（通过 internalViewApi）
    const webContents = view.getNativeView()?.webContents;
    if (webContents) {
      // 处理 close message
      const handleClose = (_event: Electron.IpcMainEvent, result?: unknown) => {
        if (this.currentModal?.view === view) {
          this.closeModal(result);
        }
      };

      // 处理 cancel message
      const handleCancel = (_event: Electron.IpcMainEvent, reason?: string) => {
        if (this.currentModal?.view === view) {
          this.dismissModal(reason);
        }
      };

      webContents.on("ipc-message", (event, channel, ...args) => {
        if (channel === "internal-view:close") {
          handleClose(event, args[0]);
        } else if (channel === "internal-view:cancel") {
          handleCancel(event, args[0]);
        }
      });

      // 页面关闭时清理
      webContents.on("destroyed", () => {
        if (this.currentModal?.view === view) {
          this.dismissModal("Modal window destroyed");
        }
      });
    }
  }

  /**
   * 获取 Modal HTML 路径
   */
  private getModalHtmlPath(key: ShellModalKey, customPath?: string): string {
    if (customPath) {
      return customPath;
    }

    // 默认路径映射
    const defaultPaths: Record<ShellModalKey, string> = {
      "update-ready": "update-ready",
      "confirm-exit": "confirm-exit",
      "error-report": "error-report",
      "permission-request": "permission-request",
      "custom-dialog": "custom-dialog",
      custom: "custom",
    };

    // 构建完整路径
    // 生产环境: app://./modals/{key}.html
    // 开发环境: http://localhost:{port}/modals/{key}.html
    const basePath = defaultPaths[key] || key;

    // 使用 file:// 协议加载本地 HTML
    // electron-vite 会将 modals 目录打包到 out/renderer/modals/
    return `file://${join(__dirname, "../renderer/modals", basePath, `${basePath}.html`)}`;
  }
}
