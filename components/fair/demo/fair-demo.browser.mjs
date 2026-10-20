// Read the existing dev server only. Every demo API POST is blocked and fails QA.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const origin = process.env.AMF_QA_ORIGIN ?? "http://localhost:3000";
const base = `${origin}/sajam/demo-auto-moto-fest-2026`;
const output = resolve("output/playwright/amf-demo-review");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const [width, height] of [[360, 640], [390, 844], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900 });
    const page = await context.newPage();
    const errors = [], posts = [];
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/api/fair/**", route => {
      if (route.request().method() !== "POST") return route.continue();
      posts.push(route.request().url());
      return route.abort();
    });
    await page.clock.install({ time: new Date("2026-10-19T12:00:03Z") });
    await page.goto(`${base}/mapa`);
    await page.locator('[data-amf-layer]').waitFor();
    await page.waitForFunction(() => [...document.images].every(image => image.complete));
    assert.ok((await page.locator('.fair-event-lockup small').innerText()).toLocaleLowerCase().includes('demo prikaz'));
    assert.equal(await page.locator('[data-demo-logo]').count(), 0);
    assert.ok(await page.locator('[data-brand="audi"]').count());
    assert.equal(await page.getByText('Pauziraj animaciju', { exact: true }).count(), 0);
    if (width === 390) {
      const readHeat = () => page.locator('[data-exhibit][data-heat-eligible="true"]').evaluateAll(nodes => nodes.map(node => ({
        key: node.getAttribute('data-exhibit'), value: Number(node.querySelector('path:last-child').getAttribute('fill-opacity')),
      })));
      let previous = await readHeat();
      const ranges = new Map(previous.map(item => [item.key, { min: item.value, max: item.value }]));
      // More than a full loop of all hall + outdoor exhibitors, using the real demo hook.
      for (let elapsed = 0; elapsed < 90000; elapsed += 500) {
        await page.clock.runFor(500);
        const current = await readHeat();
        for (const item of current) {
          const range = ranges.get(item.key);
          range.min = Math.min(range.min, item.value);
          range.max = Math.max(range.max, item.value);
          assert.ok(Math.abs(item.value - previous.find(last => last.key === item.key).value) < .1, `${item.key} heats and cools gradually`);
        }
        previous = current;
      }
      for (const [key, range] of ranges) {
        assert.ok(range.max > .87 && range.min < .18, `${key} gets its full warm and cool phases: ${JSON.stringify(range)}`);
      }
    }
    const sponsor = page.locator('[data-fair-sponsored="map"]');
    const fill = () => sponsor.locator('[data-active="true"] b').evaluate(element => new DOMMatrix(getComputedStyle(element).transform).a);
    const initial = await fill();
    await page.waitForTimeout(1000);
    assert.ok(await fill() > initial + .04, 'timeline fills before the model changes');
    const models = new Set([await sponsor.getAttribute('data-sponsored-model')]);
    // Sample inside each slot; the heat-loop probe can leave the clock near a boundary.
    for (let elapsed = 0; elapsed < 36000; elapsed += 4000) {
      await page.clock.runFor(4000);
      models.add(await sponsor.getAttribute('data-sponsored-model'));
    }
    assert.equal(models.size, 3, 'all three sponsored models rotate');
    for (let step = 0; step < 3 && !await sponsor.getByRole('button', { name: 'Dodaj u garažu', exact: true }).count(); step++) await page.clock.runFor(12000);
    await sponsor.getByRole('button', { name: 'Dodaj u garažu', exact: true }).click();
    await page.clock.runFor(1800);
    await sponsor.getByRole('button', { name: 'U garaži', exact: true }).waitFor();
    assert.ok((await sponsor.getByRole('link', { name: 'Pogledaj', exact: true }).getAttribute('href')).startsWith('/sajam/demo-auto-moto-fest-2026/model/'));
    await page.clock.resume();
    const actions = await sponsor.locator('[class*="spActions"]').boundingBox();
    const bars = await sponsor.locator('[data-sponsored-progress]').boundingBox();
    assert.ok(actions.x + actions.width + 4 < bars.x, 'actions and timeline do not collide');
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
    await page.screenshot({ path: resolve(output, `map-${width}.png`) });
    await page.locator('[data-brand="audi"]').press('Enter');
    assert.equal(await page.getByRole('dialog').getByRole('link').getAttribute('href'), 'https://www.brosauto.rs/');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'O simulaciji toplotne mape', exact: true }).click();
    await page.getByRole('tooltip').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('tooltip').count(), 0);
    await page.getByRole('button', { name: 'Ulaz', exact: true }).click();
    assert.equal(await page.locator('[data-exhibit][data-area="foyer"][data-heat-eligible="true"]').count(), 0);
    await page.screenshot({ path: resolve(output, `entrance-${width}.png`) });

    await page.goto(`${base}/pasosi`);
    const tickets = page.locator('a[href*="/pasosi/demo-"]');
    await page.getByRole('link', { name: 'Pasoš Demo 01: 0 od 3 markice. 3 nove čekaju lepljenje', exact: true }).waitFor();
    assert.equal(await tickets.count(), 3);
    assert.ok((await tickets.nth(1).getAttribute('aria-label')).includes('2 od 3'));
    assert.ok((await tickets.nth(2).getAttribute('aria-label')).includes('kompletan'));
    await page.screenshot({ path: resolve(output, `passports-${width}.png`) });
    await tickets.first().click();
    for (let remaining = 3; remaining > 0; remaining--) {
      const button = page.locator('button[class*="mount"]').first();
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(100);
      // Probe the actual shared passport, not a demo-only replacement animation.
      await button.evaluate(element => {
        const row = element.closest('[data-row]');
        const name = row.querySelector('[data-model-name]');
        const samples = [];
        window.__stampProbe = { row, name, samples, timer: setInterval(() => {
          const rect = row.getBoundingClientRect();
          const text = name.getBoundingClientRect();
          samples.push({ top: rect.top + scrollY, height: rect.height, nameTop: text.top + scrollY, scroll: scrollY, statusHeight: row.querySelector('[data-stamp-status]').getBoundingClientRect().height, sameName: name === row.querySelector('[data-model-name]') });
        }, 20) };
      });
      await button.click();
      await page.waitForFunction(count => document.querySelectorAll('button[class*="mount"]').length === count, remaining - 1);
      // The postmark settles before the next stamp accepts a tap.
      await page.waitForTimeout(1000);
      const samples = await page.evaluate(() => {
        clearInterval(window.__stampProbe.timer);
        return window.__stampProbe.samples;
      });
      assert.ok(samples.length > 10);
      assert.ok(samples.every(sample => sample.sameName), 'model name keeps the same DOM node');
      if (remaining > 1) {
        for (const field of ['top', 'height', 'nameTop', 'scroll']) {
          const values = samples.map(sample => sample[field]);
          assert.ok(Math.max(...values) - Math.min(...values) < .6, `${field} stays still while sticking at ${width}px: ${JSON.stringify([samples[0], samples.at(-1)])}`);
        }
      }
      assert.equal(await page.locator('[data-swap-old], [data-swap-new]').count(), 0, 'no competing copies of the text');
    }
    assert.equal(await page.locator('[data-row][data-stamp-state="got"]').count(), 3);
    await page.waitForTimeout(1400);
    await page.screenshot({ path: resolve(output, `completed-first-${width}.png`) });
    await page.goto(`${base}/pasosi/demo-02`);
    await page.waitForFunction(() => document.querySelectorAll('button[class*="mount"]').length === 1);
    await page.locator('button[class*="mount"]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-row][data-stamp-state="got"]').length === 3);
    await page.goto(`${base}/garaza`);
    await page.locator('[data-fair-sponsored="garage"]').waitFor();
    const garageActions = await page.locator('[data-fair-sponsored="garage"] [class*="spActions"]').boundingBox();
    const garageBars = await page.locator('[data-fair-sponsored="garage"] [data-sponsored-progress]').boundingBox();
    assert.ok(garageActions.x + garageActions.width + 4 < garageBars.x, 'garage actions stay clear of timeline too');
    await page.screenshot({ path: resolve(output, `garage-${width}.png`) });
    await page.locator('[data-fair-sponsored="garage"]').getByRole('link', { name: 'Pogledaj', exact: true }).click();
    await page.waitForURL('**/model/**');
    await page.locator('h1').filter({ hasText: /Demo/i }).waitFor();
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, [], 'demo never sends API writes');
    results.push({ width, height, rotatedModels: [...models], errors, posts });
    await context.close();
  }
  const reduced = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const reducedPage = await reduced.newPage();
  const reducedPosts = [], reducedErrors = [];
  reducedPage.on('pageerror', error => reducedErrors.push(error.message));
  await reduced.route('**/api/fair/**', route => {
    if (route.request().method() !== 'POST') return route.continue();
    reducedPosts.push(route.request().url());
    return route.abort();
  });
  await reducedPage.goto(`${base}/pasosi/demo-01`);
  await reducedPage.locator('button[class*="mount"]').first().waitFor();
  for (let remaining = 3; remaining > 0; remaining--) {
    await reducedPage.locator('button[class*="mount"]').first().click();
    await reducedPage.waitForFunction(count => document.querySelectorAll('button[class*="mount"]').length === count, remaining - 1);
    assert.equal(await reducedPage.locator('[class*="fly"]').count(), 0, 'reduced motion skips flying stamps');
    await reducedPage.waitForTimeout(400);
  }
  await reducedPage.screenshot({ path: resolve(output, 'passport-reduced-motion.png') });
  assert.deepEqual(reducedPosts, []);
  assert.deepEqual(reducedErrors, []);
  await reduced.close();
  console.log(JSON.stringify({ output, results, reducedMotion: { errors: reducedErrors, posts: reducedPosts } }, null, 2));
} finally { await browser.close(); }
