console.log('=== Testing require("electron") ===');
console.log("cwd:", process.cwd());
console.log("module.paths:", module.paths.slice(0, 5));
console.log("");

try {
  const resolved = require.resolve("electron");
  console.log('require.resolve("electron"):', resolved);
} catch (e) {
  console.log('require.resolve("electron") failed:', e.message);
}

console.log("");

try {
  const electron = require("electron");
  console.log('typeof require("electron"):', typeof electron);
  console.log("electron value:", electron);
  console.log("electron length:", electron?.length);
  if (typeof electron === "object") {
    console.log("electron keys:", Object.keys(electron));
    console.log("electron.app:", electron.app);
    console.log("electron.BrowserWindow:", electron.BrowserWindow);
  }
} catch (e) {
  console.log('require("electron") failed:', e.message);
}

console.log("");
console.log("process.versions.electron:", process.versions.electron);
console.log("process.versions.node:", process.versions.node);
