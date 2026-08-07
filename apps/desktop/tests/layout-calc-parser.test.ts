import { describe, expect, it } from "vitest";
import { evaluateLayoutCalc } from "../src/main/shell/layout-calc-parser";

describe("evaluateLayoutCalc", () => {
  it("subtracts px from percent base", () => {
    expect(evaluateLayoutCalc("100% - 40px", 800)).toBe(760);
  });

  it("supports chained subtraction", () => {
    expect(evaluateLayoutCalc("100% - 40px - 24px", 1000)).toBe(936);
  });

  it("supports addition", () => {
    expect(evaluateLayoutCalc("50% + 100px", 800)).toBe(500);
  });

  it("returns 0 for invalid input", () => {
    expect(evaluateLayoutCalc("not-a-number", 800)).toBe(0);
  });
});
