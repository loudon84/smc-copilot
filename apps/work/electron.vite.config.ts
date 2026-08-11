import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const configDir = dirname(fileURLToPath(import.meta.url));
const runtimeClientEntry = resolve(
  configDir,
  "../../packages/runtime-client-ts/src/index.ts",
);
const monorepoRoot = resolve(configDir, "../..");

const rendererPort = Number(process.env.HERMES_DESKTOP_RENDERER_PORT || 0);

/** PRD §2.1 — never serve or resolve Chatbox reference trees into the app. */
const referenceDeny = ["**/references/**", "**/wiki/**"];

export default defineConfig({
  main: {
    resolve: {
      alias: {
        // Bundle from TS source (same as apps/desktop). Do NOT add a package.json
        // dependency — electron-vite would externalize it and Electron would load
        // raw ESM .ts without extensions (ERR_MODULE_NOT_FOUND).
        "@smc/runtime-client": runtimeClientEntry,
      },
    },
    server: {
      fs: {
        allow: [configDir, monorepoRoot],
      },
    },
    build: {
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(configDir, "src/preload/index.ts"),
          askpass: resolve(configDir, "src/preload/askpass.ts"),
        },
      },
    },
  },
  renderer: {
    ...(rendererPort > 0
      ? {
          server: {
            port: rendererPort,
            strictPort: false,
            fs: { deny: referenceDeny },
          },
        }
      : {
          server: {
            fs: { deny: referenceDeny },
          },
        }),
    resolve: {
      alias: {
        "@renderer": resolve(configDir, "src/renderer/src"),
      },
      // Ensure a single Three.js instance across our code, @react-three/fiber,
      // drei and troika — multiple copies break `instanceof THREE.*` checks in
      // the ported office agent renderer.
      dedupe: ["three"],
    },
    plugins: [tailwindcss(), react()],
  },
});
