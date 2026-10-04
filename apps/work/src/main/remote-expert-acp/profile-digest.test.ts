import { describe, expect, it } from "vitest";
import {
  canonicalProfileJson,
  canonicalizeRemoteExpertProfile,
  profileDigest,
} from "./profile-digest";

describe("remote expert profile digest", () => {
  it("sorts, trims, and dedupes refs then hashes canonical JSON", () => {
    const a = canonicalizeRemoteExpertProfile({
      name: "Sales Expert",
      agent_ref: "sales-expert",
      knowledge_refs: [" kb-b ", "kb-a", "kb-a"],
      connector_binding_refs: [],
      integration_account_refs: ["z", "a"],
    });
    expect(a.knowledge_refs).toEqual(["kb-a", "kb-b"]);
    expect(a.integration_account_refs).toEqual(["a", "z"]);
    const json = canonicalProfileJson(a);
    expect(json).not.toMatch(/:\s/);
    expect(json.startsWith('{"profile_version":1,')).toBe(true);
    expect(profileDigest(a)).toBe(profileDigest({ ...a }));
    expect(profileDigest(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});
