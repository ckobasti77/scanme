import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.FAIR_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = "output/playwright";
const garagePath = "/sajam/garaza";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function watchPage(page, errors) {
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("ERR_INTERNET_DISCONNECTED")
    ) {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
}

async function seedGarage(page) {
  await page.evaluate(() => {
    const photoUrl = "/fair/auto-moto-fest-2026/audi-rs-3-showroom.png";
    localStorage.setItem(
      "scanme:fair-garage",
      JSON.stringify({
        version: 2,
        events: {
          "auto-moto-fest-2026": [
            {
              modelId: "garage-audi-rs3",
              savedAt: 3,
              lastKnown: {
                eventSlug: "auto-moto-fest-2026",
                modelSlug: "audi-rs-3-sportback",
                brandName: "Audi",
                displayName: "RS 3 Sportback",
                priceText: "Cena na upit",
                photoUrl,
              },
            },
            {
              modelId: "garage-bmw-i4",
              savedAt: 2,
              lastKnown: {
                eventSlug: "auto-moto-fest-2026",
                modelSlug: "bmw-i4-m50",
                brandName: "BMW",
                displayName: "i4 M50",
                priceText: "84.900 EUR",
                photoUrl,
              },
            },
            {
              modelId: "garage-volvo-ex30",
              savedAt: 1,
              lastKnown: {
                eventSlug: "auto-moto-fest-2026",
                modelSlug: "volvo-ex30",
                brandName: "Volvo",
                displayName: "EX30 Ultra",
                priceText: "47.490 EUR",
                photoUrl,
              },
            },
          ],
        },
        passportBadges: [],
      }),
    );
  });
}

async function audit(page, label) {
  const result = await page.evaluate(() => {
    const visible = [...document.querySelectorAll("a, button")].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden";
    });
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
      undersized: visible
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        })
        .filter((item) => item.width < 44 || item.height < 44),
    };
  });
  assert(!result.overflow, `${label}: horizontal overflow`);
  assert(result.robots === "noindex, nofollow", `${label}: robots metadata drift`);
  assert(
    result.undersized.length === 0,
    `${label}: undersized controls ${JSON.stringify(result.undersized)}`,
  );
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const errors = [];

try {
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
    { width: 1440, height: 900 },
  ]) {
    const context = await browser.newContext({
      viewport,
      colorScheme: "light",
      hasTouch: viewport.width < 900,
      isMobile: viewport.width < 600,
      deviceScaleFactor: viewport.width < 600 ? 3 : 1,
    });
    const page = await context.newPage();
    watchPage(page, errors);
    await page.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
    await seedGarage(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /Auto Moto Fest/i }).click();
    assert((await page.getByRole("article").count()) >= 3, `${viewport.width}: model cards missing`);
    await audit(page, `garage ${viewport.width}x${viewport.height}`);
    await page.screenshot({
      path: `${outputDir}/fair-garage-${viewport.width}x${viewport.height}.png`,
      fullPage: viewport.width >= 900,
    });
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  watchPage(page, errors);
  await page.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
  await seedGarage(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /Auto Moto Fest/i }).tap();

  const compareButtons = page.getByRole("button", { name: /Izaberi za poređenje/i });
  await compareButtons.nth(0).tap();
  await compareButtons.nth(1).tap();
  await page.waitForTimeout(350);
  const compareLink = page.getByRole("button", { name: /Uporedi modele/i });
  assert(await compareLink.isVisible(), "comparison action did not unlock after two selections");
  await page.evaluate(() => window.scrollTo(0, 0));
  await Promise.all([
    page.waitForURL(/\/sajam\/garaza\/poredjenje/),
    compareLink.tap(),
  ]);
  await page.waitForLoadState("networkidle");
  await page.getByRole("heading", { name: "Poređenje modela" }).waitFor();
  const comparisonHeadings = await page.locator("h1, h2").allTextContents();
  assert(
    await page.getByRole("heading", { name: "Poređenje modela" }).isVisible(),
    `comparison page did not open (${page.url()} / ${comparisonHeadings.join(" | ")} / ${errors.join(" ; ")})`,
  );
  await audit(page, "comparison 390x844");
  await page.screenshot({ path: `${outputDir}/fair-garage-comparison-390x844.png`, fullPage: true });

  await page.getByRole("link", { name: /Nazad u garažu/i }).tap();
  await page.waitForLoadState("networkidle");
  await page.getByRole("tab", { name: /Auto Moto Fest/i }).tap();
  await context.setOffline(true);
  await page.getByRole("button", { name: /Ukloni EX30 Ultra/i }).tap();
  await page.waitForTimeout(260);
  assert(
    (await page.getByRole("article").count()) >= 2,
    "offline remove left the garage in an invalid state",
  );
  await page.getByRole("tab", { name: /Elektromobilnost/i }).tap();
  assert(
    await page.getByRole("heading", { name: /Garaža je spremna/i }).isVisible(),
    "empty event state is missing",
  );
  await context.close();

  const reduced = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const reducedPage = await reduced.newPage();
  watchPage(reducedPage, errors);
  await reducedPage.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
  await seedGarage(reducedPage);
  await reducedPage.reload({ waitUntil: "networkidle" });
  await reducedPage.getByRole("tab", { name: /Auto Moto Fest/i }).tap();
  await audit(reducedPage, "garage reduced motion");
  await reduced.close();

  assert(errors.length === 0, `browser errors:\n${errors.join("\n")}`);
  console.log("Fair garage browser checks passed.");
} finally {
  await browser.close();
}
