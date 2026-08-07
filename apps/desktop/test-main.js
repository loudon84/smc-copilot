const { app, BrowserWindow } = require("electron");

console.log("[TEST] Starting Electron test...");
console.log("[TEST] app:", typeof app, "app.isPackaged:", app?.isPackaged);

app.whenReady().then(() => {
  console.log("[TEST] App is ready!");
  console.log("[TEST] Electron:", process.versions.electron);
  console.log("[TEST] Node:", process.versions.node);
  console.log("[TEST] Chrome:", process.versions.chrome);

  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadURL(
    'data:text/html,<h1>Electron Test - Minimize Me!</h1><button onclick="require("electron").BrowserWindow.getFocusedWindow().minimize()">Minimize</button>',
  );

  console.log(
    "[TEST] Window created, test the minimize button or titlebar controls",
  );
});
