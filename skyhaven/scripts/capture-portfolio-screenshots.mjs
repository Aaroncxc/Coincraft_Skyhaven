/**
 * Captures portfolio screenshots (PNG) into docs/portfolio_screenshots/.
 * Prerequisite: `npm run dev` running (default http://localhost:5173/).
 *
 * Usage: npm run capture:portfolio
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "docs", "portfolio_screenshots");
const baseUrl = process.env.PORTFOLIO_SCREENSHOT_URL ?? "http://localhost:5173/";

mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 960, height: 618 },
});
page.setDefaultTimeout(12_000);
const sidebarClick = (locator) => locator.click({ noWaitAfter: true });

try {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator(".intro-splash-start-btn").first().click({ timeout: 15_000 });
  await page.waitForTimeout(5500);

  await page.screenshot({ path: join(outDir, "01_main_ingame.png") });

  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Main Menu"]') }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, "02_main_menu_open.png") });
  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Main Menu"]') }));
  await page.waitForTimeout(300);

  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Shop"]') }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, "03_shop_placeholders.png") });
  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Shop"]') }));
  await page.waitForTimeout(200);

  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Islands"]') }));
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Next island" }).click({ noWaitAfter: true });
  await page.waitForTimeout(200);
  await page.getByRole("button", { name: "Next island" }).click({ noWaitAfter: true });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, "04_islands_home_custom.png") });
  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Islands"]') }));
  await page.waitForTimeout(200);

  await sidebarClick(page.locator("button.sidebar-item").filter({ hasText: "TOOLBOX" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, "05_toolbox_panel.png") });
  await sidebarClick(page.locator("button.sidebar-item").filter({ hasText: "TOOLBOX" }));
  await page.waitForTimeout(200);

  await sidebarClick(page.locator("button.sidebar-item").filter({ has: page.locator('img[alt="Main Menu"]') }));
  await page.waitForTimeout(400);
  await page.locator("button.generic-item", { hasText: "Daily Quests" }).evaluate((el) => el.click());
  await page.waitForSelector(".planner-backdrop", { timeout: 10_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outDir, "06_planner.png") });

  console.log(`Wrote 6 PNGs to ${outDir}`);
} finally {
  await browser.close();
}
