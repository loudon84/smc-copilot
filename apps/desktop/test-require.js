console.log(
  "[BEFORE REQUIRE] process.versions:",
  JSON.stringify(process.versions, null, 2),
);
const electron = require("electron");
console.log("[AFTER REQUIRE] electron:", typeof electron);
console.log("[AFTER REQUIRE] electron.app:", typeof electron?.app);
console.log(
  "[AFTER REQUIRE] electron keys:",
  Object.keys(electron || {}).slice(0, 10),
);
process.exit(0);
