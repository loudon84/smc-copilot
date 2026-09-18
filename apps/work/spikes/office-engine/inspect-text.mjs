import { chromium } from "playwright";

const url =
  process.argv[2] ||
  "http://127.0.0.1:4177/?engine=docx-preview&fixture=DOC-01";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
await page.waitForTimeout(2500);
const text = await page.locator("body").innerText();
console.log(text.slice(0, 800));
await browser.close();
