import type { BrowserWindow } from "electron";
import { OverlayBase } from "./overlay-base";
import type {
  ShellModalKey,
  OverlayBounds,
  OverlayLayout,
  ModalState,
} from "../../../shared/shell/overlay-contract";

/**
 * ModalView - Modal 视图封装
 *
 * 继承 OverlayBase，增加 Modal 特有功能：
 * - Modal Key 关联
 * - 状态管理（creating -> loading -> ready -> showing -> visible -> ...）
 * - 数据存储（传递给 Modal 的数据）
 */
export class ModalView extends OverlayBase {
  private modalKey: ShellModalKey;
  private state: ModalState = "creating";
  private data: unknown = null;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private preloadPath?: string;

  constructor(
    id: string,
    modalKey: ShellModalKey,
    mainWindow: BrowserWindow,
    preloadPath?: string,
  ) {
    super(id, mainWindow, "modal");
    this.modalKey = modalKey;
    this.preloadPath = preloadPath;

    // 创建 ready promise
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * 创建 Modal View
   * @param url - HTML 文件路径
   * @param data - 要传递给 Modal 的数据
   */
  async create(url: string, data?: unknown): Promise<void> {
    this.state = "creating";
    this.data = data ?? null;

    try {
      await this.createNativeView(url, this.preloadPath);
      this.state = "loading";

      // 等待页面加载完成
      if (this.getNativeView()) {
        await new Promise<void>((resolve, reject) => {
          const webContents = this.getNativeView()!.webContents;

          const onDidFinishLoad = () => {
            this.state = "ready";
            resolve();
          };

          const onDidFailLoad = (
            _event: Electron.Event,
            errorCode: number,
            errorDescription: string,
          ) => {
            console.error(
              `[ModalView] Failed to load ${url}: ${errorDescription} (${errorCode})`,
            );
            reject(new Error(`Failed to load ${url}: ${errorDescription}`));
          };

          // 检查是否已经加载完成
          if (webContents.isLoading()) {
            webContents.once("did-finish-load", onDidFinishLoad);
            webContents.once("did-fail-load", onDidFailLoad);

            // 超时处理
            setTimeout(() => {
              reject(new Error(`Timeout loading ${url}`));
            }, 30000);
          } else {
            this.state = "ready";
            resolve();
          }
        });
      }

      this.emit("created", this.id, this.modalKey);
    } catch (err) {
      this.state = "closed";
      throw err;
    }
  }

  /**
   * 显示 Modal
   * @param boundsOrLayout - 位置/大小
   */
  show(boundsOrLayout?: OverlayBounds | OverlayLayout): void {
    if (!boundsOrLayout) {
      // 默认居中显示，宽度 400px，高度自适应
      const winBounds = this.mainWindow.getBounds();
      boundsOrLayout = {
        x: "calc(50% - 200px)",
        y: "calc(50% - 150px)",
        width: 400,
        height: 300,
      };
    }

    this.state = "showing";
    super.show(boundsOrLayout);
    this.state = "visible";

    // 发送数据到 Modal
    if (this.data !== null) {
      this.send("modal:data", this.data);
    }

    this.emit("shown", this.id, this.modalKey);
  }

  /**
   * 隐藏 Modal
   */
  hide(): void {
    this.state = "hiding";
    super.hide();
    this.state = "closed";
    this.emit("hidden", this.id, this.modalKey);
  }

  /**
   * 销毁 Modal
   */
  destroy(): void {
    this.state = "destroyed";
    super.destroy();
  }

  /**
   * 标记 Modal 已准备好（由 preload 调用）
   */
  markReady(): void {
    if (this.readyResolve) {
      this.readyResolve();
      this.readyResolve = null;
    }
    this.emit("ready", this.id, this.modalKey);
  }

  /**
   * 等待 Modal 准备好
   */
  async waitForReady(): Promise<void> {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  /**
   * 获取 Modal Key
   */
  getModalKey(): ShellModalKey {
    return this.modalKey;
  }

  /**
   * 获取当前状态
   */
  getState(): ModalState {
    return this.state;
  }

  /**
   * 获取数据
   */
  getData(): unknown {
    return this.data;
  }

  /**
   * 设置数据
   */
  setData(data: unknown): void {
    this.data = data;
    this.send("modal:data", data);
  }
}
