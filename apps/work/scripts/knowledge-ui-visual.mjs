/**
 * Knowledge UI visual gate (PRD-WORK-KNOWLEDGE-UI REQ-UI-010).
 * Playwright renders the Knowledge fixture tree only — no Electron CDP,
 * and this script never invokes test:live-visual.
 */
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { chromium } from "playwright";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const workRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = join(workRoot, "tests/visual/knowledge-ui/fixture");
const baselineDir = join(workRoot, "tests/visual/knowledge-ui/baselines");
const outputDir = join(workRoot, "tests/visual/knowledge-ui/output");

const REQUIRED_FILES = [
  "bases-card-1440-light.png",
  "bases-card-1440-dark.png",
  "bases-card-2048-light.png",
  "bases-card-2048-dark.png",
  "base-detail-1440-light.png",
  "base-detail-1440-dark.png",
  "base-detail-2048-light.png",
  "base-detail-2048-dark.png",
];

const MAX_DIFF_PIXEL_RATIO = 0.01;
const updateBaselines = process.argv.includes("--update-baselines");

const CASES = REQUIRED_FILES.map((name) => {
  const match = name.match(/^(bases-card|base-detail)-(1440|2048)-(light|dark)\.png$/);
  if (!match) throw new Error(`Invalid required filename: ${name}`);
  return {
    name,
    scene: match[1],
    width: Number(match[2]),
    theme: match[3],
  };
});

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function decodePng(buffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.subarray(0, 8).compare(sig) !== 0) {
    throw new Error("Not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (bitDepth !== 8 || channels === 0) {
    throw new Error(`Unsupported PNG (bitDepth=${bitDepth} colorType=${colorType})`);
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const reconRow = Buffer.alloc(stride);
  const pixels = Buffer.alloc(width * height * 4);
  let src = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[src];
    src += 1;
    const row = raw.subarray(src, src + stride);
    src += stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? reconRow[x - channels] : 0;
      const up = prev[x];
      const upLeft = x >= channels ? prev[x - channels] : 0;
      let recon = row[x];
      if (filter === 1) recon = (recon + left) & 255;
      else if (filter === 2) recon = (recon + up) & 255;
      else if (filter === 3) recon = (recon + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        recon = (recon + pr) & 255;
      } else if (filter !== 0) {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
      reconRow[x] = recon;
    }
    for (let x = 0; x < width; x += 1) {
      const dest = (y * width + x) * 4;
      const srcPx = x * channels;
      pixels[dest] = reconRow[srcPx];
      pixels[dest + 1] = reconRow[srcPx + 1];
      pixels[dest + 2] = reconRow[srcPx + 2];
      pixels[dest + 3] = channels === 4 ? reconRow[srcPx + 3] : 255;
    }
    prev = Buffer.from(reconRow);
  }
  return { width, height, data: pixels };
}

/** pixelmatch-compatible YIQ delta; threshold 0.1 (library default). */
function pixelmatch(imgA, imgB, diff, width, height, options = {}) {
  const threshold = options.threshold ?? 0.1;
  const maxDelta = 35215 * threshold * threshold;
  let changed = 0;
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    const yiq =
      0.29889531 * (imgA[o] - imgB[o]) ** 2 +
      0.58662247 * (imgA[o + 1] - imgB[o + 1]) ** 2 +
      0.11448223 * (imgA[o + 2] - imgB[o + 2]) ** 2;
    const alpha = ((imgA[o + 3] - imgB[o + 3]) / 255) ** 2 * 35215;
    const delta = yiq + alpha;
    if (delta > maxDelta) {
      changed += 1;
      if (diff) {
        diff[o] = 255;
        diff[o + 1] = 0;
        diff[o + 2] = 0;
        diff[o + 3] = 255;
      }
    } else if (diff) {
      diff[o] = imgA[o];
      diff[o + 1] = imgA[o + 1];
      diff[o + 2] = imgA[o + 2];
      diff[o + 3] = 40;
    }
  }
  return changed;
}

