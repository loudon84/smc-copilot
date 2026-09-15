// @vitest-environment node
/**
 * V01 / TA-WK11-MODE — Main Knowledge Mode Controller (AC-01 / AC-09).
 * Must not import React or renderer modules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type {
  KnowledgeDataMode,
  KnowledgeModeSnapshot,
} from "../../shared/knowledge/knowledge-job-ipc";
import {
  bootstrapKnowledgeMode,
  getKnowledgeModeSnapshot,
  resetKnowledgeModeControllerForTests,
  resolveKnowledgeMode,
} from "./knowledge-mode-controller";

const ENV_KEYS = [
  "SMC_KNOWLEDGE_MODE",
  "SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA",
  "SMC_KNOWLEDGE_CHANNEL",
] as const;

const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

function clearModeEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  clearModeEnv();
  resetKnowledgeModeControllerForTests();
});

afterEach(() => {
  clearModeEnv();
  for (const key of ENV_KEYS) {
    const prev = savedEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
  resetKnowledgeModeControllerForTests();
  vi.restoreAllMocks();
});

function writePackagedConfig(
  dir: string,
  body: Record<string, unknown>,
): string {
  const resources = join(dir, "resources");
  mkdirSync(resources, { recursive: true });
  const path = join(resources, "work-knowledge-mode.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return path;
}

describe("knowledge-mode-controller (V01)", () => {
  it("defaults to provider without dual declaration", () => {
    const snap = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
    });
    expect(snap.dataMode).toBe("provider");
    expect(snap.allowSyntheticData).toBe(false);
    expect(snap.configSource).toBe("default");
    expect(getKnowledgeModeSnapshot()).toEqual(snap);
  });

  it("rejects mock when mode=mock without allowSyntheticData", () => {
    process.env.SMC_KNOWLEDGE_MODE = "mock";
    const logs: Record<string, unknown>[] = [];
    const snap = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
      log: (payload) => logs.push(payload),
    });
    expect(snap.dataMode).toBe("provider");
    expect(snap.allowSyntheticData).toBe(false);
    expect(logs.some((l) => l.event === "knowledge_mode_resolved")).toBe(true);
    expect(
      logs.some(
        (l) =>
          l.event === "knowledge_mode_mock_rejected" &&
          l.reason === "missing_dual_declaration",
      ),
    ).toBe(true);
  });

  it("rejects mock when allowSyntheticData=true without mode=mock", () => {
    process.env.SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA = "true";
    const snap = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
    });
    expect(snap.dataMode).toBe("provider");
    expect(snap.allowSyntheticData).toBe(false);
  });

  it("enters mock only when BOTH mode=mock and allowSyntheticData=true from env", () => {
    process.env.SMC_KNOWLEDGE_MODE = "mock";
    process.env.SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA = "true";
    process.env.SMC_KNOWLEDGE_CHANNEL = "demo";
    const logs: Record<string, unknown>[] = [];
    const snap = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
      log: (payload) => logs.push(payload),
    });
    expect(snap.dataMode).toBe("mock");
    expect(snap.allowSyntheticData).toBe(true);
    expect(snap.channel).toBe("demo");
    expect(snap.configSource).toBe("env");
    const resolved = logs.find((l) => l.event === "knowledge_mode_resolved");
    expect(resolved).toMatchObject({
      dataMode: "mock",
      channel: "demo",
      configSource: "env",
    });
  });

  it("enters mock when dual declaration is present in packaged JSON", () => {
    const cwd = mkdtempSync(join(tmpdir(), "wk-mode-"));
    writePackagedConfig(cwd, {
      schema: "smc.work.knowledge-mode.v1",
      mode: "mock",
      allowSyntheticData: true,
      channel: "packaged-demo",
    });
    const snap = bootstrapKnowledgeMode({
      cwd,
      listNonTerminalJobs: () => [],
    });
    expect(snap.dataMode).toBe("mock");
    expect(snap.allowSyntheticData).toBe(true);
    expect(snap.channel).toBe("packaged-demo");
    expect(snap.configSource).toBe("packaged");
    rmSync(cwd, { recursive: true, force: true });
  });

  it("merges env mode with packaged allowSyntheticData for dual declaration", () => {
    const cwd = mkdtempSync(join(tmpdir(), "wk-mode-"));
    writePackagedConfig(cwd, {
      schema: "smc.work.knowledge-mode.v1",
      allowSyntheticData: true,
      channel: "mixed",
    });
    process.env.SMC_KNOWLEDGE_MODE = "mock";
    const snap = bootstrapKnowledgeMode({
      cwd,
      listNonTerminalJobs: () => [],
    });
    expect(snap.dataMode).toBe("mock");
    expect(snap.allowSyntheticData).toBe(true);
    expect(snap.configSource).toBe("env+packaged");
    rmSync(cwd, { recursive: true, force: true });
  });

  it("refuses target mode start when non-terminal Jobs exist for a different mode", () => {
    process.env.SMC_KNOWLEDGE_MODE = "mock";
    process.env.SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA = "true";
    expect(() =>
      bootstrapKnowledgeMode({
        cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
        listNonTerminalJobs: () => [
          { dataMode: "provider" as KnowledgeDataMode, jobId: "job_1" },
        ],
      }),
    ).toThrow(/KNOWLEDGE_MODE_NONTERMINAL_CONFLICT/);
  });

  it("ignores Renderer-equivalent Preference/URL/localStorage inputs", () => {
    const snap = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
      // Intentionally unsupported / renderer-shaped knobs — must be ignored.
      rendererPreference: { mode: "mock", allowSyntheticData: true },
      urlQuery: "?knowledgeMode=mock&allowSyntheticData=true",
      localStorage: { knowledgeMode: "mock" },
    } as Parameters<typeof bootstrapKnowledgeMode>[0] & {
      rendererPreference: unknown;
      urlQuery: string;
      localStorage: unknown;
    });
    expect(snap.dataMode).toBe("provider");
    expect(snap.allowSyntheticData).toBe(false);
  });

  it("latches immutable mode after bootstrap (resolve/getSnapshot)", () => {
    const snap = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
    });
    expect(snap.dataMode).toBe("provider");
    process.env.SMC_KNOWLEDGE_MODE = "mock";
    process.env.SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA = "true";
    expect(() =>
      bootstrapKnowledgeMode({
        cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
        listNonTerminalJobs: () => [],
      }),
    ).toThrow(/KNOWLEDGE_MODE_IMMUTABLE/);
    expect(getKnowledgeModeSnapshot().dataMode).toBe("provider");
    const again = resolveKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
    });
    expect(again.dataMode).toBe("provider");
  });

  it("logs diagnostics without tokens or user content", () => {
    process.env.SMC_KNOWLEDGE_MODE = "mock";
    process.env.SMC_KNOWLEDGE_ALLOW_SYNTHETIC_DATA = "true";
    process.env.SMC_KNOWLEDGE_CHANNEL = "ci";
    const logs: Record<string, unknown>[] = [];
    bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
      log: (payload) => logs.push(payload),
      // Poison fields that must never appear in diagnostics.
      secretToken: "sk-live-should-never-log",
      userContent: "private document text",
    } as Parameters<typeof bootstrapKnowledgeMode>[0] & {
      secretToken: string;
      userContent: string;
    });
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toMatch(/sk-live|token|private document/i);
    expect(serialized).toMatch(/knowledge_mode_resolved/);
    expect(serialized).toMatch(/"dataMode":"mock"/);
    expect(serialized).toMatch(/"configSource"/);
    expect(serialized).toMatch(/"channel":"ci"/);
  });

  it("does not import or call getSkillRunFeatureMode", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync(
        new URL("./knowledge-mode-controller.ts", import.meta.url),
        "utf8",
      ),
    );
    expect(src).not.toMatch(/from\s+["'].*feature-mode-store["']/);
    expect(src).not.toMatch(/getSkillRunFeatureMode\s*\(/);
    expect(src).not.toMatch(/require\(["'].*feature-mode-store["']\)/);
  });
});

describe("KnowledgeModeSnapshot shape", () => {
  it("exposes ActiveDataMode fields only", () => {
    const snap: KnowledgeModeSnapshot = bootstrapKnowledgeMode({
      cwd: mkdtempSync(join(tmpdir(), "wk-mode-")),
      listNonTerminalJobs: () => [],
    });
    expect(["mock", "provider"]).toContain(snap.dataMode);
    expect(typeof snap.allowSyntheticData).toBe("boolean");
  });
});
