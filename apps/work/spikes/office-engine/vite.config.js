import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  publicDir: resolve("../../tests/fixtures/office-preview"),
  server: { port: 4177, strictPort: true },
});
