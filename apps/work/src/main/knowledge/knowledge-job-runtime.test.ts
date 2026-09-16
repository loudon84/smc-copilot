import { describe, expect, it } from "vitest";
import { mapIngestionStatus } from "./knowledge-job-runtime";

describe("ingestion status mapping", () => {
  it("completes only when remote status is active", () => {
    expect(mapIngestionStatus("active")).toBe("completed");
    expect(mapIngestionStatus("upload_unknown")).toBe("uploading");
    expect(mapIngestionStatus("parsing")).toBe("processing");
    expect(mapIngestionStatus("failed")).toBe("failed");
    expect(mapIngestionStatus("cancelled")).toBe("cancelled");
  });
});
