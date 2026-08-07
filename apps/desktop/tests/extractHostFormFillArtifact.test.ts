import { describe, expect, it } from "vitest";
import { extractHostFormFillArtifact } from "../src/renderer/src/components/hermes/panel/host-form-fill/extractHostFormFillArtifact";

const VALID_ARTIFACT = {
  type: "host.form.fill",
  formType: "product",
  action: "create",
  fields: {
    brand: "OPPO",
    model: "Reno 15",
  },
  subTables: {},
};

describe("extractHostFormFillArtifact", () => {
  it("parses a valid host_form_fill block", () => {
    const content = `已提取商品参数：

\`\`\`host_form_fill
${JSON.stringify(VALID_ARTIFACT, null, 2)}
\`\`\``;

    const result = extractHostFormFillArtifact(content);
    expect(result).toEqual({
      type: "host.form.fill",
      formType: "product",
      action: "create",
      fields: { brand: "OPPO", model: "Reno 15" },
      subTables: {},
    });
  });

  it("uses the last host_form_fill block when multiple exist", () => {
    const first = { ...VALID_ARTIFACT, fields: { brand: "OLD" } };
    const second = { ...VALID_ARTIFACT, fields: { brand: "NEW" } };
    const content = `\`\`\`host_form_fill
${JSON.stringify(first)}
\`\`\`

\`\`\`host_form_fill
${JSON.stringify(second)}
\`\`\``;

    const result = extractHostFormFillArtifact(content);
    expect(result?.fields.brand).toBe("NEW");
  });

  it("returns null for invalid JSON", () => {
    const content = `\`\`\`host_form_fill
{ invalid json
\`\`\``;
    expect(extractHostFormFillArtifact(content)).toBeNull();
  });

  it("parses desktop.host.form.fill with payload.fields", () => {
    const content = `\`\`\`host_form_fill
${JSON.stringify({
  type: "desktop.host.form.fill",
  payload: { fields: { brand: "OPPO", model: "Reno 15" } },
})}
\`\`\``;
    const result = extractHostFormFillArtifact(content);
    expect(result?.fields).toEqual({ brand: "OPPO", model: "Reno 15" });
  });

  it("returns null when type is wrong", () => {
    const content = `\`\`\`host_form_fill
${JSON.stringify({ type: "other", fields: { a: 1 } })}
\`\`\``;
    expect(extractHostFormFillArtifact(content)).toBeNull();
  });

  it("returns null when fields is empty", () => {
    const content = `\`\`\`host_form_fill
${JSON.stringify({ type: "host.form.fill", fields: {} })}
\`\`\``;
    expect(extractHostFormFillArtifact(content)).toBeNull();
  });

  it("parses flat product fields inside ```json block", () => {
    const content = `以下是提取结果：

\`\`\`json
{
  "sku": "OPPO-RENO15-PLW110",
  "brand": "OPPO",
  "model": "Reno 15",
  "productName": "OPPO Reno 15 256GB",
  "retailPrice": 2999
}
\`\`\``;

    const result = extractHostFormFillArtifact(content);
    expect(result?.formType).toBe("product");
    expect(result?.fields.sku).toBe("OPPO-RENO15-PLW110");
    expect(result?.fields.brand).toBe("OPPO");
  });

  it("uses the last parseable fenced block", () => {
    const content = `\`\`\`json
{"sku":"OLD","brand":"X","model":"Y"}
\`\`\`

\`\`\`json
{"sku":"NEW","brand":"OPPO","model":"Reno 15"}
\`\`\``;
    expect(extractHostFormFillArtifact(content)?.fields.sku).toBe("NEW");
  });

  it("returns null for empty content", () => {
    expect(extractHostFormFillArtifact("")).toBeNull();
    expect(extractHostFormFillArtifact("   ")).toBeNull();
  });
});
