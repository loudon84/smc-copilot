/**
 * Native Bootstrap + Policy + Repair unit tests (PRD A-INSTALL-* / A-POLICY-* / A-REPAIR-*).
 * Child process heavily mocked — no real PowerShell / git.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parse as parseYaml } from "yaml";

vi.mock("electron", () => ({
  app: {
    getPath: (name: string): string => {
      if (name === "userData") {
        return process.env.HERMES_DESKTOP_USER_DATA_DIR || tmpdir();
      }
      return tmpdir();
    },
    getAppPath: (): string => process.cwd(),
    setPath: (): void => {},
  },
}));

import {
  runHermesBootstrap,
  type BootstrapSpawnCall,
} from "../src/main/runtime/hermes-bootstrap";
import {
  assertLocalChatAllowed,
  canAcceptLocalChat,
  getBootstrapState,
  resetBootstrapStateForTests,
  setBootstrapState,
} from "../src/main/runtime/hermes-bootstrap-state";
import { withBootstrapLock } from "../src/main/runtime/hermes-bootstrap-lock";
import {
  applySmcPolicy,
  buildManagedConfigPatch,
  loadSmcPolicy,
} from "../src/main/runtime/hermes-policy-apply";
import { loadReleaseSource, repositoryIdentity } from "../src/main/runtime/hermes-release-source";
import { repairHermesOrigin } from "../src/main/runtime/hermes-repair";

const POLICY_PATH = join(
  process.cwd(),
  "resources/hermes-policy/smc-managed-2.json",
);
const RELEASE_PATH = join(
  process.cwd(),
  "resources/hermes-native/release-source.json",
);

describe("hermes-bootstrap", () => {
  let root: string;
  let userData: string;

  beforeEach(() => {
    root = join(tmpdir(), `hermes-boot-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    userData = join(tmpdir(), `hermes-ud-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    mkdirSync(userData, { recursive: true });
    process.env.HERMES_DESKTOP_USER_DATA_DIR = userData;
    resetBootstrapStateForTests();
  });

  afterEach(() => {
    delete process.env.HERMES_DESKTOP_USER_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
    resetBootstrapStateForTests();
  });

  function baseDeps(calls: BootstrapSpawnCall[]) {
    return {
      getHermesRoot: () => root,
      getUserDataPath: () => userData,
      resolveInstallPs1: () => "C:\\fake\\install.ps1",
      loadReleaseSource: () => loadReleaseSource(RELEASE_PATH),
      existsSync: (p: string) => {
        if (p.endsWith("install.ps1")) return true;
        if (p.includes(`${join(root, "git")}`)) return true;
        return existsSync(p);
      },
      spawnPowerShell: async (args: string[]) => {
        calls.push({ kind: "powershell", args });
        // Simulate ENSURE_GIT creating portable git path
        mkdirSync(join(root, "git", "cmd"), { recursive: true });
        writeFileSync(join(root, "git", "cmd", "git.exe"), "");
        return { code: 0 };
      },
      runGit: async (_exe: string, args: string[]) => {
        calls.push({ kind: "git", args });
        return { code: 0, stdout: "abc\tHEAD\n", stderr: "" };
      },
      readOriginUrl: async () => null,
      applyPolicy: () => {},
      writeOfficialSource: () => {
        writeFileSync(join(root, "official-source.json"), "{}");
      },
      installAndStartGateway: async () => true,
      probeHealth: async () => true,
      fetchCapabilities: async () => ({
        features: {
          run_submission: true,
          run_events_sse: true,
          run_stop: true,
          run_approval_response: true,
          tool_progress_events: true,
        },
        endpoints: {
          runs: { path: "/v1/runs" },
          run_events: { path: "/v1/runs/{run_id}/events" },
          run_approval: { path: "/v1/runs/{run_id}/approval" },
          run_stop: { path: "/v1/runs/{run_id}/stop" },
        },
      }),
      skipLock: true,
      timeoutMs: 5_000,
    };
  }

  // @lat: A-INSTALL-006
  it("A-INSTALL-006 remote skips bootstrap with zero mutation", async () => {
    const calls: BootstrapSpawnCall[] = [];
    const result = await runHermesBootstrap({
      ...baseDeps(calls),
      getConnectionMode: () => "remote",
    });
    expect(result.skipped).toBe(true);
    expect(result.state).toBe("READY");
    expect(calls).toHaveLength(0);
    expect(existsSync(join(root, "official-source.json"))).toBe(false);
  });

  it("A-INSTALL-006 ssh skips bootstrap with zero mutation", async () => {
    const calls: BootstrapSpawnCall[] = [];
    const result = await runHermesBootstrap({
      ...baseDeps(calls),
      getConnectionMode: () => "ssh",
    });
    expect(result.skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  // @lat: A-INSTALL-004
  it("A-INSTALL-004 ENSURE_GIT runs before ls-remote", async () => {
    const calls: BootstrapSpawnCall[] = [];
    // No checkout → full install after ls-remote
    const result = await runHermesBootstrap({
      ...baseDeps(calls),
      getConnectionMode: () => "local",
    });
    expect(result.state).toBe("READY");
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].kind).toBe("powershell");
    expect(calls[0].args).toContain("-Stage");
    expect(calls[0].args).toContain("git");
    const firstGit = calls.findIndex((c) => c.kind === "git");
    expect(firstGit).toBeGreaterThan(0);
    expect(calls[firstGit].args[0]).toBe("ls-remote");
    // ENSURE_GIT must precede any git call
    expect(
      calls.findIndex((c) => c.kind === "powershell" && c.args.includes("git")),
    ).toBeLessThan(firstGit);
  });

  // @lat: A-INSTALL-003
  it("A-INSTALL-003 chat blocked when INSTALLING", () => {
    setBootstrapState("INSTALLING");
    expect(canAcceptLocalChat()).toBe(false);
    expect(() => assertLocalChatAllowed()).toThrow(/bootstrap|INSTALLING|blocked/i);
    setBootstrapState("READY");
    expect(canAcceptLocalChat()).toBe(true);
    expect(() => assertLocalChatAllowed()).not.toThrow();
  });

  it("A-INSTALL-003 chat blocked when ABSENT or FAIL", () => {
    setBootstrapState("ABSENT");
    expect(canAcceptLocalChat()).toBe(false);
    setBootstrapState("FAIL", { errorCode: "X", errorMessage: "boom" });
    expect(() => assertLocalChatAllowed()).toThrow(/boom/);
  });

  // @lat: A-INSTALL-005
  it("A-INSTALL-005 lock prevents parallel bootstrap critical sections", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const run = (id: string) =>
      withBootstrapLock(
        {
          userDataPath: userData,
          operationId: id,
          waitMs: 5_000,
          pollMs: 20,
          staleMs: 60_000,
          sleep,
        },
        async () => {
          concurrent += 1;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await sleep(80);
          concurrent -= 1;
          return id;
        },
      );

    const [a, b] = await Promise.all([run("a"), run("b")]);
    expect([a, b].sort()).toEqual(["a", "b"]);
    expect(maxConcurrent).toBe(1);
  });

  it("marks REPO_MISMATCH without silent repair when origin differs", async () => {
    const calls: BootstrapSpawnCall[] = [];
    mkdirSync(join(root, "hermes-agent", ".git"), { recursive: true });
    const result = await runHermesBootstrap({
      ...baseDeps(calls),
      getConnectionMode: () => "local",
      readOriginUrl: async () => "https://github.com/NousResearch/hermes-agent.git",
    });
    expect(result.state).toBe("REPO_MISMATCH");
    expect(result.errorCode).toBe("HERMES_REPO_ORIGIN_MISMATCH");
    // Must not have run full install (no -RepoUrl spawn after mismatch)
    expect(
      calls.some(
        (c) => c.kind === "powershell" && c.args.includes("-RepoUrl"),
      ),
    ).toBe(false);
    expect(getBootstrapState()).toBe("REPO_MISMATCH");
  });
});

describe("hermes-policy-apply", () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `hermes-pol-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("A-POLICY-003 policy paths use Hermes Root not ProgramData", () => {
    const policy = loadSmcPolicy("smc-managed-2", POLICY_PATH);
    const patch = buildManagedConfigPatch(policy, {
      hermesRoot: root,
      isNamedProfile: false,
    });
    const cwd = (patch.terminal as { cwd: string }).cwd;
    const cmd = (
      patch.mcp_servers as { workspace: { command: string } }
    ).workspace.command;
    expect(cwd.toLowerCase()).toContain(root.toLowerCase());
    expect(cwd.toLowerCase()).not.toContain("programdata");
    expect(cmd.toLowerCase()).toContain(join(root, "node").toLowerCase());
    expect(cmd.toLowerCase()).not.toContain("managed-node");
    expect(cmd.toLowerCase()).not.toContain("programdata");
  });

  it("A-POLICY-002 preserves existing API_SERVER_KEY", () => {
    writeFileSync(join(root, ".env"), "API_SERVER_KEY=keep-me\nOTHER=1\n");
    applySmcPolicy({
      hermesRoot: root,
      policyVersion: "smc-managed-2",
      policyPath: POLICY_PATH,
    });
    const env = readFileSync(join(root, ".env"), "utf-8");
    expect(env).toContain("API_SERVER_KEY=keep-me");
    const cfg = parseYaml(readFileSync(join(root, "config.yaml"), "utf-8")) as {
      platforms: { api_server: { enabled: boolean } };
    };
    expect(cfg.platforms.api_server.enabled).toBe(true);
  });
});

describe("hermes-repair", () => {
  it("A-REPAIR-001 requires explicit confirm", async () => {
    const result = await repairHermesOrigin({ confirm: false });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("HERMES_REPAIR_CONFIRM_REQUIRED");
  });
});

describe("hermes-release-source", () => {
  it("loads golden release-source matching client-release.yaml", () => {
    const src = loadReleaseSource(RELEASE_PATH);
    expect(src.installUrl).toBe(
      "http://git.superic.com/aiplatform/hermes-agent.git",
    );
    expect(src.approvedCommit).toHaveLength(40);
    expect(src.policyVersion).toBe("smc-managed-2");
    expect(src.repositoryIdentity).toBe(repositoryIdentity(src.installUrl));
  });
});
