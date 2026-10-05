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

async function assertPrimaryActionsFit(page, label) {
  const result = await page.evaluate(() => ({
    footerBottom: document.querySelector(".fair-footer")?.getBoundingClientRect().bottom ?? -Infinity,
    saveBottom: document.querySelector(".fair-save-bar")?.getBoundingClientRect().bottom ?? Infinity,
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));
  assert(
    result.saveBottom <= result.viewportHeight,
    `${label}: primary actions require scrolling (${result.saveBottom}/${result.viewportHeight})`,
  );
  assert(
    result.footerBottom >= result.viewportHeight - 2,
    `${label}: page leaves unused space below the footer (${result.footerBottom}/${result.viewportHeight})`,
  );
  assert(
    result.scrollHeight <= result.viewportHeight + 2,
    `${label}: closed model page exceeds one screen (${result.scrollHeight}/${result.viewportHeight})`,
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
  ]) {
    const context = await browser.newContext({
      viewport,
      colorScheme: "light",
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 3,
    });
    const page = await context.newPage();
    watchPage(page, errors);
    await page.goto(`${baseUrl}${modelPath}?mode=advanced`, { waitUntil: "networkidle" });
    await clearStorage(page);
    await auditPage(page, `model ${viewport.width}x${viewport.height}`);
    await assertPrimaryActionsFit(page, `advanced model ${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: `${outputDir}/fair-advanced-${viewport.width}x${viewport.height}.png` });
    await page.goto(`${baseUrl}${modelPath}?mode=starter`, { waitUntil: "networkidle" });
    await auditPage(page, `starter model ${viewport.width}x${viewport.height}`);
    await assertPrimaryActionsFit(page, `starter model ${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: `${outputDir}/fair-starter-${viewport.width}x${viewport.height}.png` });
    await page.goto(`${baseUrl}${modelPath}?mode=free`, { waitUntil: "networkidle" });
    await auditPage(page, `free model ${viewport.width}x${viewport.height}`);
    await assertPrimaryActionsFit(page, `free model ${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: `${outputDir}/fair-free-${viewport.width}x${viewport.height}.png` });
    await page.goto(
      `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=success&questions=5`,
      { waitUntil: "networkidle" },
    );
    await auditPage(page, `audience ${viewport.width}x${viewport.height}`);
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 375, height: 667 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const page = await context.newPage();
  watchPage(page, errors);
  await page.goto(
    `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=success&questions=5`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(page);
  await page.locator(".fair-vote-answer").first().tap();
  assert(
    (await page.locator(".fair-vote-answer").first().getAttribute("aria-pressed")) === "true",
    "vote: pressed feedback is not immediate",
  );
  assert((await page.locator(".fair-vote-answer__percent").count()) === 3, "vote: results did not appear immediately");
  await page.waitForTimeout(800);
  assert((await page.locator(".fair-vote-answer__percent").allTextContents()).join(",") === "49%,33%,18%", "vote: first result mismatch");
  await page.locator(".fair-vote-answer").nth(1).tap();
  await page.waitForTimeout(800);
  assert((await page.locator(".fair-vote-answer__percent").allTextContents()).join(",") === "46%,36%,18%", "vote: changed result mismatch");
  await page.reload({ waitUntil: "networkidle" });
  assert(
    (await page.locator('.fair-vote-answer[aria-pressed="true"] .fair-vote-answer__label').innerText()) === "Performanse",
    "vote: localStorage state did not survive refresh",
  );
  await page.screenshot({ path: `${outputDir}/fair-audience-375x667-public-results.png` });
  await page.locator(".fair-flow-primary").tap();
  await page.locator(".fair-vote-answer").first().tap();
  await page.locator(".fair-question-progress button").first().tap();
  assert((await page.locator("#fair-question-title").innerText()).includes("prvi utisak"), "vote: return to answered question failed");
  await context.close();

  const thresholdContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const thresholdPage = await thresholdContext.newPage();
  watchPage(thresholdPage, errors);
  await thresholdPage.goto(
    `${baseUrl}${audiencePath}?mode=starter&threshold=below&result=success&questions=1`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(thresholdPage);
  await thresholdPage.locator(".fair-vote-answer").first().tap();
  await thresholdPage.waitForTimeout(380);
  assert((await thresholdPage.locator(".fair-vote-answer__percent").count()) === 0, "threshold: percentages are visible");
  assert((await thresholdPage.locator(".fair-vote-status").innerText()).includes("Rezultati uskoro"), "threshold: message missing");
  await thresholdPage.screenshot({ path: `${outputDir}/fair-audience-412x915-threshold.png` });
  await thresholdContext.close();

  const errorContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const errorPage = await errorContext.newPage();
  watchPage(errorPage, errors);
  await errorPage.goto(
    `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=error&questions=5`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(errorPage);
  await errorPage.locator(".fair-vote-answer").first().tap();
  await errorPage.waitForTimeout(380);
  assert((await errorPage.locator('.fair-vote-status [role="alert"]').innerText()).includes("nije sačuvan"), "error: honest failure missing");
  assert((await errorPage.locator(".fair-vote-answer__percent").count()) === 0, "error: result shown before success");
  await errorPage.locator(".fair-vote-status button").tap();
  await errorPage.waitForTimeout(380);
  assert((await errorPage.locator('.fair-vote-status [role="alert"]').count()) === 1, "error: retry state missing");
  await errorContext.close();

  const reducedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const reducedPage = await reducedContext.newPage();
  watchPage(reducedPage, errors);
  await reducedPage.goto(
    `${baseUrl}${audiencePath}?mode=advanced&threshold=public&result=success&questions=1`,
    { waitUntil: "networkidle" },
  );
  await clearStorage(reducedPage);
  await reducedPage.locator(".fair-vote-answer").first().tap();
  await reducedPage.waitForTimeout(380);
  assert((await reducedPage.locator(".fair-vote-answer__percent").allTextContents()).join(",") === "49%,33%,18%", "reduced motion: final state was not immediate");
  await reducedContext.close();

  const sheetContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const sheetPage = await sheetContext.newPage();
  watchPage(sheetPage, errors);
  await sheetPage.goto(`${baseUrl}${modelPath}?mode=advanced`, { waitUntil: "networkidle" });
  await clearStorage(sheetPage);
  const heroHeightBeforeDisclosure = await sheetPage.locator(".fair-model-hero").evaluate((element) =>
    element.getBoundingClientRect().height,
  );
  await sheetPage.locator(".fair-model-disclosure > button").tap();
  await sheetPage.waitForTimeout(160);
  const disclosureOpening = await sheetPage.evaluate(() => ({
    dropHeight: document.querySelector(".fair-model-disclosure__drop")?.getBoundingClientRect().height ?? 0,
    heroHeight: document.querySelector(".fair-model-hero")?.getBoundingClientRect().height ?? 0,
    scrollY: window.scrollY,
  }));
  assert(disclosureOpening.dropHeight > 0, "disclosure: opening jumped over its intermediate state");
  assert(Math.abs(disclosureOpening.heroHeight - heroHeightBeforeDisclosure) < 1, "disclosure: opening resized the hero image");
  assert(disclosureOpening.scrollY === 0, "disclosure: opening changed the viewport position");
  await sheetPage.waitForTimeout(440);
  await sheetPage.locator(".fair-model-disclosure > button").tap();
  await sheetPage.waitForTimeout(160);
  const disclosureClosing = await sheetPage.evaluate(() => ({
    dropHeight: document.querySelector(".fair-model-disclosure__drop")?.getBoundingClientRect().height ?? 0,
    heroHeight: document.querySelector(".fair-model-hero")?.getBoundingClientRect().height ?? 0,
    scrollY: window.scrollY,
  }));
  assert(disclosureClosing.dropHeight > 0, "disclosure: closing jumped over its intermediate state");
  assert(Math.abs(disclosureClosing.heroHeight - heroHeightBeforeDisclosure) < 1, "disclosure: closing resized the hero image");
  assert(disclosureClosing.scrollY === 0, "disclosure: closing changed the viewport position");
  await sheetPage.waitForTimeout(420);
  await sheetPage.locator(".fair-model-disclosure > button").tap();
  await sheetPage.waitForTimeout(560);
  await sheetPage.goBack();
  await sheetPage.waitForTimeout(560);
  assert(
    (await sheetPage.locator(".fair-model-disclosure > button").getAttribute("aria-expanded")) === "false",
    "disclosure: browser back did not close the expanded content",
  );
  assert(sheetPage.url().includes(modelPath), "disclosure: browser back left the model route");
  await sheetPage.locator(".fair-save-button").tap();
  assert((await sheetPage.locator(".fair-garage-flight").count()) === 1, "garage: image flight did not start");
  assert((await sheetPage.locator(".fair-save-button").innerText()).includes("Sačuvano"), "garage: saved label missing");
  assert((await sheetPage.locator(".fair-garage-badge").innerText()) === "0", "garage: badge incremented before the image docked");
  await sheetPage.waitForTimeout(850);
  assert((await sheetPage.locator(".fair-garage-flight").count()) === 1, "garage: image disappeared before docking");
  assert((await sheetPage.locator(".fair-garage-badge").innerText()) === "0", "garage: badge incremented while the image was still travelling");
  await sheetPage.waitForTimeout(250);
  assert((await sheetPage.locator(".fair-garage-flight").count()) === 0, "garage: image flight did not clean up");
  assert((await sheetPage.locator(".fair-garage-badge").innerText()) === "1", "garage: badge did not increment after docking");
  const badgeMotion = await sheetPage.evaluate(() => {
    const badge = document.querySelector(".fair-garage-badge");
    const value = document.querySelector(".fair-garage-badge__value");
    if (!badge || !value) return null;
    const valueTransform = getComputedStyle(value).transform;
    const matrix = valueTransform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(valueTransform);
    return {
      badgeTransform: getComputedStyle(badge).transform,
      valueScaleX: matrix.a,
      valueScaleY: matrix.d,
    };
  });
  assert(badgeMotion?.badgeTransform === "none", "garage: badge added a second scale animation");
  assert(badgeMotion?.valueScaleX === 1 && badgeMotion.valueScaleY === 1, "garage: badge value animation scales with the icon");
  await sheetPage.waitForTimeout(200);
  assert((await sheetPage.locator(".fair-save-button__surface").evaluate((element) => getComputedStyle(element).width)) === "220px", "garage: saved morph missing");
  const saveBarBounds = await sheetPage.locator(".fair-save-bar").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { center: rect.left + rect.width / 2, width: rect.width };
  });
  await sheetPage.locator(".fair-save-button").tap();
  assert((await sheetPage.locator(".fair-garage-flight").count()) === 0, "garage: removing model started image flight");
  await sheetPage.waitForTimeout(180);
  const unsaveMidpoint = await sheetPage.locator(".fair-save-button__surface").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      center: rect.left + rect.width / 2,
      radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
      width: rect.width,
    };
  });
  assert(Math.abs(unsaveMidpoint.center - saveBarBounds.center) < 1, "garage: unsave morph jumped horizontally");
  assert(
    unsaveMidpoint.width > 220 && unsaveMidpoint.width < saveBarBounds.width,
    "garage: unsave width snapped instead of morphing",
  );
  assert(unsaveMidpoint.radius > 14, "garage: unsave radius snapped instead of morphing");
  await sheetPage.waitForTimeout(620);
  const settledMorph = await sheetPage.locator(".fair-save-button__surface").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      center: rect.left + rect.width / 2,
      radius: Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
    };
  });
  assert(Math.abs(settledMorph.center - saveBarBounds.center) < 1, "garage: unsave morph settled off-center");
  assert(settledMorph.radius <= 14.1, `garage: unsave morph did not settle (${settledMorph.radius}px)`);
  await sheetPage.locator(".fair-save-button").tap();
  await sheetPage.waitForTimeout(1300);
  await sheetPage.locator(".fair-action-grid button").first().tap();
  await sheetPage.waitForTimeout(560);
  assert((await sheetPage.locator(".fair-rating-field").count()) === 3, "advanced rating: expected three fields");
  assert(await sheetPage.locator(".fair-save-button").isVisible(), "sheet: garage save button disappeared");
  assert(
    (await sheetPage.locator(".fair-save-bar").evaluate((element) => getComputedStyle(element).position)) === "static",
    "sheet: garage save bar left its normal document position",
  );
  assert(
    (await sheetPage.locator(".fair-save-bar").evaluate((element) => getComputedStyle(element).visibility)) === "visible",
    "sheet: garage save bar was hidden during the transition",
  );
  const firstSlider = sheetPage.locator(".fair-star-slider").first();
  const sliderBounds = await firstSlider.boundingBox();
  assert(sliderBounds, "rating: slider bounds unavailable");
  await sheetPage.touchscreen.tap(sliderBounds.x + sliderBounds.width * 0.9, sliderBounds.y + sliderBounds.height / 2);
  assert((await firstSlider.getAttribute("aria-valuenow")) === "4.5", "rating: half-star touch input failed");
  assert((await sheetPage.locator(".fair-sheet > header button").getAttribute("aria-label")) === null, "rating: close button label structure changed");
  assert((await sheetPage.locator(".fair-sheet > header button").innerText()) === "Zatvori", "rating: close accessible text missing");
  await sheetPage.locator(".fair-sheet > header button").focus();
  await sheetPage.keyboard.press("Shift+Tab");
  assert(await sheetPage.locator(".fair-sheet__primary").evaluate((element) => element === document.activeElement), "sheet: focus trap did not wrap backward");
  await sheetPage.keyboard.press("Tab");
  assert(await sheetPage.locator(".fair-sheet > header button").evaluate((element) => element === document.activeElement), "sheet: focus trap did not wrap forward");
  await sheetPage.waitForTimeout(320);
  await sheetPage.screenshot({ path: `${outputDir}/fair-rating-390x844-advanced-sheet.png` });
  await sheetPage.keyboard.press("Escape");
  await sheetPage.waitForTimeout(560);
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: Escape did not close");
  await sheetPage.locator(".fair-action-grid button").nth(1).tap();
  await sheetPage.waitForTimeout(560);
  await sheetPage.locator('input[name="name"]').fill("Test korisnik");
  await sheetPage.locator('input[name="email"]').fill("test@example.com");
  await sheetPage.locator('input[name="phone"]').fill("060000000");
  await sheetPage.locator(".fair-sheet__primary").tap();
  assert((await sheetPage.locator('[role="status"]').innerText()).includes("nisu poslati"), "lead: honest no-send state missing");
  await sheetPage.locator(".fair-sheet > header button").tap();
  await sheetPage.waitForTimeout(560);
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: X did not close");
  await sheetPage.locator(".fair-action-grid button").nth(2).tap();
  await sheetPage.waitForTimeout(560);
  await sheetPage.touchscreen.tap(4, 4);
  await sheetPage.waitForTimeout(560);
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: backdrop did not close");
  await sheetPage.locator(".fair-action-grid button").first().tap();
  await sheetPage.waitForTimeout(560);
  await sheetPage.goBack();
  await sheetPage.waitForTimeout(560);
  assert((await sheetPage.locator('[role="dialog"]').count()) === 0, "sheet: browser back did not close");
  await sheetPage.goto(`${baseUrl}${modelPath}?mode=starter`, { waitUntil: "networkidle" });
  assert((await sheetPage.locator(".fair-action-grid button").count()) === 1, "starter actions: capability mismatch");
  assert((await sheetPage.locator(".fair-starter-rating .fair-star-slider").count()) === 1, "starter rating: expected inline field");
  const starterSlider = sheetPage.locator(".fair-starter-rating .fair-star-slider");
  const starterBounds = await starterSlider.boundingBox();
  assert(starterBounds, "starter rating: slider bounds unavailable");
  await sheetPage.touchscreen.tap(starterBounds.x + starterBounds.width * 0.4, starterBounds.y + starterBounds.height / 2);
  assert((await starterSlider.getAttribute("aria-valuenow")) === "2", "starter rating: inline touch input failed");
  await sheetPage.locator(".fair-action-grid button").first().tap();
  await sheetPage.waitForTimeout(560);
  assert((await sheetPage.locator("[role=dialog]").count()) === 1, "starter interest: sheet did not open");
  await sheetPage.goto(`${baseUrl}${modelPath}?mode=free`, { waitUntil: "networkidle" });
  assert((await sheetPage.locator(".fair-action-grid button").count()) === 0, "free actions: unavailable capabilities are visible");
  await sheetContext.close();

  assert(errors.length === 0, `browser errors: ${errors.join(" | ")}`);
  console.log(JSON.stringify({ ok: true, viewports: ["375x667", "390x844", "412x915"], errors }, null, 2));
} finally {
  await browser.close();
}
