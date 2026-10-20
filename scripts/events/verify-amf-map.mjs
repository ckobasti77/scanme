import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Local, read-only browser QA. The DEV route supplies fabricated visitor data;
// the heat request is intercepted in this browser, never written to Convex.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "output/amf-mapa");
const base = process.argv[2] ?? "http://127.0.0.1:3227";
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Use a local DEV server");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
const results = { viewports: [], interactions: [], gestureSmoke: null, errors: [], warnings: [], expectedDevNotices: [] };

function watchConsole(page) {
  page.on("pageerror", (error) => results.errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") results.errors.push(message.text());
    if (message.type() !== "warning") return;
    if (message.text().startsWith("You have Reduced Motion enabled on your device.")) {
      if (!results.expectedDevNotices.includes("Motion: reduced motion enabled")) results.expectedDevNotices.push("Motion: reduced motion enabled");
    } else results.warnings.push(message.text());
  });
}

async function settled(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { visibility: hidden; }" });
  await page.waitForFunction(() => [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0;
  }).every((image) => image.complete));
  await page.evaluate(() => new Promise((resolve) => {
    let previous = "";
    let stable = 0;
    const tick = () => {
      const layers = [...document.querySelectorAll('[data-zone] [data-interactive] > div')].filter((element) => element.getBoundingClientRect().width);
      const ready = layers.every((element) => getComputedStyle(element).visibility === "visible");
      const state = layers.map((element) => `${element.style.transform}:${element.style.opacity}`).join("|");
      stable = ready && state === previous ? stable + 1 : 0;
      previous = state;
      if (stable >= 6) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  }));
}

async function shot(page, name) {
  await settled(page);
  await page.screenshot({ path: path.join(output, `${name}.png`), scale: "css" });
}

