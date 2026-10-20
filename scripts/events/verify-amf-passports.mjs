import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Local headless QA of the Auto Moto Fest passport overview ("ulaznice") and
// the DEV passport simulation, through the open DEV menu (no login). The
// simulation is a cookie of this browser; nothing is written to Convex.
// Usage: node scripts/events/verify-amf-passports.mjs [base] [outDir]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const base = process.argv[2] ?? "http://localhost:3000";
const output = process.argv[3] ?? path.join(root, "output/amf-pasosi");
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Use a local DEV server");
await mkdir(output, { recursive: true });

const SLUG = "test-auto-moto-fest-2026";
const OVERVIEW = `${base}/sajam/${SLUG}/pasosi`;
const WIDTHS = [360, 390, 430];
const browser = await chromium.launch();
const results = { checks: [], errors: [], passportApiCallsInSimulation: 0 };

function check(name, ok, detail = "") {
  results.checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function newPage(width, options = {}) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, ...options });
  const page = await context.newPage();
  page.on("pageerror", (error) => results.errors.push(`${width}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") results.errors.push(`${width}: ${message.text()}`);
  });
  return { context, page };
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // Progress is in once the overview stops hiding its counts.
  await page.waitForFunction(() => !document.querySelector("main[data-loading]"), null, { timeout: 15000 }).catch(() => {});
}

async function overflow(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    width: innerWidth,
    cutNames: [...document.querySelectorAll("main a[aria-label] b")].filter((b) => b.scrollHeight > b.clientHeight + 1).map((b) => b.textContent),
    cutLabels: [...document.querySelectorAll("main a[aria-label] span")].filter((s) => /^pasoš/i.test(s.textContent ?? "") && s.scrollWidth > s.clientWidth).length,
  }));
}

/** Turns the simulation on through the open DEV menu, as on the phone. */
async function simulateViaMenu(page, { brands, models, state }) {
  const tabs = page.getByRole("button", { name: "Otvori DEV simulaciju pasoša" });
  check("one open DEV tab without login", (await tabs.count()) === 1 && (await page.getByRole("button", { name: "Otvori admin alate" }).count()) === 0);
  await tabs.click();
  const dialog = page.getByRole("dialog", { name: "DEV alati" });
  await dialog.getByLabel("Brendovi").selectOption(String(brands));
  await dialog.getByRole("button", { name: models === "random" ? "Nasumično (1–11)" : String(models), exact: true }).click();
  await dialog.getByLabel("Stanje").selectOption(state);
  await dialog.getByRole("button", { name: "Uključi simulaciju" }).click();
  await page.getByText("DEV · SIMULACIJA").waitFor();
  await settle(page);
}

async function setSimCookie(context, value) {
  await context.addCookies([{ name: "scanme_fair_passport_sim", value, url: base }]);
}

// 1. Open DEV menu on the phone widths: all brands, random models, mixed states.
for (const width of WIDTHS) {
  const { context, page } = await newPage(width);
  page.on("request", (request) => {
    if (request.url().includes("/api/fair/passport") && request.method() === "POST") results.passportApiCallsInSimulation += 1;
  });
  await page.goto(OVERVIEW, { waitUntil: "networkidle" });
  await settle(page);
  results.passportApiCallsInSimulation = 0;
  await simulateViaMenu(page, { brands: "all", models: "random", state: "mixed" });
  const tickets = await page.locator("main a[aria-label]").count();
  check(`${width}px: 19 brands via menu`, tickets === 19, `${tickets}`);
  check(`${width}px: no passport API call in simulation`, results.passportApiCallsInSimulation === 0);
  const o = await overflow(page);
  check(`${width}px: no overflow / cut text (mixed)`, o.scrollWidth === o.width && o.cutNames.length === 0 && o.cutLabels === 0, JSON.stringify(o));
  await page.screenshot({ path: path.join(output, `pasosi-${width}-mesano-top.png`) });
  await page.screenshot({ path: path.join(output, `pasosi-${width}-mesano-full.png`), fullPage: true });
  await context.close();
}

// 2. Edge cases (long name, upload logo, 11 models, new stamps) and 2 models, by cookie.
for (const width of WIDTHS) {
  for (const value of ["test.11.new", "all.2.partial"]) {
    const { context, page } = await newPage(width);
    await setSimCookie(context, value);
    await page.goto(OVERVIEW, { waitUntil: "networkidle" });
    await settle(page);
    const o = await overflow(page);
    check(`${width}px: no overflow / cut text (${value})`, o.scrollWidth === o.width && o.cutNames.length === 0 && o.cutLabels === 0, JSON.stringify(o));
    if (value.startsWith("test")) {
      const lumo = page.locator('main a[aria-label^="Pasoš Lumo"]');
      check(`${width}px: upload logo in a badge`, (await lumo.locator("img").count()) === 1 && (await lumo.locator("svg").count()) === 0);
      const swm = page.locator('main a[aria-label^="Pasoš SWM"]');
      check(`${width}px: SWM name only`, (await swm.locator("img, svg").count()) === 0);
      // The edge cases sit at the end of the list; put them on top for one screenshot.
      await page.evaluate(() => {
        const links = [...document.querySelectorAll("main a[aria-label]")];
        const pick = ["Lumo", "Arvena", "SWM", "Mercedes-Benz", "Dongfeng", "Geely"].map((name) => links.find((a) => a.getAttribute("aria-label")?.startsWith(`Pasoš ${name}`)));
        for (const a of pick.reverse()) if (a) a.parentElement?.prepend(a);
      });
    }
    await page.screenshot({ path: path.join(output, `pasosi-${width}-${value.replace(/\./g, "-")}.png`) });
    await context.close();
  }
}

// 3. Completion seal: plays once, then static; reduced motion is static at once.
{
  const { context, page } = await newPage(390);
  await setSimCookie(context, "2.6.complete");
  await page.goto(OVERVIEW, { waitUntil: "networkidle" });
  await settle(page);
  const midway = await page.locator("[data-stub-count]").count();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(output, "pecat-390-tokom.png") });
  await page.waitForFunction(() => document.querySelectorAll("[data-stub-count]").length === 0, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, "pecat-390-posle.png") });
  check("seal animates (counts shown, then gone)", midway > 0);
  await page.reload({ waitUntil: "networkidle" });
  await settle(page);
  const afterReload = await page.locator("[data-stub-count]").count();
  check("seal static after reload", afterReload === 0, `count nodes ${afterReload}`);
  await context.close();
}
{
  const { context, page } = await newPage(390, { reducedMotion: "reduce" });
  await setSimCookie(context, "2.6.complete");
  await page.goto(OVERVIEW, { waitUntil: "networkidle" });
  await settle(page);
  await page.waitForTimeout(150);
  check("reduced motion: seal without animation", (await page.locator("[data-stub-count]").count()) === 0);
  await page.screenshot({ path: path.join(output, "pecat-390-reduced-motion.png") });
  await context.close();
}

// 4. Sticking on a brand page, then "off" from the brand page returns to the overview.
{
  const { context, page } = await newPage(390);
  await page.goto(OVERVIEW, { waitUntil: "networkidle" });
  await settle(page);
  await simulateViaMenu(page, { brands: "all", models: 6, state: "new" });
  await page.locator('main a[aria-label^="Pasoš Audi"]').click();
  await page.waitForURL(/\/pasosi\/audi$/);
  const counter = page.getByText(/\d+ od 6 markica/).first();
  await counter.waitFor();
  const before = await counter.textContent();
  await page.getByRole("button", { name: /^Zalepi markicu/ }).first().click();
  await page.waitForFunction((text) => [...document.querySelectorAll("main *")].some((el) => el.children.length === 0 && /\d+ od 6 markica/.test(el.textContent ?? "") && el.textContent !== text), before, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(600);
  const after = await page.getByText(/\d+ od 6 markica/).first().textContent();
  check("stick a stamp in simulation", before !== after, `${before} → ${after}`);
  await page.screenshot({ path: path.join(output, "brend-390-posle-lepljenja.png") });
  check("open DEV tab on the brand page", (await page.getByRole("button", { name: "Otvori DEV simulaciju pasoša" }).count()) === 1);
  await page.locator(".fair-admin-bar").getByRole("button", { name: "Isključi simulaciju" }).click();
  await page.waitForURL(new RegExp(`/sajam/${SLUG}/pasosi$`));
  await settle(page);
  const real = await page.locator("main a[aria-label]").evaluateAll((links) => links.map((a) => a.getAttribute("aria-label")));
  check("off from a brand page → real overview, no 404", (await page.getByText("DEV · SIMULACIJA").count()) === 0 && real.length > 0, real.join(" | "));
  // Off through the menu as well.
  await simulateViaMenu(page, { brands: 3, models: 2, state: "start" });
  await page.getByRole("button", { name: "Otvori DEV simulaciju pasoša" }).click();
  await page.getByRole("dialog", { name: "DEV alati" }).getByRole("button", { name: "Isključi simulaciju" }).click();
  await page.waitForFunction(() => !document.body.innerText.includes("DEV · SIMULACIJA"), null, { timeout: 8000 });
  check("off from the menu", true);
  await context.close();
}

// 5. The electromobility overview ignores the cookie and keeps its own look.
{
  const { context, page } = await newPage(390);
  await setSimCookie(context, "all.6.mixed");
  await page.goto(`${base}/sajam/elektromobilnost-2026/pasosi`, { waitUntil: "networkidle" });
  check("electromobility unchanged", (await page.locator("[data-stub-state]").count()) === 0 && (await page.getByText("DEV · SIMULACIJA").count()) === 0 && (await page.getByRole("button", { name: "Otvori DEV simulaciju pasoša" }).count()) === 0);
  await context.close();
}

await browser.close();
const ignorable = (text) => /Download the React DevTools|\[HMR\]|\[Fast Refresh\]/.test(text);
results.errors = results.errors.filter((text) => !ignorable(text));
check("no console / page errors", results.errors.length === 0, results.errors.slice(0, 5).join(" | "));
await writeFile(path.join(output, "verify-amf-passports.json"), JSON.stringify(results, null, 2));
const failed = results.checks.filter((c) => !c.ok);
console.log(`\n${results.checks.length - failed.length}/${results.checks.length} checks passed. Screenshots: ${output}`);
process.exitCode = failed.length ? 1 : 0;
