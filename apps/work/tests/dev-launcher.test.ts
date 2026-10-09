// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { expect, it, vi } from "vitest";

it("watches Main and preload so a renderer update cannot retain an old upload bridge", () => {
  const spawn = vi.fn(() => ({ on: vi.fn() }));
  vm.runInNewContext(readFileSync("scripts/dev.cjs", "utf8"), {
    __dirname: path.join(process.cwd(), "scripts"),
    require: (name: string) =>
      name === "node:path" ? path : { spawn, spawnSync: vi.fn() },
    process: { platform: "linux", env: { SMC_KNOWLEDGE_MODE: "provider" } },
    console: { log: vi.fn() },
  });
  expect(spawn).toHaveBeenCalledWith(
    "npx",
    ["electron-vite", "dev", "--watch", "--inspect=9229", "--sourcemap"],
    expect.objectContaining({
      cwd: process.cwd(),
      env: { SMC_KNOWLEDGE_MODE: "provider" },
    }),
  );
});
