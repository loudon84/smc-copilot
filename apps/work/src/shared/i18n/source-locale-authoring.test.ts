/**
 * Ambient Node surfaces for web-project tsc: this file is included by both
 * tsconfig.web and tsconfig.node. Avoid static `node:` imports so web typecheck
 * does not require @types/node; runtime still uses real Node via dynamic require.
 */
declare const process: { cwd(): string };
declare function require(id: string): {
  execFileSync(
    file: string,
    args: readonly string[],
    options: { cwd?: string; encoding: "utf8" },
  ): string;
};

import { describe, expect, it } from "vitest";
import {
  classifyLocalePackageChanges,
  simultaneousLocaleCreationMessage,
} from "./source-locale-authoring";

const { execFileSync } = require("node:child_process");

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function collectChangedFiles(): string[] {
  const repoRoot = git(["rev-parse", "--show-toplevel"]);
  const files = new Set<string>();
  const add = (output: string) => {
    for (const line of output.split(/\r?\n/)) {
      const path = line.trim().replace(/\\/g, "/");
      if (path) files.add(path);
    }
  };
  const nameOnly = ["diff", "--name-only", "--diff-filter=ACMR"];
  add(execFileSync("git", [...nameOnly, "HEAD"], { cwd: repoRoot, encoding: "utf8" }));
  add(
    execFileSync("git", ["ls-files", "--others", "--exclude-standard"], {
      cwd: repoRoot,
      encoding: "utf8",
    }),
  );
  try {
    add(
      execFileSync("git", [...nameOnly, "HEAD~1", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }),
    );
  } catch {
    // first commit or shallow clone without HEAD~1
  }
  return [...files];
}

describe("i18n source-locale-only authoring", () => {
  it("rejects English and non-English locale packages in the same change", () => {
    // @lat: [[i18n-tests#Rejects English and non-English locale packages in the same change]]
    const classified = classifyLocalePackageChanges([
      "apps/work/src/shared/i18n/locales/en/skillRun.ts",
      "apps/work/src/shared/i18n/locales/zh-CN/skillRun.ts",
      "apps/work/src/shared/i18n/index.ts",
    ]);
    const message = simultaneousLocaleCreationMessage(classified);
    expect(message).toContain("locales/en only");
    expect(classified.sourceFiles).toEqual([
      "apps/work/src/shared/i18n/locales/en/skillRun.ts",
    ]);
    expect(classified.otherFiles).toEqual([
      "apps/work/src/shared/i18n/locales/zh-CN/skillRun.ts",
    ]);
  });

  it("allows English-only locale package changes", () => {
    // @lat: [[i18n-tests#Allows English-only locale package changes]]
    const classified = classifyLocalePackageChanges([
      "apps/work/src/shared/i18n/locales/en/chat.ts",
      "apps/work/src/shared/i18n/index.ts",
    ]);
    expect(simultaneousLocaleCreationMessage(classified)).toBeNull();
    expect(classified.sourceFiles).toHaveLength(1);
    expect(classified.otherFiles).toHaveLength(0);
  });

  it("allows translation-only non-English locale changes", () => {
    // @lat: [[i18n-tests#Allows translation-only non-English locale changes]]
    const classified = classifyLocalePackageChanges([
      "apps/work/src/shared/i18n/locales/zh-CN/skillRun.ts",
      "apps/work/src/shared/i18n/locales/ja/chat.ts",
    ]);
    expect(simultaneousLocaleCreationMessage(classified)).toBeNull();
    expect(classified.sourceFiles).toHaveLength(0);
    expect(classified.otherFiles).toHaveLength(2);
  });

  it("fails when the working tree mixes source and non-source locale packages", () => {
    // @lat: [[i18n-tests#Working tree must not mix source and non-source locale packages]]
    const message = simultaneousLocaleCreationMessage(
      classifyLocalePackageChanges(collectChangedFiles()),
    );
    expect(message).toBeNull();
  });
});
