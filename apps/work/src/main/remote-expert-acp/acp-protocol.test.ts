import { describe, expect, it } from "vitest";
import { AcpJsonRpcTransport } from "./acp-jsonrpc-transport";
import { mapAcpSessionUpdate, collectNodeskclawArtifactUris } from "./acp-event-mapper";
import { parseArtifactResourceUri } from "./remote-artifact-bridge";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";
import {
  rememberPermissionRequest,
  resolvePermissionOnce,
} from "./permission-mapper";
import { redactDiagnosticsText, diagnosticsContainSecrets } from "./diagnostics";

describe("acp jsonrpc transport", () => {
  it("parses NDJSON responses and ignores malformed lines", async () => {
    const written: string[] = [];
    const transport = new AcpJsonRpcTransport((line) => written.push(line));
    const pending = transport.request("initialize", { protocolVersion: 1 });
    transport.pushStdout("not-json\n");
    transport.pushStdout(
      `${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: 1 } })}\n`,
    );
    await expect(pending).resolves.toEqual({ protocolVersion: 1 });
    expect(written[0]).toContain("initialize");
  });
});

describe("acp event mapper", () => {
  it("maps agent_message_chunk and unknown kinds without throwing", () => {
    const mapped = mapAcpSessionUpdate({
      turnId: "t1",
      sessionId: "s1",
      params: {
        sessionUpdate: { sessionUpdate: "agent_message_chunk", text: "hi" },
      },
    });
    expect(mapped[0]).toMatchObject({ type: "assistant.delta", text: "hi" });
    expect(() =>
      mapAcpSessionUpdate({
        turnId: "t1",
        sessionId: "s1",
        params: { sessionUpdate: { sessionUpdate: "run.progress" } },
      }),
    ).not.toThrow();
  });
});

describe("artifact uri parser", () => {
  it("accepts contract uris and rejects traversal", () => {
    expect(parseArtifactResourceUri("nodeskclaw://artifact/run-id/artifact-id")).toEqual({
      runId: "run-id",
      artifactId: "artifact-id",
    });
    expect(() => parseArtifactResourceUri("https://evil.example/x")).toThrow(RemoteExpertError);
    expect(() => parseArtifactResourceUri("nodeskclaw://artifact/../etc/passwd")).toThrow(
      RemoteExpertError,
    );
  });
});

describe("permission mapper", () => {
  it("accepts only the first terminal decision", () => {
    rememberPermissionRequest("perm-1", "perm-1");
    expect(resolvePermissionOnce("perm-1", "allow_once").rpcId).toBe("perm-1");
    expect(() => resolvePermissionOnce("perm-1", "reject_once")).toThrow(
      /permission already resolved/,
    );
  });
});

describe("diagnostics redaction", () => {
  it("redacts bearer tokens", () => {
    expect(redactDiagnosticsText("Authorization: Bearer abc.def.ghi")).toContain("[redacted]");
  });

  it("secret scanner catches tokens and ignores clean dumps", () => {
    expect(diagnosticsContainSecrets("Authorization: Bearer abc.def.ghi")).toBe(true);
    SECRET_RE_RESET: expect(diagnosticsContainSecrets("remote_expert.turn_start")).toBe(false);
  });
});

describe("artifact uri collector", () => {
  it("finds nested nodeskclaw artifact uris", () => {
    expect(
      collectNodeskclawArtifactUris({
        sessionUpdate: {
          type: "resource_link",
          uri: "nodeskclaw://artifact/run-1/art-2",
        },
      }),
    ).toEqual(["nodeskclaw://artifact/run-1/art-2"]);
  });
});
