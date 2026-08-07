import { app, Menu, shell } from "electron";
import { is } from "../utils/electron-toolkit-wrapper";

/**
 * 构建应用菜单
 *
 * 从 src/main/index.ts 抽离的菜单构建逻辑。
 *
 * @param getMainWindow 获取主窗口的回调函数（因为窗口可能在菜单构建后才创建）
 */
export function buildAppMenu(
  getMainWindow: () => Electron.BrowserWindow | null,
): void {
  const isMac = process.platform === "darwin";

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "Chat",
      submenu: [
        {
          label: "New Chat",
          accelerator: "CmdOrCtrl+N",
          click: (): void => {
            const win = getMainWindow();
            win?.webContents.send("menu-new-chat");
          },
        },
        { type: "separator" },
        {
          label: "Search Sessions",
          accelerator: "CmdOrCtrl+K",
          click: (): void => {
            const win = getMainWindow();
            win?.webContents.send("menu-search-sessions");
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(is.dev
          ? [
              { type: "separator" as const },
              { role: "reload" as const },
              { role: "toggleDevTools" as const },
            ]
          : []),
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" as const }, { role: "front" as const }]
          : [{ role: "close" as const }]),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Document Wiki",
          click: (): void => {
            shell.openExternal("https://github.com/NousResearch/hermes-agent/");
          },
        },
        {
          label: "Report an Issue",
          click: (): void => {
            shell.openExternal(
              "https://github.com/fathah/hermes-desktop/issues",
            );
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
