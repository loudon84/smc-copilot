import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import lock from "../../../../../contracts/knowledge-frontend/v1.0.0/consumer-lock.json";

const ROOT = join(
  import.meta.dirname,
  "../../../../../contracts/knowledge-frontend/v1.0.0",
);

describe("knowledge-frontend-contract consumer lock", () => {
  it("pins tag, commit, and file checksums", () => {
    expect(lock.tagName).toBe("knowledge-frontend-contract-v1.0.0");
    expect(lock.tagTargetCommit).toBe(
      "f11e7cbe74cee767cab7a0cbd65baf98c2f44018",
    );
    for (const [relative, meta] of Object.entries(lock.files)) {
      const bytes = readFileSync(join(ROOT, relative));
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(digest).toBe(meta.sha256);
    }
  });
});
