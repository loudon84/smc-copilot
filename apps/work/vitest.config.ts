import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "stub-business-module-ui-css",
      enforce: "pre",
      load(id) {
        const norm = id.replace(/\\/g, "/");
        if (norm.endsWith("styles/business-module-ui.css")) {
          return "/* stubbed in vitest */";
        }
        return undefined;
      },
    },
  ],
  resolve: {
    alias: {
      "@renderer": resolve(__dirname, "src/renderer/src"),
      "@shared": resolve(__dirname, "src/shared"),
      "@/components/ui": resolve(__dirname, "components/ui"),
      "@/components/common": resolve(__dirname, "components/common"),
      "@/components/file-preview": resolve(
        __dirname,
        "components/file-preview",
      ),
      "@/components/knowledge/knowledge-base-card": resolve(
        __dirname,
        "components/knowledge/knowledge-base-card.tsx",
      ),
      "@/utils": resolve(__dirname, "utils"),
      "@/hooks": resolve(__dirname, "hooks"),
      "@smc/runtime-client": resolve(
        __dirname,
        "../../packages/runtime-client-ts/src/index.ts",
      ),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    passWithNoTests: true,
    setupFiles: ["./src/renderer/src/test/setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
      "components/file-preview/**/*.test.ts",
      "components/file-preview/**/*.test.tsx",
    ],
  },
});
