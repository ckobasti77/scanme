import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.FAIR_BASE_URL ?? "http://127.0.0.1:3000";
const outputDir = "output/playwright";
const garagePath = "/sajam/garaza";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function watchPage(page, errors) {
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`response: ${response.status()} ${response.url()}`);
    }
  });
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
    localStorage.setItem(
      "scanme:fair-garage",
      JSON.stringify({
        version: 2,
        events: {
          "elektromobilnost-2026": [
            {
              modelId: "garage-audi-rs3",
              savedAt: 3,
              lastKnown: {
                eventSlug: "elektromobilnost-2026",
                modelSlug: "audi-rs-3-sportback",
                brandName: "Audi",
                displayName: "RS 3 Sportback",
                priceText: "Cena na upit",
                photoUrl: "/fair/auto-moto-fest-2026/audi-rs-3-showroom.png",
              },
            },
            {
              modelId: "garage-bmw-i4",
              savedAt: 2,
              lastKnown: {
                eventSlug: "elektromobilnost-2026",
                modelSlug: "bmw-i4-m50",
                brandName: "BMW",
                displayName: "i4 M50",
                priceText: "84.900 EUR",
                photoUrl: "/fair/fixtures/bmw-i4.webp",
              },
            },
            {
              modelId: "garage-byd-dolphin",
              savedAt: 1,
              lastKnown: {
                eventSlug: "elektromobilnost-2026",
                modelSlug: "byd-dolphin",
                brandName: "BYD",
                displayName: "Dolphin",
                priceText: "31.990 EUR",
                photoUrl: "/fair/fixtures/byd-dolphin.webp",
              },
            },
          ],
        },
        passportBadges: [],
      }),
    );
  });
}

async function seedAutoGarage(page) {
  await page.evaluate(() => {
    localStorage.setItem(
      "scanme:fair-garage",
      JSON.stringify({
        version: 2,
        events: {
          "auto-moto-fest-2026": [
            {
              modelId: "garage-audi-rs3-auto",
              savedAt: 1,
              lastKnown: {
                eventSlug: "auto-moto-fest-2026",
                modelSlug: "audi-rs-3-sportback",
                brandName: "Audi",
                displayName: "RS 3 Sportback",
                priceText: "Cena na upit",
                photoUrl: "/fair/auto-moto-fest-2026/audi-rs-3-showroom.png",
              },
            },
          ],
        },
        passportBadges: [],
      }),
    );
  });
}

async function longPress(page, locator, duration = 500) {
  const bounds = await locator.boundingBox();
  const handle = await locator.elementHandle();
  assert(bounds, "long-press target is missing");
  assert(handle, "long-press element is missing");
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await handle.dispatchEvent("pointerdown", { pointerId: 7, pointerType: "touch", clientX: x, clientY: y, bubbles: true });
  await page.waitForTimeout(duration);
  await handle.dispatchEvent("pointerup", { pointerId: 7, pointerType: "touch", clientX: x, clientY: y, bubbles: true });
  await handle.dispatchEvent("click", { clientX: x, clientY: y, bubbles: true });
}

