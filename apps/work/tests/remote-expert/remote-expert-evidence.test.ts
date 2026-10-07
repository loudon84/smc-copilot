import { describe, expect, it } from "vitest";
import {
  ACCEPTANCE_ID_RE,
  evaluateG6,
  evidenceContainsSecrets,
  mapAcceptanceById,
  unlinkWorktreeLink,
  verifyEvidenceSha,
} from "../../scripts/lib/remote-expert-evidence.mjs";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  evaluateG7Prerequisites,
} from "../../scripts/lib/remote-expert-g7-prereq.mjs";

describe("remote-expert evidence helpers", () => {
  it("[A-NEG-EVID-G6-001] dirty worktree cannot G6 PASS", () => {
    const result = evaluateG6({
      commands: [{ name: "vitest", exitCode: 0 }],
      assertions: [
        {
          title: "[A-UI-ENTRY-001] ok",
          status: "PASS",
          file: "x.test.tsx",
        },
      ],
      required: ["A-UI-ENTRY-001"],
      dirty: true,
    });
    expect(result.overall).toBe("BLOCKED");
    expect(result.errorCode).toBe("G6_CONSUMER_DIRTY");
  });

  it("[A-NEG-EVID-G6-002] uncovered acceptance cannot G6 PASS", () => {
    const result = evaluateG6({
      commands: [{ name: "vitest", exitCode: 0 }],
      assertions: [],
      required: ["A-UI-ENTRY-001"],
      dirty: false,
    });
    expect(result.overall).toBe("FAIL");
    expect(result.errorCode).toBe("G6_REQUIRED_ACCEPTANCE_UNCOVERED");
    expect(result.cases["A-UI-ENTRY-001"]).toBe("UNCOVERED");
  });

  it("[A-EVID-G6-001] clean covered suite can PASS", () => {
    const result = evaluateG6({
      commands: [
        { name: "typecheck", exitCode: 0 },
        { name: "vitest", exitCode: 0 },
        { name: "lat check", exitCode: 0 },
      ],
      assertions: [
        {
          title: "[A-UI-ENTRY-001] visible",
          status: "PASS",
          file: "entry.test.tsx",
        },
      ],
      required: ["A-UI-ENTRY-001"],
      dirty: false,
    });
    expect(result.overall).toBe("PASS");
  });

  it("[A-NEG-OBS-CLOSURE-001] secret scan rejects token material", () => {
    expect(
      evidenceContainsSecrets(
        JSON.stringify({ Authorization: "Bearer abc.def.ghi" }),
      ),
    ).toBe(true);
    expect(
      evidenceContainsSecrets(JSON.stringify({ overall: "PASS", commitSha: "a" })),
    ).toBe(false);
    expect(
      evidenceContainsSecrets(
        JSON.stringify({ title: "[A-OBS-001] redacts bearer tokens" }),
      ),
    ).toBe(false);
  });

  it("parses multi-segment acceptance ids", () => {
    const title = "foo [A-NEG-UI-ENTRY-001] bar [A-G7-LIVE-015]";
    const ids = [...title.matchAll(ACCEPTANCE_ID_RE)].map((m) => m[1]);
    expect(ids).toEqual(["A-NEG-UI-ENTRY-001", "A-G7-LIVE-015"]);
    const byId = mapAcceptanceById(
      [{ title, status: "PASS", file: "t.ts" }],
      ["A-NEG-UI-ENTRY-001", "A-G7-LIVE-015"],
    );
    expect(byId["A-NEG-UI-ENTRY-001"].status).toBe("PASS");
  });

  it("parses EXT-G5 4-digit acceptance ids without truncating", () => {
    const title = "[A-SMC-2101] [A-MIG-2102] [A-SMC-001]";
    const ids = [...title.matchAll(ACCEPTANCE_ID_RE)].map((m) => m[1]);
    expect(ids).toEqual(["A-SMC-2101", "A-MIG-2102", "A-SMC-001"]);
  });

  it("verifyEvidenceSha detects stale evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "g6-evid-"));
    const path = join(dir, "remote-expert-g6.json");
    writeFileSync(
      path,
      JSON.stringify({ commitSha: "aaa", gate: "G6" }),
      "utf8",
    );
    expect(verifyEvidenceSha(path, "bbb").ok).toBe(false);
    expect(verifyEvidenceSha(path, "aaa").ok).toBe(true);
    unlinkSync(path);
  });

  it("unlinking worktree junction keeps target contents", () => {
    const root = mkdtempSync(join(tmpdir(), "g6-junc-"));
    const target = join(root, "target");
    const link = join(root, "link");
    mkdirSync(target);
    const marker = join(target, "keep.txt");
    writeFileSync(marker, "safe", "utf8");
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    expect(unlinkWorktreeLink(link)).toBe(true);
    expect(existsSync(link)).toBe(false);
    expect(existsSync(marker)).toBe(true);
  });

  it("[A-NEG-G7-RUNNER-001] missing env blocks G7", () => {
    const result = evaluateG7Prerequisites({
      env: {},
      dirty: false,
    });
    expect(result.overall).toBe("BLOCKED");
    expect(result.errorCode).toBe("G7_ENV_INCOMPLETE");
  });

  it("[A-NEG-G7-RUNNER-002] dirty consumer blocks G7", () => {
    const result = evaluateG7Prerequisites({
      env: {
        SMC_REMOTE_EXPERT_G7: "1",
        SMC_REMOTE_EXPERT_G7_BACKEND_URL: "https://example.test",
        SMC_REMOTE_EXPERT_G7_TOKEN: "tok",
        SMC_REMOTE_EXPERT_G7_ORG_ID: "org",
        SMC_REMOTE_EXPERT_G7_USER_ID: "user",
        SMC_REMOTE_EXPERT_G7_AGENT_REF: "sales-expert",
        SMC_REMOTE_EXPERT_G7_DESIGNATED_TEST_EXPERT: "sales-expert",
      },
      dirty: true,
    });
    expect(result.overall).toBe("BLOCKED");
    expect(result.errorCode).toBe("G7_CONSUMER_DIRTY");
  });
});
