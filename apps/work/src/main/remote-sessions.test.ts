import http from "http";
import { afterEach, describe, expect, it } from "vitest";
import { remoteListCachedSessions } from "./remote-sessions";

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("remote cached sessions", () => {
  it("fails closed when Main cannot establish durable metadata", async () => {
    const server = http.createServer((_request, response) => {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ sessions: [{ id: "remote-session", title: "Remote", started_at: 1 }] }));
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server address missing");

    await expect(remoteListCachedSessions({
      remoteUrl: `http://127.0.0.1:${address.port}`,
      apiKey: "test-token",
      profile: "default",
    })).resolves.toEqual([]);
  });
});
