import {
  Tray,
  Menu,
  nativeImage,
  app,
  type BrowserWindow,
} from "electron";
import { join } from "path";

/**
 * Lightweight Windows/Linux tray so closing the main window can hide to the
 * background instead of quitting. Quit is available from the tray menu.
 */
// @lat: [[main-process#App Lifecycle#Close to tray on Windows]]
export interface AppTray {
  destroy: () => void;
  isCreated: () => boolean;
}

export function createAppTray(options: {
  getMainWindow: () => BrowserWindow | null;
  iconPath: string;
  tooltip: string;
  onQuit: () => void;
}): AppTray {
  let tray: Tray | null = null;

  const showWindow = (): void => {
    const win = options.getMainWindow();
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  };

  const buildMenu = (): void => {
    if (!tray) return;
    const win = options.getMainWindow();
    const visible = !!win && !win.isDestroyed() && win.isVisible();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: visible ? "Hide window" : "Show window",
          click: () => {
            const w = options.getMainWindow();
            if (!w || w.isDestroyed()) return;
            if (w.isVisible()) w.hide();
            else showWindow();
            buildMenu();
          },
        },
        { type: "separator" },
        {
          label: "Quit",
          click: () => options.onQuit(),
        },
      ]),
    );
  };

  const candidates = [
    options.iconPath,
    // Packaged / alternate layouts
    join(process.resourcesPath || "", "icon.png"),
    join(app.getAppPath(), "resources", "icon.png"),
    join(app.getAppPath(), "build", "icon.ico"),
  ];

  let image = nativeImage.createEmpty();
  for (const path of candidates) {
    if (!path) continue;
    const next = nativeImage.createFromPath(path);
    if (!next.isEmpty()) {
      image = next;
      break;
    }
  }
  if (image.isEmpty()) {
    console.warn("[TRAY] No tray icon found; close-to-tray disabled");
    return {
      destroy: () => undefined,
      isCreated: () => false,
    };
  }

  // Tray icons look better small on Windows.
  if (process.platform === "win32") {
    image = image.resize({ width: 16, height: 16 });
  }

  tray = new Tray(image);
  tray.setToolTip(options.tooltip);
  buildMenu();
  tray.on("click", () => {
    showWindow();
    buildMenu();
  });
  tray.on("double-click", () => {
    showWindow();
    buildMenu();
  });

  return {
    destroy: () => {
      tray?.destroy();
      tray = null;
    },
    isCreated: () => tray !== null,
  };
}
