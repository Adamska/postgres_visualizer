// Captures the main screens of the browser preview (mock backend) for visual review.
// Usage: pnpm build && node Scripts/screenshots.mjs <output dir> [base url]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const outDir = process.argv[2] ?? "screenshots";
mkdirSync(outDir, { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: true } });
const base = process.argv[3] ?? "http://localhost:4173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 880 }, deviceScaleFactor: 2 });
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const settle = (ms = 700) => page.waitForTimeout(ms);

await page.goto(`${base}/?empty`);
await settle(1200);
await shot("welcome");
await page.getByText("New connection", { exact: true }).first().click();
await settle();
await shot("connection-dialog");
await page.keyboard.press("Escape");

await page.goto(`${base}/`);
await settle(1500);
await page.getByRole("tab").first().click();
await settle();
await shot("table-tab");

// JSON: focus the `profile` cell of the first row, open the inspector, then the value viewer.
const grid = await page.getByTestId("data-grid").boundingBox();
const jsonCell = { x: grid.x + 44 + 90 + 160 + 108 + 80, y: grid.y + 32 + 14 };
await page.mouse.click(jsonCell.x, jsonCell.y);
await page.keyboard.press("Alt+Meta+i");
await settle();
await shot("inspector-json");
await page.mouse.dblclick(jsonCell.x, jsonCell.y);
await settle();
await shot("value-viewer-json");
await page.getByRole("button", { name: "Text" }).click();
await settle(300);
await shot("value-editor-json-text");
await page.keyboard.press("Escape");
await page.keyboard.press("Alt+Meta+i");
await settle(300);
await page.getByRole("tab").nth(1).click();
await settle(900);
await shot("query-tab");
await page.evaluate(() => {
  document.documentElement.dataset.theme = "dark";
});
await settle(600);
await shot("query-tab-dark");
await page.getByRole("tab").first().click();
await settle();
await shot("table-tab-dark");
await page.mouse.click(jsonCell.x, jsonCell.y);
await page.keyboard.press("Alt+Meta+i");
await page.mouse.dblclick(jsonCell.x, jsonCell.y);
await settle();
await shot("value-viewer-json-dark");

await browser.close();
await server.close();
console.log(`Screenshots written to ${outDir}`);
