import { describe, expect, it } from "vitest";
import { normalizeProductFillFields } from "../src/renderer/src/components/hermes/panel/host-form-fill/normalizeProductFillFields";

describe("normalizeProductFillFields", () => {
  it("normalizes OPPO Reno 15 product fields", () => {
    const result = normalizeProductFillFields({
      sku: "OPPO-RENO15-256GB",
      brand: "OPPO",
      model: "Reno 15",
      productName: "OPPO Reno 15 256GB",
      series: "Reno 系列",
      operatingSystem: "ColorOS",
      chip: "天玑8450",
      screenSize: "6.35 英寸",
      memory: "12GB",
      storage: "256GB",
      color: "灰色",
      batteryMah: "6200mAh / 80W 快充",
      network: "4G FDD-LTE / 4G TD-LTE / 5G",
      retailPrice: "¥2,999",
      releaseDate: "2025-06-01",
      status: "草稿",
      description: "高端拍照、时尚小巧",
    });

    expect(result).toEqual({
      sku: "OPPO-RENO15-256GB",
      brand: "OPPO",
      model: "Reno 15",
      productName: "OPPO Reno 15 256GB",
      series: "Reno 系列",
      os: "ColorOS",
      chipset: "天玑8450",
      screenSize: "6.35 英寸",
      ram: "12GB",
      storage: "256GB",
      color: "灰色",
      batteryMah: 6200,
      network: "4G FDD-LTE / 4G TD-LTE / 5G",
      retailPrice: 2999,
      launchDate: "2025-06-01",
      status: "draft",
      description: "高端拍照、时尚小巧",
    });
  });

  it("converts retailPrice from number", () => {
    expect(normalizeProductFillFields({ retailPrice: 2999 }).retailPrice).toBe(2999);
  });

  it("converts batteryMah from number", () => {
    expect(normalizeProductFillFields({ batteryMah: 6200 }).batteryMah).toBe(6200);
  });

  it("maps Chinese status 草稿 to draft", () => {
    expect(normalizeProductFillFields({ status: "草稿", brand: "X" }).status).toBe("draft");
  });

  it("strips empty fields", () => {
    const result = normalizeProductFillFields({
      brand: "OPPO",
      model: "",
      sku: null,
      color: undefined,
    });
    expect(result).toEqual({ brand: "OPPO" });
  });
});
