import { describe, expect, it } from "vitest";
import { ExpertGatewayError } from "./expert-gateway-client";

describe("expert-artifact-download guards", () => {
  // @lat: [[expert-execution-tests#Cross-origin rejection]]
  it("ExpertGatewayError carries cross-origin rejection code", () => {
    const err = new ExpertGatewayError("Cross-origin URL rejected", {
      status: 400,
      errorCode: "CROSS_ORIGIN_REJECTED",
    });
    expect(err.errorCode).toBe("CROSS_ORIGIN_REJECTED");
  });
});
