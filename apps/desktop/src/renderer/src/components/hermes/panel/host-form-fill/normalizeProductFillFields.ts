function toStringValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

function toNumberValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  const digits = raw.replace(/[^\d.]/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

function toDateValue(value: unknown): string | undefined {
  const s = toStringValue(value);
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (slash) {
    const mm = slash[2].padStart(2, "0");
    const dd = slash[3].padStart(2, "0");
    return `${slash[1]}-${mm}-${dd}`;
  }
  return s;
}

function normalizeStatus(value: unknown): string | undefined {
  const s = toStringValue(value);
  if (!s) return undefined;
  const lower = s.toLowerCase();
  if (lower === "draft" || s === "草稿") return "draft";
  if (lower === "active" || s === "启用" || s === "上架") return "active";
  return s;
}

function toBatteryMah(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = toStringValue(value);
  if (!s) return undefined;
  const m = s.match(/(\d+)\s*mah/i);
  if (m) return Number(m[1]);
  return toNumberValue(s);
}

function stripEmpty<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

/** Keys must match CRM-Lite JSSDK `fillProductForm()` (`crm-lite-jssdk.js`). */
export function normalizeProductFillFields(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return stripEmpty({
    sku: toStringValue(input.sku),
    brand: toStringValue(input.brand),
    model: toStringValue(input.model),
    productName: toStringValue(input.productName),
    series: toStringValue(input.series),
    os: toStringValue(input.os ?? input.operatingSystem),
    chipset: toStringValue(input.chipset ?? input.chip),
    screenSize: toStringValue(input.screenSize),
    ram: toStringValue(input.ram ?? input.memory),
    storage: toStringValue(input.storage),
    color: toStringValue(input.color),
    batteryMah: toBatteryMah(input.batteryMah),
    network: toStringValue(input.network),
    retailPrice: toNumberValue(input.retailPrice),
    launchDate: toDateValue(input.launchDate ?? input.releaseDate),
    status: normalizeStatus(input.status),
    description: toStringValue(input.description),
  });
}
