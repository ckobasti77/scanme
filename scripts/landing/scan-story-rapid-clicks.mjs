// Playwright provera ScanStory brzih klikova (#kako-radi na /prelaunch).
//
// Pokretanje (dev server mora da radi):
//   node scripts/landing/scan-story-rapid-clicks.mjs [http://localhost:3000]
//
// Scenario: aktivna je kartica 1. Klik na 2, pa usred prelaza još 5 brzih
// klikova na 2 i jedan na 3. Očekivano: prelaz 1→2 se izvrši jednom do kraja
// i traje kao jedan prelaz, ivica se nijednom ne vrati na karticu 1, aktivna
// ostaje 2, panel prikazuje karticu 2. Posle sletanja klik na 2 ne radi ništa,
// a klik na 3 pokreće novi prelaz. Radi na desktopu (miš) i telefonu (dodir).
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const SINGLE_HOP_MS = 440; // 0.16 + 0.10 + 0.18 s u components/scan-story.tsx
const failures = [];

function check(label, condition, detail) {
  console.log(`${condition ? "OK  " : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures.push(label);
}

async function run({ label, viewport, touch }) {
  console.log(`\n# ${label} (${viewport.width}×${viewport.height})`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));

  await page.goto(`${base}/prelaunch`, { waitUntil: "networkidle" });
  const group = page.locator('[role="group"][aria-label="Koraci ScanMe procesa"]').filter({ visible: true });
  await group.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const buttons = group.locator("button");
  check("tri kartice", (await buttons.count()) === 3);
  check("početno je aktivna kartica 1", (await buttons.nth(0).getAttribute("aria-pressed")) === "true");

  // Snimač: promene aria-pressed i „snap back“ ivice kartice 1 (offset opet 0
  // pošto je počela da odlazi = restart/vraćanje).
  await page.evaluate(() => {
    const groupEl = Array.from(document.querySelectorAll('[role="group"][aria-label="Koraci ScanMe procesa"]'))
      .find((el) => el.getClientRects().length > 0);
    const nodes = Array.from(groupEl.querySelectorAll("button"));
    const log = { pressed: [], snapBacks: 0, start: 0 };
    window.__story = log;
    new MutationObserver(() => {
      log.pressed.push({ t: performance.now(), active: nodes.findIndex((n) => n.getAttribute("aria-pressed") === "true") });
    }).observe(groupEl, { attributes: true, subtree: true, attributeFilter: ["aria-pressed"] });
    const branch = nodes[0].querySelector("[data-signal-branch]");
    let left = false;
    const sample = () => {
      const offset = Math.abs(parseFloat(getComputedStyle(branch).strokeDashoffset) || 0);
      if (offset > 1) left = true;
      else if (left && offset < 0.5) { log.snapBacks += 1; left = false; }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const box = async (index) => {
    const b = await buttons.nth(index).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const [second, third] = [await box(1), await box(2)];
  const tap = async ({ x, y }) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));

  await page.evaluate(() => { window.__story.start = performance.now(); });
  await tap(second);
  for (let i = 0; i < 5; i += 1) {
    await page.waitForTimeout(15);
    await tap(second);
  }
  await page.waitForTimeout(15);
  await tap(third);
  const clicksDoneAt = await page.evaluate(() => performance.now() - window.__story.start);
  await page.waitForTimeout(1200);

  const log = await page.evaluate(() => window.__story);
  const landed = log.pressed.find((entry) => entry.active === 1);
  const duration = landed ? Math.round(landed.t - log.start) : null;
  check("7 klikova stiglo usred prelaza", clicksDoneAt < SINGLE_HOP_MS, `${Math.round(clicksDoneAt)} ms`);
  check("prelaz 1→2 traje kao jedan prelaz", duration !== null && duration >= SINGLE_HOP_MS - 120 && duration <= SINGLE_HOP_MS + 220, `${duration} ms`);
  check("ivica se nijednom ne vraća na karticu 1", log.snapBacks === 0, `vraćanja: ${log.snapBacks}`);
  check("kartica 3 nikad nije aktivna", !log.pressed.some((entry) => entry.active === 2));
  check("aktivna ostaje 2", (await buttons.nth(1).getAttribute("aria-pressed")) === "true");
  const panelId = await buttons.nth(1).getAttribute("aria-controls");
  const panelTitle = await page.locator(`#${panelId} h3`).first().textContent();
  check("panel završava na kartici 2", panelTitle?.trim() === "Kupac skenira", panelTitle ?? "");

  // Posle sletanja: klik na aktivnu ne radi ništa.
  await page.evaluate(() => { window.__story.pressed = []; });
  await tap(second);
  await page.waitForTimeout(700);
  check("klik na aktivnu karticu ne radi ništa", (await page.evaluate(() => window.__story.pressed.length)) === 0);

  // Klik na drugu pokreće novi prelaz.
  await tap(third);
  await page.waitForTimeout(1000);
  check("klik na 3 posle sletanja pokreće novi prelaz", (await buttons.nth(2).getAttribute("aria-pressed")) === "true");
  check("bez grešaka u konzoli", consoleErrors.length === 0, consoleErrors.join(" | "));

  await browser.close();
}

async function runReducedMotion() {
  console.log("\n# reduced motion, tastatura (1280×800)");
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" })).newPage();
  await page.goto(`${base}/prelaunch`, { waitUntil: "networkidle" });
  const buttons = page.locator('[role="group"][aria-label="Koraci ScanMe procesa"]').filter({ visible: true }).locator("button");
  await buttons.nth(1).focus();
  await page.keyboard.press("Enter");
  check("promena je trenutna", (await buttons.nth(1).getAttribute("aria-pressed")) === "true");
  await page.keyboard.press("Enter");
  check("Enter na aktivnoj kartici ne radi ništa", (await buttons.nth(1).getAttribute("aria-pressed")) === "true");
  await buttons.nth(2).focus();
  await page.keyboard.press("Space");
  check("Space na drugoj kartici je prebacuje", (await buttons.nth(2).getAttribute("aria-pressed")) === "true");
  await browser.close();
}

await run({ label: "desktop, miš", viewport: { width: 1280, height: 800 }, touch: false });
await run({ label: "telefon, dodir", viewport: { width: 390, height: 844 }, touch: true });
await runReducedMotion();

if (failures.length) {
  console.error(`\n${failures.length} provera nije prošlo.`);
  process.exit(1);
}
console.log("\nSve ScanStory provere su prošle.");
