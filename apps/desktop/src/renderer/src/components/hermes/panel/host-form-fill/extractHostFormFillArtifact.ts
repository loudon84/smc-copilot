import type { HostFormFillArtifact } from "./types";

/** Fenced blocks: ```host_form_fill / ```json / ``` (untagged) */
const FENCED_BLOCK_RE = /```(?:host_form_fill|json)?\s*\r?\n?([\s\S]*?)\r?\n?```/gi;

const PRODUCT_FIELD_KEYS = new Set([
  "sku",
  "brand",
  "model",
  "productName",
  "series",
  "os",
  "operatingSystem",
  "chipset",
  "chip",
  "screenSize",
  "ram",
  "memory",
  "storage",
  "color",
  "batteryMah",
  "network",
  "retailPrice",
  "launchDate",
  "releaseDate",
  "status",
  "description",
]);

const META_KEYS = new Set([
  "type",
  "formType",
  "action",
  "target",
  "confidence",
  "subTables",
  "payload",
  "commandId",
  "createdAt",
  "expectAck",
  "timeoutMs",
]);

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

function looksLikeProductFields(obj: Record<string, unknown>): boolean {
  let hits = 0;
  for (const key of Object.keys(obj)) {
    if (PRODUCT_FIELD_KEYS.has(key)) hits += 1;
  }
  return hits >= 2;
}

function resolveArtifactFields(obj: Record<string, unknown>): Record<string, unknown> | null {
  if (isNonEmptyRecord(obj.fields)) return obj.fields;
  const payload = obj.payload;
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    const payloadFields = (payload as Record<string, unknown>).fields;
    if (isNonEmptyRecord(payloadFields)) return payloadFields;
    const payloadProduct = (payload as Record<string, unknown>).product;
    if (isNonEmptyRecord(payloadProduct)) return payloadProduct;
  }
  return null;
}

function buildArtifact(
  fields: Record<string, unknown>,
  source: Record<string, unknown>,
): HostFormFillArtifact {
  const formType =
    typeof source.formType === "string" && source.formType.trim()
      ? source.formType.trim()
      : "product";
  const action =
    typeof source.action === "string" && source.action.trim()
      ? source.action.trim()
      : "create";
  const confidence =
    typeof source.confidence === "number" && Number.isFinite(source.confidence)
      ? source.confidence
      : undefined;

  let subTables: Record<string, unknown[]> | undefined;
  if (
    typeof source.subTables === "object" &&
    source.subTables !== null &&
    !Array.isArray(source.subTables)
  ) {
    subTables = source.subTables as Record<string, unknown[]>;
  }

  return {
    type: "host.form.fill",
    formType,
    action,
    confidence,
    fields,
    subTables,
  };
}

function parseTypedArtifact(raw: unknown): HostFormFillArtifact | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type.trim() : "";
  const isHostFormFillType =
    type === "host.form.fill" || type === "desktop.host.form.fill";
  if (!isHostFormFillType) return null;

  const fields = resolveArtifactFields(obj);
  if (!fields) return null;

  return buildArtifact(fields, obj);
}

function parseFlatProductArtifact(raw: unknown): HostFormFillArtifact | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const type = typeof obj.type === "string" ? obj.type.trim() : "";
  if (
    type &&
    type !== "host.form.fill" &&
    type !== "desktop.host.form.fill"
  ) {
    return null;
  }

  const nested = resolveArtifactFields(obj);
  if (nested) return buildArtifact(nested, obj);

  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (META_KEYS.has(key)) continue;
    if (!PRODUCT_FIELD_KEYS.has(key)) continue;
    fields[key] = value;
  }
  if (!isNonEmptyRecord(fields) || !looksLikeProductFields(fields)) return null;

  return buildArtifact(fields, obj);
}

function tryParseBlock(jsonText: string): HostFormFillArtifact | null {
  const trimmed = jsonText.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parseTypedArtifact(parsed) ?? parseFlatProductArtifact(parsed);
  } catch {
    return null;
  }
}

export function extractHostFormFillArtifact(content: string): HostFormFillArtifact | null {
  if (!content.trim()) return null;

  const matches = [...content.matchAll(FENCED_BLOCK_RE)];
  if (matches.length === 0) return null;

  let lastArtifact: HostFormFillArtifact | null = null;
  for (const match of matches) {
    const artifact = tryParseBlock(match[1] ?? "");
    if (artifact) lastArtifact = artifact;
  }

  return lastArtifact;
}