async function writeDiffPng(path, width, height, data) {
  const { createRequire } = await import("node:module");
  try {
    const require = createRequire(import.meta.url);
    const { PNG } = require("pngjs");
    const png = new PNG({ width, height });
    data.copy(png.data);
    writeFileSync(path, PNG.sync.write(png));
  } catch {
    writeFileSync(path.replace(/\.png$/, ".rgba"), data);
  }
}

async function main() {
  if (process.env.SMC_KNOWLEDGE_UI_VISUAL_USE_CDP === "1") {
    fail("MUST NOT connect Electron CDP");
    return;
  }

  mkdirSync(baselineDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  const server = await createServer({
    configFile: false,
    root: fixtureRoot,
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        "@renderer": join(workRoot, "src/renderer/src"),
      },
      dedupe: ["react", "react-dom", "three"],
    },
    server: {
      host: "127.0.0.1",
      port: 4178,
      strictPort: true,
      fs: {
        allow: [workRoot, join(workRoot, "../..")],
      },
    },
  });
  await server.listen();
  const origin = server.resolvedUrls?.local?.[0]?.replace(/\/$/, "") ?? "http://127.0.0.1:4178";

  const browser = await chromium.launch({ headless: true });
  let failed = 0;

  try {
    for (const testCase of CASES) {
      const page = await browser.newPage({
        viewport: { width: testCase.width, height: 960 },
        deviceScaleFactor: 1,
      });
      const url = `${origin}/?scene=${testCase.scene}&theme=${testCase.theme}`;
      await page.goto(url, { waitUntil: "networkidle" });
      const ready =
        testCase.scene === "base-detail"
          ? "knowledge-base-detail"
          : "knowledge-base-list";
      await page.waitForSelector(`[data-testid="${ready}"]`);
      await page.evaluate(async () => {
        if (document.fonts?.ready) await document.fonts.ready;
      });
      if (testCase.scene === "bases-card") {
        const columns = await page.locator(".knowledge-card-grid").evaluate((el) =>
          getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length,
        );
        if (columns !== 4) {
          fail(`${testCase.name}: expected 4 columns, got ${columns}`);
          failed += 1;
        }
      }
      const actual = await page.screenshot({ type: "png", animations: "disabled" });
      await page.close();

      const baselinePath = join(baselineDir, testCase.name);
      if (updateBaselines) {
        writeFileSync(baselinePath, actual);
        console.log(`updated ${testCase.name}`);
        continue;
      }

      if (!existsSync(baselinePath)) {
        writeFileSync(join(outputDir, testCase.name), actual);
        fail(`missing baseline ${testCase.name}`);
        failed += 1;
        continue;
      }

      const baseline = readFileSync(baselinePath);
      const imgA = decodePng(actual);
      const imgB = decodePng(baseline);
      if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
        writeFileSync(join(outputDir, testCase.name), actual);
        fail(
          `${testCase.name}: size ${imgA.width}x${imgA.height} != baseline ${imgB.width}x${imgB.height}`,
        );
        failed += 1;
        continue;
      }
      const diff = Buffer.alloc(imgA.data.length);
      const changed = pixelmatch(
        imgA.data,
        imgB.data,
        diff,
        imgA.width,
        imgA.height,
        { threshold: 0.1 },
      );
      const ratio = changed / (imgA.width * imgA.height);
      if (ratio > MAX_DIFF_PIXEL_RATIO) {
        writeFileSync(join(outputDir, testCase.name), actual);
        await writeDiffPng(
          join(outputDir, testCase.name.replace(".png", "-diff.png")),
          imgA.width,
          imgA.height,
          diff,
        );
        fail(
          `${testCase.name}: maxDiffPixelRatio ${ratio.toFixed(4)} > ${MAX_DIFF_PIXEL_RATIO}`,
        );
        failed += 1;
      } else {
        console.log(`${testCase.name}: ok (${ratio.toFixed(4)})`);
      }
    }

    const baselineNames = readdirSync(baselineDir).filter((name) => name.endsWith(".png"));
    if (!updateBaselines && baselineNames.length !== REQUIRED_FILES.length) {
      fail(
        `baseline count ${baselineNames.length} != ${REQUIRED_FILES.length}: ${baselineNames.join(", ")}`,
      );
      failed += 1;
    }
  } finally {
    await browser.close();
    await server.close();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
