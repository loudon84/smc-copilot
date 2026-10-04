import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolveAcpBinary } from "./acp-binary-resolver";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

describe("acp binary resolver", () => {
  it("accepts a development override path", () => {
    const dir = mkdtempSync(join(tmpdir(), "acp-bin-"));
    const exe = join(dir, "nodeskclaw-acp.exe");
    writeFileSync(exe, "fake-adapter");
    const resolved = resolveAcpBinary({ packed: false, envPath: exe });
    expect(resolved.source).toBe("dev-override");
    expect(resolved.exePath).toBe(exe);
  });

  it("rejects development overrides when packed", () => {
    expect(() =>
      resolveAcpBinary({ packed: true, envPath: "C:\\\\tmp\\\\nodeskclaw-acp.exe" }),
    ).toThrow(RemoteExpertError);
  });

  it("does not add the adapter to electron-builder extraResources in this change", () => {
    const yml = readFileSync(join(__dirname, "../../../electron-builder.yml"), "utf8");
    expect(yml.includes("nodeskclaw-acp")).toBe(false);
  });
});
