import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "./src/index.ts",
      name: "CopilotCrmDesktopSDK",
      formats: ["iife", "es"],
      fileName: (format) =>
        format === "iife" ? "crm-desktop-jssdk.iife.js" : "crm-desktop-jssdk.esm.js",
    },
  },
});

