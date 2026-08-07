console.log("[TEST] Electron native module test");
console.log("[TEST] process.execPath:", process.execPath);
console.log("[TEST] cwd:", process.cwd());
console.log("[TEST] module.paths:", module.paths.slice(0, 5));

const electron = require("electron");
console.log("[TEST] typeof electron:", typeof electron);

if (typeof electron === "string") {
  console.log("[TEST] electron resolved to executable:", electron);
  console.log("[TEST] ERROR: electron module not loaded correctly!");
  console.log(
    '[TEST] This is because require("electron") is resolving to npm package instead of built-in.',
  );
  console.log("[TEST]");
  console.log(
    '[TEST] In Electron main process, require("electron") should return the electron module object.',
  );
  console.log(
    "[TEST] But it's returning the path to electron.exe from the npm package.",
  );
  console.log("[TEST]");
  console.log(
    "[TEST] This happens when node_modules/electron is found in module.paths",
  );
  console.log("[TEST] before the built-in electron module can be resolved.");
} else if (typeof electron === "object") {
  console.log("[TEST] electron.app:", typeof electron.app);
  console.log("[TEST] electron.BrowserWindow:", typeof electron.BrowserWindow);
  console.log("[TEST] SUCCESS: electron module loaded correctly!");
}

console.log("[TEST] process.versions.electron:", process.versions.electron);
console.log("[TEST] process.versions.node:", process.versions.node);