async function bounds(page, viewport) {
  const value = await page.evaluate(() => {
    const zone = document.querySelector('[data-zone="hala"]');
    const rect = zone.getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, top: rect.top, bottom: rect.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert(value.bottom <= viewport.height, `Hall extends below ${viewport.width}×${viewport.height}`);
  assert(!value.overflow, "Horizontal page overflow");
  const smallButtons = await page.locator('[data-event="auto-moto"] button:visible').evaluateAll((buttons) => buttons.filter((button) => {
    const rect = button.getBoundingClientRect();
    return rect.width < 44 || rect.height < 44;
  }).map((button) => button.getAttribute("aria-label") ?? button.textContent));
  assert.deepEqual(smallButtons, [], "Controls must have a 44 px target");
  results.viewports.push(value);
}

try {
  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
    const suffix = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    watchConsole(page);
    let heatReads = 0;
    await page.route("**/api/fair/heat/**", (route) => {
      heatReads += 1;
      return route.fulfill({ json: { ok: true, value: {
        at: Date.now(),
        today: { enough: true, levels: [{ locationId: "hala-1", level: 0.2 }, { locationId: "hala-3", level: 0.85 }] },
        hour: { enough: true, levels: [{ locationId: "hala-2", level: 0.7 }] },
      } } });
    });
    await page.goto(`${base}/dev/sajam-mapa`);
    await page.locator('[data-location-id="hala-1"]').waitFor();
    await settled(page);
    await bounds(page, viewport);
    assert.equal(heatReads, 0, "Heat must not load while switched off");
    await shot(page, `overview-${suffix}`);

    await page.locator('[data-location-id="hala-1"]').tap();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByRole("link").first().waitFor();
    assert.equal(await dialog.getByRole("link").count(), 2);
    assert.match(await dialog.getByRole("link").first().getAttribute("href"), /\/model\/test-toyota-model-1$/);
    assert.doesNotMatch(await dialog.innerText(), /Štand\s+\d/i);
    await dialog.getByRole("link").last().focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("data-sheet-close")), "true");
    await shot(page, `selected-${suffix}`);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert(!new URL(page.url()).searchParams.has("stand"));

    await page.getByRole("button", { name: "Prikaži spisak izlagača", exact: true }).click();
    await page.getByRole("heading", { name: "Izlagači po kategorijama" }).waitFor();
    assert.equal(await page.locator('[data-zone="hala"]').isVisible(), false);
    await page.getByRole("button", { name: "TEST BYD TEST BYD Hala", exact: true }).waitFor();
    await shot(page, `directory-${suffix}`);
    await page.getByRole("button", { name: "TEST BYD TEST BYD Hala", exact: true }).click();
    await dialog.waitFor();
    assert.equal(new URL(page.url()).searchParams.get("stand"), "hala-3");
    await page.getByRole("button", { name: "Zatvori detalje štanda", exact: true }).last().click();
    await dialog.waitFor({ state: "hidden" });

    await page.goto(`${base}/dev/sajam-mapa?stanje=ucitavanje`);
    await page.locator('[aria-busy="true"]').waitFor();
    await shot(page, `loading-${suffix}`);

    await page.goto(`${base}/dev/sajam-mapa?stand=hala-1`);
    await dialog.waitFor();
    assert.equal(await page.locator('[data-location-id="hala-1"]').getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("switch", { name: "Gde je gužva" }).click();
    await page.locator('[data-zone="hala"][data-heat="on"]').waitFor();
    assert.equal(heatReads, 1);
    await page.getByRole("button", { name: "Poslednji sat", exact: true }).click();
    assert.equal(heatReads, 1, "Changing period reuses the same response");
    await shot(page, `heat-${suffix}`);

    await page.goto(`${base}/dev/sajam-mapa?stanje=prazno`);
    await page.getByRole("status").filter({ hasText: "Izlagači za ovaj sajam još nisu objavljeni" }).waitFor();
    assert.equal(await page.locator('[data-location-id]').count(), 0);
    await shot(page, `empty-${suffix}`);
    await page.goto(`${base}/dev/sajam-mapa?stanje=greska`);
    await page.getByRole("alert").filter({ hasText: "Mapa trenutno nije dostupna" }).waitFor();
    await shot(page, `error-${suffix}`);
    await page.getByRole("link", { name: "Pokušaj ponovo", exact: true }).click();
    await page.locator('[data-location-id="hala-1"]').waitFor();
    results.interactions.push({ viewport: suffix, mapTap: true, modelLinks: true, focusTrap: true, escape: true, directory: true, deepLink: true, heat: true, loading: true, empty: true, errorRetry: true });
    await context.close();
  }

  for (const viewport of [{ width: 360, height: 640 }, { width: 430, height: 932 }]) {
    const page = await browser.newPage({ viewport, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    watchConsole(page);
    await page.goto(`${base}/dev/sajam-mapa`);
    await page.locator('[data-location-id="hala-1"]').waitFor();
    await settled(page);
    await bounds(page, viewport);
    await shot(page, `overview-${viewport.width}x${viewport.height}`);
    await page.close();
  }

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  watchConsole(desktop);
  await desktop.goto(`${base}/dev/sajam-mapa?stand=hala-1`);
  await desktop.getByRole("heading", { name: "Izabrani štand: Hala" }).waitFor();
  assert.equal(await desktop.getByRole("dialog").count(), 0);
  await shot(desktop, "desktop-1280x900");
  await desktop.close();

  const touchPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  watchConsole(touchPage);
  const cdp = await touchPage.context().newCDPSession(touchPage);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await touchPage.goto(`${base}/dev/sajam-mapa`);
  await settled(touchPage);
  const canvas = touchPage.locator('[data-zone="hala"] [data-interactive="true"]');
  const rect = await canvas.boundingBox();
  const scale = () => canvas.locator(":scope > div").evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
  const fitted = await scale();
  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height / 2);
  const points = (spread) => [{ x: cx - spread, y: cy, id: 1 }, { x: cx + spread, y: cy, id: 2 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(30) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(65) });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settled(touchPage);
  assert(await scale() > fitted * 1.5, "Pinch must zoom the map");
  const beforePan = await canvas.locator(":scope > div").getAttribute("style");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + 35, y: cy + 25, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settled(touchPage);
  assert.notEqual(await canvas.locator(":scope > div").getAttribute("style"), beforePan, "Pan must move the zoomed map");
  // CDP's raw drag sequence suppresses the next compatibility click in Chromium.
  // Exercise the real button click separately; physical touch is in the phone checklist.
  await touchPage.getByRole("button", { name: "Prikaži ceo deo", exact: true }).click();
  await touchPage.waitForFunction((expected) => {
    const layer = document.querySelector('[data-zone="hala"] [data-interactive="true"] > div');
    return Math.abs(new DOMMatrixReadOnly(getComputedStyle(layer).transform).a - expected) < 0.001;
  }, fitted);
  await settled(touchPage);
  assert(Math.abs(await scale() - fitted) < 0.001, "Fit must restore the entire hall");
  const search = touchPage.getByRole("combobox");
  await search.fill("Toyota");
  await touchPage.getByRole("option").first().waitFor();
  await search.press("ArrowDown");
  await search.press("Enter");
  await touchPage.getByRole("dialog").waitFor();
  await touchPage.keyboard.press("Escape");
  await touchPage.getByRole("dialog").waitFor({ state: "hidden" });
  await search.fill("nema-takvog-izlagaca");
  await touchPage.getByText("Pokušajte kraći naziv", { exact: false }).waitFor();
  await touchPage.getByRole("button", { name: "Obriši pretragu", exact: true }).first().tap();
  assert.equal(await search.inputValue(), "");
  results.gestureSmoke = { cpuThrottle: 4, reducedMotion: false, pinch: true, pan: true, fit: true, keyboardSearch: true, emptySearchRecovery: true };
  await touchPage.close();

  const olderEvent = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  watchConsole(olderEvent);
  await olderEvent.goto(`${base}/dev/sajam-mapa?dogadjaj=elektromobilnost-2026`);
  await olderEvent.locator('[data-location-id="hala-2"]').waitFor();
  assert.equal(await olderEvent.getByRole("button", { name: "Prikaži spisak izlagača", exact: true }).count(), 0);
  assert(await olderEvent.getByRole("button", { name: /Štand 2 · Hala:/ }).count() > 0);
  await shot(olderEvent, "electromobility-regression-390x844");
  await olderEvent.close();

  assert.deepEqual(results.errors, [], "Browser errors");
  assert.deepEqual(results.warnings, [], "Browser warnings");
  await writeFile(path.join(output, "qa-results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
