import { describe, expect, it } from "vitest";
import { extractContactToOrderWebUrl } from "../src/shared/hermes-panel/extract-contact-to-order-web-url";

describe("extractContactToOrderWebUrl", () => {
  it("detects truncation when bare url ends with %7", () => {
    const truncated =
      "http://192.168.99.35:8080/sdms/om/sdms_om_main/sdmsOmMain.do?method=addSoDesktop&tempType=%7B%22tempType%22%3A%5B%7B%22custname%22%3A%22%E9%87%91%22%7";
    const { url, looksTruncated } = extractContactToOrderWebUrl(truncated);
    expect(url).toBe(truncated);
    expect(looksTruncated).toBe(true);
  });

  it("prefers web_url from terminal json in message", () => {
    const content = `{"ok":true,"web_url":"http://192.168.99.35:8080/x.do?method=addSoDesktop&tempType=abc%7D"}`;
    const { url, looksTruncated } = extractContactToOrderWebUrl(content);
    expect(url).toContain("abc%7D");
    expect(looksTruncated).toBe(false);
  });
});
