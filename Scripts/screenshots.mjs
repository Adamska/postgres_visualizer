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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const shot = (name) => page.screenshot({ path: join(outDir, `${name}.png`) });
const settle = (ms = 700) => page.waitForTimeout(ms);
const palette = async (text) => {
  await page.keyboard.press("Meta+k");
  await settle(300);
  await page.keyboard.type(text);
  await settle(300);
  await page.keyboard.press("Enter");
  await settle(900);
};

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
await settle(900);
await shot("table-rich-cells");

// Grid geometry of the orders table: row markers, then column widths by kind.
const grid = await page.getByTestId("data-grid").boundingBox();
const widths = [90, 260, 124, 160, 160, 160, 160, 160, 90, 200];
const columnX = (index) => grid.x + 44 + widths.slice(0, index).reduce((a, b) => a + b, 0) + 40;
const rowY = (row) => grid.y + 32 + 28 * row + 14;

// Selection statistics: select a block of totals.
await page.mouse.click(columnX(4), rowY(0));
await page.keyboard.down("Shift");
await page.mouse.click(columnX(4), rowY(7));
await page.keyboard.up("Shift");
await settle(400);
await shot("selection-stats");

// Hover a foreign key to peek at the referenced customer.
await page.mouse.move(columnX(2), rowY(2));
await settle(1200);
await shot("fk-peek");
await page.mouse.move(grid.x + 5, grid.y + grid.height - 5);

// Column profile from the header menu.
await page.mouse.click(columnX(4), grid.y + 16, { button: "right" });
await settle(300);
await page.getByText("Profile column…").click();
await settle(900);
await shot("column-profile");
await page.keyboard.press("Escape");
await page.mouse.click(columnX(3), grid.y + 16, { button: "right" });
await settle(300);
await page.getByText("Profile column…").click();
await settle(900);
await shot("column-profile-enum");
await page.keyboard.press("Escape");

// Quick filters from a cell.
await page.mouse.click(columnX(3), rowY(1), { button: "right" });
await settle(400);
await shot("cell-menu-filters");
await page.keyboard.press("Escape");

// Inspector with related records, then the form view.
await page.mouse.click(columnX(0), rowY(0));
await page.keyboard.press("Alt+Meta+i");
await settle(900);
await shot("inspector-related");
await page.keyboard.press("Alt+Meta+i");
await page.getByLabel("Form view").click();
await settle(900);
await shot("form-view");
await page.getByLabel("Grid view").click();

// Command palette.
await page.keyboard.press("Meta+k");
await settle(300);
await page.keyboard.type("ord");
await settle(400);
await shot("command-palette");
await page.keyboard.press("Escape");

// Query tab: run, chart, pin and plan.
await page.getByRole("tab").nth(2).click();
await settle(800);
await page.getByRole("button", { name: "Run", exact: true }).click();
await settle(900);
await shot("query-result");
await page.getByLabel("Chart").click();
await settle(900);
await shot("query-chart");
await page.getByText("Line", { exact: true }).click();
await settle(600);
await shot("query-chart-line");
await page.getByLabel("Grid").click();
await page.getByLabel("Pin this result to compare later runs").click();
await page.getByRole("button", { name: "Run", exact: true }).click();
await settle(700);
await page.getByRole("button", { name: "Compare", exact: true }).click();
await settle(300);
await page.getByRole("menuitem").first().click();
await settle(700);
await shot("query-compare");
await page.getByRole("button", { name: "Stop comparing" }).click();
await page.keyboard.press("Alt+Meta+Shift+e");
await settle(1000);
await shot("explain-plan");

// ER diagram and server monitoring.
await palette("diagram of public");
await settle(600);
await shot("er-diagram");
await palette("server activity");
await settle(1200);
await shot("server-activity");
await page.getByText("Tables", { exact: true }).click();
await settle(900);
await shot("server-tables");
await page.getByText("Indexes", { exact: true }).click();
await settle(900);
await shot("server-indexes");

// Production connection: tinted window and confirmations.
await page.getByText("Supabase prod", { exact: true }).click();
await settle(1500);
await palette("new query tab");
await page.keyboard.type("DELETE FROM orders");
await page.getByRole("button", { name: "Run", exact: true }).click();
await settle(700);
await shot("production-confirm");
await page.keyboard.press("Escape");

await page.evaluate(() => {
  document.documentElement.dataset.theme = "dark";
});
await settle(600);
await shot("production-dark");
await page.getByRole("tab").first().click();
await settle(900);
await shot("table-rich-cells-dark");
await palette("diagram of public");
await settle(600);
await shot("er-diagram-dark");

// Lost server: the mock stops answering pings; a focus event triggers the health check.
await page.evaluate(() => {
  document.documentElement.dataset.theme = "light";
  window.__tableppMock.alive = false;
  window.dispatchEvent(new Event("focus"));
});
await settle(600);
await shot("connection-lost");

await browser.close();
await server.close();
console.log(`Screenshots written to ${outDir}`);