async function shiftDateNow(page, isoTimestamp) {
  await page.addInitScript((target) => {
    const realNow = Date.now.bind(Date);
    const offset = target - realNow();
    Date.now = () => realNow() + offset;
  }, Date.parse(isoTimestamp));
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
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });
    watchPage(page, errors);
    await page.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
    await seedGarage(page);
    await page.reload({ waitUntil: "networkidle" });
    assert((await page.getByRole("article").count()) >= 3, `${viewport.width}: model cards missing`);
    const autoMotoTab = page.getByRole("tab", { name: /Auto Moto Fest/i });
    assert(
      !(await autoMotoTab.isDisabled()),
      `${viewport.width}: Auto Moto Fest garage is unavailable in development`,
    );
    if (viewport.width === 390 && viewport.height === 844) {
      await page.getByRole("button", { name: /Podeli RS 3 Sportback/i }).tap();
      const fallbackShareDialog = page.getByRole("dialog", { name: "Podeli modele" });
      await fallbackShareDialog.waitFor({ state: "visible" });
      assert(
        await fallbackShareDialog.getByRole("link", { name: "WhatsApp" }).isVisible(),
        "share menu did not open when native share was unavailable",
      );
      await page.goBack();
      await fallbackShareDialog.waitFor({ state: "hidden" });
    }
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
  await shiftDateNow(page, "2026-10-31T12:00:00+01:00");
  const shareRequests = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => { globalThis.__fairSharedPayload = payload; },
    });
  });
  await page.route("**/api/fair/share-collection", async (route) => {
    shareRequests.push({ kind: "collection", body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, value: { collectionId: "collection-test-1", url: `${baseUrl}/sajam/deli/abcdefghijklmnopqrstuvwx` } }) });
  });
  await page.route("**/api/fair/traffic", async (route) => {
    shareRequests.push({ kind: "traffic", body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, value: { duplicate: false } }) });
  });
  await page.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
  await seedGarage(page);
  await page.reload({ waitUntil: "networkidle" });

  const activeEventTab = page.getByRole("tab", { selected: true });
  const activeEventName = await activeEventTab.textContent();
  await page.getByRole("tab", { name: /Auto Moto Fest/i }).tap();
  const passportLink = page.getByRole("link", { name: "Pasoši" });
  assert(await passportLink.isVisible(), "passport navigation is missing from the garage header");
  assert(
    (await passportLink.getAttribute("href"))?.endsWith("/pasosi"),
    "passport navigation does not point to the standalone passport route",
  );
  if (activeEventName?.includes("Elektromobilnost")) {
    await page.getByRole("tab", { name: /Elektromobilnost/i }).tap();
  }

  await page.getByRole("button", { name: /Ukloni .* iz garaže/i }).first().tap();
  const removeDialog = page.getByRole("dialog");
  await removeDialog.waitFor({ state: "visible" });
  await page.waitForTimeout(360);
  const glassState = await removeDialog.evaluate((element) => {
    const style = getComputedStyle(element);
    return { backdropFilter: style.backdropFilter, backgroundColor: style.backgroundColor, opacity: style.opacity };
  });
  assert(glassState.backdropFilter.includes("blur"), `remove dialog is missing the shared glass surface: ${JSON.stringify(glassState)}`);
  assert(Number(glassState.opacity) >= 0.99, `remove dialog did not settle into a readable state: ${JSON.stringify(glassState)}`);
  assert(await removeDialog.getByRole("button", { name: "Ukloni model" }).isVisible(), "remove confirmation is not readable");
  await page.screenshot({ path: `${outputDir}/fair-garage-remove-sheet.png` });
  await page.keyboard.press("Escape");
  await removeDialog.waitFor({ state: "hidden" });

  const firstCard = page.getByRole("article").first();
  await longPress(page, firstCard.locator("img").first());
  const selectedCard = page.getByRole("option", { selected: true }).first();
  assert(await selectedCard.getByRole("button", { name: /Izabrano za poređenje/i }).isVisible(), "long-press on the model photo did not select the car");
  assert((await page.evaluate(() => window.getSelection()?.toString() ?? "")) === "", "long-press selected page text");
  const compareButtonBounds = await selectedCard.getByRole("button", { name: /Izabrano za poređenje/i }).boundingBox();
  const compareIconBounds = await selectedCard.getByRole("button", { name: /Izabrano za poređenje/i }).locator("svg").boundingBox();
  assert(compareButtonBounds && compareIconBounds, "compare control geometry is missing");
  assert(
    Math.abs(compareButtonBounds.x + compareButtonBounds.width / 2 - (compareIconBounds.x + compareIconBounds.width / 2)) <= 1 &&
      Math.abs(compareButtonBounds.y + compareButtonBounds.height / 2 - (compareIconBounds.y + compareIconBounds.height / 2)) <= 1,
    `compare icon is not centered in its control: ${JSON.stringify({ compareButtonBounds, compareIconBounds })}`,
  );

  const selectionClose = page.getByRole("button", { name: /Završi izbor/i });
  assert(await selectionClose.isVisible(), "selection mode has no visible close action");
  await selectedCard.tap({ position: { x: 180, y: 180 } });
  await page.getByRole("toolbar").waitFor({ state: "hidden" });
  assert(page.url().endsWith(garagePath), "the first tap after a long press did not deselect the model in place");

  await longPress(page, page.getByRole("article").first().locator("img").first());
  await page.goBack();
  await page.getByRole("toolbar").waitFor({ state: "hidden" });
  assert(page.url().endsWith(garagePath), "phone Back left the garage instead of closing selection mode");

  await longPress(page, page.getByRole("article").first().locator("img").first());
  const compareButtons = page.getByRole("button", { name: /Izaberi za poređenje/i });
  await compareButtons.nth(0).tap();
  await page.waitForTimeout(350);
  const selectionToolbar = page.getByRole("toolbar", { name: /Izabrano: 2/i });
  assert(await selectionToolbar.isVisible(), "selection toolbar is missing after selecting two models");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  const toolbarBounds = await selectionToolbar.boundingBox();
  assert(toolbarBounds && toolbarBounds.y + toolbarBounds.height <= 844, `selection toolbar is not fixed above the safe area: ${JSON.stringify(toolbarBounds)}`);
  await page.screenshot({ path: `${outputDir}/fair-garage-selection-390x844.png` });
  await selectionToolbar.getByRole("button", { name: "Podeli" }).tap();
  await page.waitForFunction(() => globalThis.__fairSharedPayload?.url?.includes("/sajam/deli/"));
  assert(await selectionToolbar.isVisible(), "native sharing unexpectedly closed selection mode");
  assert(shareRequests.some((request) => request.kind === "collection" && request.body.eventModelIds.length === 2), "multi-model share did not create a bounded collection");
  await page.waitForFunction(() => document.body.dataset.shareTrafficDone === "1", undefined, { timeout: 80 }).catch(() => undefined);
  await page.waitForTimeout(100);
  assert(shareRequests.some((request) => request.kind === "traffic" && request.body.kind === "share_action" && request.body.modelCount === 2), "successful share did not record separate share_action analytics");
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
  await context.close();

  const persistenceContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const persistencePage = await persistenceContext.newPage();
  watchPage(persistencePage, errors);
  await shiftDateNow(persistencePage, "2026-10-31T12:00:00+01:00");
  await persistencePage.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
  await persistencePage.getByRole("tab", { name: /Auto Moto Fest/i }).tap();
  await persistencePage.waitForFunction(() => localStorage.getItem("scanme:fair-garage-active-event") === "auto-moto-fest-2026");
  await Promise.all([
    persistencePage.waitForURL(/\/sajam\/auto-moto-fest-2026$/),
    persistencePage.getByRole("link", { name: "Mapa" }).tap(),
  ]);
  await persistencePage.goBack({ waitUntil: "networkidle" });
  await persistencePage.getByRole("tab", { name: /Auto Moto Fest/i, selected: true }).waitFor();
  assert(persistencePage.url().endsWith(garagePath), "returning from the map did not restore the garage route");
  await persistenceContext.close();

  const removalContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const removalPage = await removalContext.newPage();
  watchPage(removalPage, errors);
  await shiftDateNow(removalPage, "2026-10-31T12:00:00+01:00");
  await removalPage.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
  await seedGarage(removalPage);
  await removalPage.reload({ waitUntil: "networkidle" });
  await removalPage.getByRole("tab", { name: /Elektromobilnost/i }).tap();
  await removalPage.getByRole("button", { name: /Ukloni Dolphin/i }).tap();
  await removalPage.getByRole("heading", { name: /Ukloniti model/i }).waitFor();
  await removalContext.setOffline(true);
  await removalPage.getByRole("button", { name: "Ukloni model" }).tap();
  await removalPage.waitForTimeout(320);
  const savedAfterOfflineRemove = await removalPage.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("scanme:fair-garage") ?? "{}");
    return stored.events?.["elektromobilnost-2026"]?.length ?? 0;
  });
  assert(
    savedAfterOfflineRemove === 2,
    `offline remove did not persist exactly two models: ${savedAfterOfflineRemove}`,
  );
  await removalPage.getByRole("tab", { name: /Auto Moto Fest/i }).tap();
  assert(
    await removalPage.getByRole("heading", { name: /Garaža je spremna/i }).isVisible(),
    "empty event state is missing",
  );
  await removalContext.close();

  const sponsoredContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "light",
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  const sponsoredPage = await sponsoredContext.newPage();
  watchPage(sponsoredPage, errors);
  await shiftDateNow(sponsoredPage, "2026-10-31T12:00:00+01:00");
  await sponsoredPage.addInitScript(() => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
  });
  await sponsoredPage.route("**/api/fair/sponsored-action", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, value: { recorded: true } }) });
  });
  await sponsoredPage.goto(`${baseUrl}${garagePath}`, { waitUntil: "networkidle" });
  await seedAutoGarage(sponsoredPage);
  await sponsoredPage.reload({ waitUntil: "networkidle" });
  await sponsoredPage.getByRole("tab", { name: /Auto Moto Fest/i }).tap();
  assert(
    (await sponsoredPage.locator(".fair-shell__current").count()) === 1 &&
      (await sponsoredPage.locator(".fair-shell__current").getAttribute("href")) === null,
    "the active Garage navigation item still reloads the current route",
  );
  const existingCard = await sponsoredPage.getByRole("article").first().elementHandle();
  assert(existingCard, "seeded Auto Moto Fest card is missing");
  await sponsoredPage.getByRole("button", { name: "Dodaj u garažu" }).tap();
  await sponsoredPage.waitForFunction(() => document.querySelectorAll("article").length === 2, undefined, { timeout: 3_000 });
  assert(await existingCard.evaluate((element) => element.isConnected), "existing garage cards were remounted after sponsored add");
  assert(await existingCard.evaluate((element) => getComputedStyle(element).animationName === "none"), "existing garage card replayed its entrance animation");
  const nextSponsoredAdd = sponsoredPage.getByRole("button", { name: "Dodaj u garažu" });
  await nextSponsoredAdd.waitFor({ state: "visible", timeout: 15_000 });
  assert(await nextSponsoredAdd.isEnabled(), "next sponsored model remained locked after the first add");
  await nextSponsoredAdd.tap();
  await sponsoredPage.waitForFunction(() => document.querySelectorAll("article").length === 3, undefined, { timeout: 3_000 });
  await sponsoredPage.waitForTimeout(620);
  const settledCards = await sponsoredPage.getByRole("article").evaluateAll((cards) => cards.map((card) => ({ opacity: getComputedStyle(card).opacity, transform: getComputedStyle(card).transform })));
  assert(settledCards.every((card) => Number(card.opacity) >= 0.995 && card.transform === "none"), `sponsored insertion did not settle cleanly: ${JSON.stringify(settledCards)}`);
  assert(await sponsoredPage.getByRole("article").locator("img").count() === 3, "a sponsored fixture was inserted without its review photo");
  const refreshNotice = sponsoredPage.locator('[role="status"]').filter({ hasText: "Podaci nisu osveženi." });
  if (await refreshNotice.count()) {
    assert(await refreshNotice.evaluate((element) => element.scrollWidth <= element.clientWidth), "refresh error is truncated");
  }
  await sponsoredPage.screenshot({ path: `${outputDir}/fair-garage-sponsored-two-adds.png`, fullPage: true });
  await sponsoredContext.close();

  const sharedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light", hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const sharedPage = await sharedContext.newPage();
  watchPage(sharedPage, errors);
  await sharedPage.goto(`${baseUrl}/sajam/deli/abcdefghijklmnopqrstuvwx`, { waitUntil: "networkidle" });
  await sharedPage.getByRole("heading", { name: "Ova kolekcija više nije dostupna." }).waitFor();
  await audit(sharedPage, "expired shared collection 390x844");
  await sharedPage.screenshot({ path: `${outputDir}/fair-garage-shared-expired-390x844.png` });
  await sharedContext.close();

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
  await audit(reducedPage, "garage reduced motion");
  await reduced.close();

  assert(errors.length === 0, `browser errors:\n${errors.join("\n")}`);
  console.log("Fair garage browser checks passed.");
} finally {
  await browser.close();
}
