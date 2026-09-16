// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { AccessTokenError } from "../auth/ensure-access-token";
import { AuthorizedBackendTransportError } from "../auth/authorized-backend-transport";
import { KNOWLEDGE_ERROR_CODES } from "../../shared/knowledge/knowledge-base-ipc";
import { KnowledgeFacadeError } from "../../shared/knowledge/knowledge-errors";
import {
  createKnowledgeHttpProvider,
  resetKnowledgeHttpProviderForTests,
} from "./knowledge-http-provider";
import type { KnowledgeAuthorizedTransport } from "./knowledge-authorized-transport";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function transport(
  handler: (path: string, init?: RequestInit) => Promise<Response>,
): KnowledgeAuthorizedTransport {
  return {
    getBaseUrl: () => "http://knowledge.test",
    joinUrl: (path) => `http://knowledge.test${path}`,
    authorizedFetch: (path, init) => handler(path, init),
    withAuthRetry: (op) => op(),
  };
}

const validBase = {
  id: "kb_1",
  org_id: "org",
  name: "Alpha",
  description: null,
  embedding_model: "emb",
  chunk_method: "naive",
  status: "active",
  owner_member_id: "m1",
  acl_version: 1,
  visibility: "organization",
  build_version: 1,
};

describe("KnowledgeHttpProvider", () => {
  afterEach(() => {
    resetKnowledgeHttpProviderForTests();
  });

  it("lists bases after schema validation", async () => {
    const provider = createKnowledgeHttpProvider(
      transport(async () =>
        jsonResponse(200, {
          code: 0,
          message: "ok",
          data: { items: [validBase], total: 1, page: 1, page_size: 50 },
        }),
      ),
    );
    const page = await provider.listBases({ page: 1, pageSize: 50 });
    expect(page.items[0]?.name).toBe("Alpha");
    expect(page.total).toBe(1);
  });

  it("maps 401/403/404/409/5xx and malformed payloads", async () => {
    const cases: Array<[number, string, unknown]> = [
      [401, KNOWLEDGE_ERROR_CODES.AUTH_REQUIRED, { message_key: "errors.auth" }],
      [403, KNOWLEDGE_ERROR_CODES.FORBIDDEN, { message_key: "errors.forbidden" }],
      [404, KNOWLEDGE_ERROR_CODES.NOT_FOUND, { message_key: "errors.missing" }],
      [409, KNOWLEDGE_ERROR_CODES.CONFLICT, { message_key: "errors.conflict" }],
      [503, KNOWLEDGE_ERROR_CODES.UNAVAILABLE, { message_key: "errors.down" }],
    ];
    for (const [status, code, body] of cases) {
      const provider = createKnowledgeHttpProvider(
        transport(async () => jsonResponse(status, body)),
      );
      await expect(provider.getBase({ knowledgeBaseId: "kb_1" })).rejects.toMatchObject({
        code,
      });
    }

    const malformed = createKnowledgeHttpProvider(
      transport(async () => new Response("{not-json", { status: 200 })),
    );
    await expect(malformed.listBases()).rejects.toMatchObject({
      code: KNOWLEDGE_ERROR_CODES.CONTRACT_INVALID,
    });
  });

  it("does not auto-retry a timed-out non-idempotent POST", async () => {
    let calls = 0;
    const provider = createKnowledgeHttpProvider(
      transport(async () => {
        calls += 1;
        throw new AuthorizedBackendTransportError("aborted", {
          status: 0,
          errorCode: "FETCH_ABORTED",
        });
      }),
    );
    await expect(
      provider.createBase({ name: "New", visibility: "organization" }),
    ).rejects.toBeInstanceOf(KnowledgeFacadeError);
    expect(calls).toBe(1);
  });

  it("maps a missing Work session to auth_required instead of unavailable", async () => {
    const provider = createKnowledgeHttpProvider(
      transport(async () => {
        throw new AccessTokenError("Not authenticated", "UNAUTHORIZED");
      }),
    );
    await expect(provider.probeCapability()).resolves.toEqual({
      available: false,
      status: "auth_required",
    });
  });

  it("maps capability 401 to auth_required and connection failure to unavailable", async () => {
    const auth = createKnowledgeHttpProvider(
      transport(async () => jsonResponse(401, { message_key: "errors.auth" })),
    );
    await expect(auth.probeCapability()).resolves.toEqual({
      available: false,
      status: "auth_required",
    });

    const down = createKnowledgeHttpProvider(
      transport(async () => {
        throw new AuthorizedBackendTransportError("down", {
          status: 0,
          errorCode: "FETCH_FAILED",
        });
      }),
    );
    await expect(down.probeCapability()).resolves.toEqual({
      available: false,
      status: "blocked_provider_unavailable",
    });
  });
});

describe("knowledge schema fail-closed", () => {
  it("rejects invalid contract payloads", async () => {
    const { parseKnowledgeBaseSnapshot } = await import("./knowledge-schema");
    expect(() => parseKnowledgeBaseSnapshot({ id: "x" })).toThrowError(
      /KNOWLEDGE_CONTRACT_INVALID/,
    );
  });
});
