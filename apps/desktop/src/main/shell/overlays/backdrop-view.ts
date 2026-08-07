import type { BrowserWindow } from "electron";
import { OverlayBase } from "./overlay-base";

/**
 * BackdropView - 遮罩层 View
 *
 * 显示在 Modal 后方，半透明黑色背景，点击可关闭 Modal。
 */
export class BackdropView extends OverlayBase {
  private onClick?: () => void;

  constructor(mainWindow: BrowserWindow, onClick?: () => void) {
    super("backdrop", mainWindow, "modal");
    this.onClick = onClick;
  }

  /**
   * 创建并显示遮罩层
   */
  async showBackdrop(): Promise<void> {
    // 创建透明背景 View（使用 data URL 避免文件路径问题）
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              width: 100vw;
              height: 100vh;
              background: rgba(0, 0, 0, 0.5);
              cursor: pointer;
            }
          </style>
        </head>
        <body></body>
        <script>
          document.body.addEventListener('click', () => {
            if (window.internalView) {
              window.internalView.cancel('backdrop-click');
            }
          });
        </script>
      </html>
    `;
    const dataUrl = `data:text/html;base64,${Buffer.from(htmlContent).toString("base64")}`;

    // 调用父类的 createNativeView（protected，需要在 OverlayBase 中暴露或通过其他方式）
    // 这里我们使用完整的窗口大小
    const winBounds = this.mainWindow.getBounds();
    await (this as any).createNativeView(dataUrl);

    // 显示为全屏
    this.show({
      x: 0,
      y: 0,
      width: winBounds.width,
      height: winBounds.height,
    });
  }

  /**
   * 隐藏并销毁遮罩层
   */
  hideBackdrop(): void {
    this.hide();
    this.destroy();
  }
}
