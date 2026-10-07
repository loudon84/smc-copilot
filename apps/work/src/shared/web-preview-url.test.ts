import { describe, expect, it } from "vitest";
import {
  isLikelyAttachmentDownloadUrl,
  isWebPreviewableUrl,
  shouldOpenUrlExternally,
} from "./web-preview-url";

describe("web-preview-url", () => {
  it("allows localhost HTTP and remote HTTPS for web-preview", () => {
    expect(isWebPreviewableUrl("http://localhost:3000")).toBe(true);
    expect(isWebPreviewableUrl("http://127.0.0.1:8080/path")).toBe(true);
    expect(isWebPreviewableUrl("https://example.com/docs")).toBe(true);
    expect(isWebPreviewableUrl("about:blank")).toBe(true);
  });

  it("blocks LAN HTTP that Main will-attach-webview rejects", () => {
    const lan =
      "http://192.168.102.247:9010/agent-runtime-export/artifacts/foo.md?X-Amz-Signature=abc";
    expect(isWebPreviewableUrl(lan)).toBe(false);
    expect(shouldOpenUrlExternally(lan)).toBe(true);
  });

  it("routes attachment disposition / file extensions to system browser", () => {
    const presigned =
      "https://cdn.example.com/bucket/file.docx?response-content-disposition=attachment%3B%20filename%3D%22a.docx%22";
    expect(isLikelyAttachmentDownloadUrl(presigned)).toBe(true);
    expect(shouldOpenUrlExternally(presigned)).toBe(true);
    expect(
      isLikelyAttachmentDownloadUrl("https://example.com/report.pdf"),
    ).toBe(true);
    expect(shouldOpenUrlExternally("https://example.com/page")).toBe(false);
  });
});
