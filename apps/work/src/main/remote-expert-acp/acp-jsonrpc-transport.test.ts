import { describe, expect, it } from "vitest";
import { AcpJsonRpcTransport } from "./acp-jsonrpc-transport";
import { RemoteExpertError } from "../../shared/remote-expert-acp/errors";

describe("acp jsonrpc transport rejectAll", () => {
  it("fails pending requests when the child exits", async () => {
    const transport = new AcpJsonRpcTransport(() => undefined);
    const pending = transport.request("session/prompt", { sessionId: "s" }, 30_000);
    transport.rejectAll(new RemoteExpertError("ACP_PROCESS_CRASHED", "adapter exited"));
    await expect(pending).rejects.toMatchObject({ code: "ACP_PROCESS_CRASHED" });
  });
});
