import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const shotDir = join(
  here,
  "../../../../docs/work/reviews/assets/office-engine-spike",
);
mkdirSync(shotDir, { recursive: true });

const base = process.env.SPIKE_URL || "http://127.0.0.1:4177";
const cases = [
  ["open-file-viewer", "DOC-01"],
  ["open-file-viewer", "XLS-01"],
  ["open-file-viewer", "PPT-01"],
  ["docx-preview", "DOC-01"],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const [engine, fixture] of cases) {
  const url = `${base}/?engine=${engine}&fixture=${fixture}`;
  const t0 = Date.now();
  let err = "";
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForFunction(
      () =>
        document.querySelector("[data-ready='1']") ||
        document.querySelector("[data-testid='spike-error']"),
      { timeout: 45_000 },
    );
    await page.waitForTimeout(1500);
    const errEl = page.locator("[data-testid='spike-error']");
    err = (await errEl.count()) ? (await errEl.textContent()) || "" : "";
  } catch (e) {
    err = String(e);
  }
  const name = `${engine}-${fixture}.png`;
  await page.screenshot({ path: join(shotDir, name), fullPage: true });
  console.log(
    JSON.stringify({
      engine,
      fixture,
      ms: Date.now() - t0,
      error: err.trim(),
      screenshot: name,
    }),
  );
}

await browser.close();
