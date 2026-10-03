import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.FAIR_BASE_URL ?? "http://127.0.0.1:3199";
const modelPath = "/sajam/auto-moto-fest-2026/model/audi-rs-3-sportback";
const audiencePath = `${modelPath}/glas-publike`;
const outputDir = "output/playwright";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function watchPage(page, errors) {
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
}

async function clearStorage(page) {
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
}

async function auditPage(page, label) {
  const result = await page.evaluate(() => {
    const controls = [...document.querySelectorAll("a, button, summary")]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && element.getClientRects().length > 0;
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: element.textContent?.trim().replace(/\s+/g, " ") ?? "",
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    return {
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      robots: document.querySelector('meta[name="robots"]')?.getAttribute("content"),
      undersized: controls.filter((control) => control.width < 44 || control.height < 44),
    };
  });
  assert(!result.overflow, `${label}: horizontal overflow`);
  assert(result.robots === "noindex, nofollow", `${label}: robots metadata drift`);
  assert(result.undersized.length === 0, `${label}: undersized controls ${JSON.stringify(result.undersized)}`);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const errors = [];

try {
  for (const viewport of [
    { width: 375, height: 667 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: "light" });
    const page = await context.newPage();
    watchPage(page, errors);
    await page.goto(`${baseUrl}${modelPath}?mode=advanced`, { waitUntil: "networkidle" });
    await clearStorage(page);
    await auditPage(page, `model ${viewport.width}x${viewport.height}`);
    await page.goto(
      `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=success&questions=5`,
      { waitUntil: "networkidle" },
    );
    await auditPage(page, `audience ${viewport.width}x${viewport.height}`);
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await context.newPage();
  watchPage(page, errors);
  await page.goto(
    `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=success&questions=5`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(page);
  await page.locator(".fair-vote-answer").first().click();
  assert(
    (await page.locator(".fair-vote-answer").first().getAttribute("aria-pressed")) === "true",
    "vote: pressed feedback is not immediate",
  );
  assert(
    (await page.locator(".fair-vote-status").innerText()).includes("Čuvamo"),
    "vote: submitting state is missing",
  );
  await page.waitForTimeout(1150);
  assert((await page.locator(".fair-vote-answer__percent").allTextContents()).join(",") === "49%,33%,18%", "vote: first result mismatch");
  await page.locator(".fair-vote-answer").nth(1).click();
  await page.waitForTimeout(1150);
  assert((await page.locator(".fair-vote-answer__percent").allTextContents()).join(",") === "46%,36%,18%", "vote: changed result mismatch");
  await page.reload({ waitUntil: "networkidle" });
  assert(
    (await page.locator('.fair-vote-answer[aria-pressed="true"] .fair-vote-answer__label').innerText()) === "Performanse",
    "vote: localStorage state did not survive refresh",
  );
  await page.screenshot({ path: `${outputDir}/fair-audience-375x667-public-results.png` });
  await page.locator(".fair-flow-primary").click();
  await page.locator(".fair-vote-answer").first().click();
  await page.waitForTimeout(1150);
  await page.locator(".fair-question-progress button").first().click();
  assert((await page.locator("#fair-question-title").innerText()).includes("prvi utisak"), "vote: return to answered question failed");
  await context.close();

  const thresholdContext = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const thresholdPage = await thresholdContext.newPage();
  watchPage(thresholdPage, errors);
  await thresholdPage.goto(
    `${baseUrl}${audiencePath}?mode=starter&threshold=below&result=success&questions=1`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(thresholdPage);
  await thresholdPage.locator(".fair-vote-answer").first().click();
  await thresholdPage.waitForTimeout(380);
  assert((await thresholdPage.locator(".fair-vote-answer__percent").count()) === 0, "threshold: percentages are visible");
  assert((await thresholdPage.locator(".fair-vote-status").innerText()).includes("Rezultati uskoro"), "threshold: message missing");
  await thresholdPage.screenshot({ path: `${outputDir}/fair-audience-412x915-threshold.png` });
  await thresholdContext.close();

  const errorContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const errorPage = await errorContext.newPage();
  watchPage(errorPage, errors);
  await errorPage.goto(
    `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=error&questions=5`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(errorPage);
  await errorPage.locator(".fair-vote-answer").first().click();
  await errorPage.waitForTimeout(380);
  assert((await errorPage.locator('.fair-vote-status [role="alert"]').innerText()).includes("nije sačuvan"), "error: honest failure missing");
  assert((await errorPage.locator(".fair-vote-answer__percent").count()) === 0, "error: result shown before success");
  await errorPage.locator(".fair-vote-status button").click();
  await errorPage.waitForTimeout(380);
  assert((await errorPage.locator('.fair-vote-status [role="alert"]').count()) === 1, "error: retry state missing");
  await errorContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const reducedPage = await reducedContext.newPage();
  watchPage(reducedPage, errors);
  await reducedPage.goto(
    `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=success&questions=1`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(reducedPage);
  await reducedPage.locator(".fair-vote-answer").first().click();
  await reducedPage.waitForTimeout(380);
  assert((await reducedPage.locator(".fair-vote-answer__percent").allTextContents()).join(",") === "49%,33%,18%", "reduced motion: final state was not immediate");
  await reducedContext.close();

  const sheetContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const sheetPage = await sheetContext.newPage();
  watchPage(sheetPage, errors);
  await sheetPage.goto(`${baseUrl}${modelPath}?mode=advanced`, { waitUntil: "networkidle" });
  await clearStorage(sheetPage);
  await sheetPage.locator(".fair-save-button").click();
  assert((await sheetPage.locator(".fair-save-button").innerText()).includes("Sačuvano"), "garage: saved label missing");
  assert((await sheetPage.locator(".fair-garage-badge").innerText()) === "1", "garage: badge did not increment");
  assert((await sheetPage.locator(".fair-save-button").evaluate((element) => getComputedStyle(element).maxWidth)) === "220px", "garage: saved morph missing");
  await sheetPage.locator(".fair-action-grid button").first().click();
  assert((await sheetPage.locator(".fair-rating-field").count()) === 3, "advanced rating: expected three fields");
  assert((await sheetPage.locator(".fair-sheet > header button").getAttribute("aria-label")) === null, "rating: close button label structure changed");
  assert((await sheetPage.locator(".fair-sheet > header button").innerText()) === "Zatvori", "rating: close accessible text missing");
  await sheetPage.keyboard.press("Shift+Tab");
  assert(await sheetPage.locator(".fair-sheet__primary").evaluate((element) => element === document.activeElement), "sheet: focus trap did not wrap backward");
  await sheetPage.keyboard.press("Tab");
  assert(await sheetPage.locator(".fair-sheet > header button").evaluate((element) => element === document.activeElement), "sheet: focus trap did not wrap forward");
  await sheetPage.waitForTimeout(320);
  await sheetPage.screenshot({ path: `${outputDir}/fair-rating-390x844-advanced-sheet.png` });
  await sheetPage.keyboard.press("Escape");
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: Escape did not close");
  await sheetPage.locator(".fair-action-grid button").nth(1).click();
  await sheetPage.locator('input[name="name"]').fill("Test korisnik");
  await sheetPage.locator('input[name="email"]').fill("test@example.com");
  await sheetPage.locator('input[name="phone"]').fill("060000000");
  await sheetPage.locator(".fair-sheet__primary").click();
  assert((await sheetPage.locator('[role="status"]').innerText()).includes("nisu poslati"), "lead: honest no-send state missing");
  await sheetPage.locator(".fair-sheet > header button").click();
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: X did not close");
  await sheetPage.locator(".fair-action-grid button").nth(2).click();
  await sheetPage.mouse.click(4, 4);
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: backdrop did not close");
  await sheetPage.locator(".fair-action-grid button").first().click();
  await sheetPage.goBack();
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: browser back did not close");
  await sheetPage.goto(`${baseUrl}${modelPath}?mode=starter`, { waitUntil: "networkidle" });
  assert((await sheetPage.locator(".fair-action-grid button").count()) === 2, "starter actions: capability mismatch");
  await sheetPage.locator(".fair-action-grid button").first().click();
  assert((await sheetPage.locator(".fair-rating-field").count()) === 1, "starter rating: expected one field");
  assert((await sheetPage.locator(".fair-sheet__primary").innerText()) === "Sačuvaj ocenu", "starter rating: save label mismatch");
  await sheetPage.goto(`${baseUrl}${modelPath}?mode=free`, { waitUntil: "networkidle" });
  assert((await sheetPage.locator(".fair-action-grid button").count()) === 0, "free actions: unavailable capabilities are visible");
  await sheetContext.close();

  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, viewports: ["375x667", "390x844", "412x915"], errors }, null, 2));
} finally {
  await browser.close();
}
