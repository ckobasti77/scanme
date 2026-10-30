// Deterministic browser regression: no server, database or visitor writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const folder = dirname(fileURLToPath(import.meta.url));
const project = resolve(folder, "../../..");
const epochMs = Date.parse("2026-10-19T12:00:00Z");
const fixture = `
import React from "react";
import {createRoot} from "react-dom/client";
import {AmfMapSponsor} from "./amf-map-sponsor";
import {useFairMapRotation} from "./fair-map-rotation";
const item={eventModelId:"qa-toyota",eventId:"qa",eventSlug:"auto-moto-fest-2026",slug:"qa",brandId:"qa",brandName:"Toyota",displayName:"QA model",priceText:"",visual:"event_placeholder",standMapLocationId:"hala-2",order:0};
const rotation={surface:"map",eventId:"qa",snapshotId:"qa",version:1,dayKey:"2026-10-19",seed:"qa",epochMs:${epochMs},intervalMs:12000,items:[item,{...item,eventModelId:"qa-audi",brandName:"Audi",order:1}]};
function App(){const state=useFairMapRotation(rotation);return state?<AmfMapSponsor item={state.item} slotNumber={state.slotNumber} rotation={rotation} display={false} onShowStand={null}/>:null;}
createRoot(document.getElementById("app")).render(<App/>);`;
const bundle = await build({
  absWorkingDir: project, stdin: { contents: fixture, loader: "tsx", resolveDir: folder },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", outfile: "qa.js",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "image-shim", setup(plugin) {
    plugin.onResolve({ filter: /^next\/(image|link)$/ }, (args) => ({ path: args.path, namespace: "qa" }));
    plugin.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({ loader: "jsx", resolveDir: project, contents: args.path.endsWith("link")
      ? 'import React from "react";export default function Link({prefetch,...p}){return <a {...p}/>}'
      : 'import React from "react";export default function Image({fill,unoptimized,priority,...p}){return <img {...p}/>}' }));
  } }],
});
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f8f4ed}#app{max-width:780px;margin:16px auto}${css}</style></head><body><div id="app"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const width of [375, 1280]) for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await context.newPage();
    const errors = [], posts = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()); });
    await page.clock.install({ time: new Date(epochMs + 3000) });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      const file = resolve(project, "public", `.${url.pathname}`);
      assert.ok(file.startsWith(join(project, "public") + sep));
      return route.fulfill({ contentType: "image/svg+xml", body: await readFile(file) });
    });
    await page.goto("https://amf-sponsor-qa.invalid/");
    await page.clock.runFor(100);
    await page.locator("[data-sponsored-progress]").waitFor({ timeout: 3000 }).catch(async (error) => {
      console.error(JSON.stringify({ errors, dom: await page.locator("#app").innerHTML(), clock: await page.evaluate(() => Date.now()) }));
      throw error;
    });
    await page.clock.runFor(100);
    const fill = () => page.locator('[data-sponsored-progress] [data-active="true"] b').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
    const initial = await fill();
    if (reduced) assert.equal(initial, 1);
    else {
      const expected = await page.evaluate((epoch) => ((Date.now() - epoch) % 12000) / 12000, epochMs);
      assert.ok(Math.abs(initial - expected) < 0.08, `join mid-slot: ${initial} vs ${expected}`);
    }
    await page.waitForTimeout(1000);
    const middle = await fill();
    if (!reduced) assert.ok(middle > initial + 0.04 && middle < 0.56, `fills before model changes: ${initial} -> ${middle}`);
    assert.equal(await page.locator("[data-sponsored-progress]").getAttribute("data-slot"), "0");
    const untilNext = await page.evaluate((epoch) => 12000 - (Date.now() - epoch) % 12000, epochMs);
    await page.clock.runFor(untilNext + 200);
    if (!reduced) {
      const geometry = await page.locator('[data-slide="current"]').evaluate(current => {
        const incoming = current.parentElement.querySelector('[data-slide="incoming"]');
        const viewport = current.parentElement.parentElement.getBoundingClientRect();
        return { current: current.getBoundingClientRect().left - viewport.left, incoming: incoming?.getBoundingClientRect().left, gap: incoming ? incoming.getBoundingClientRect().left - current.getBoundingClientRect().left : null, width: viewport.width };
      });
      assert.ok(geometry.current < 0 && geometry.current > -geometry.width, `push is in flight: ${JSON.stringify(geometry)}`);
      assert.ok(Math.abs(geometry.gap - geometry.width) < 1, "both cards share one strip without overlap");
    }
    await page.clock.runFor(800);
    assert.equal(await page.locator("[data-sponsored-progress]").getAttribute("data-slot"), "1");
    const next = await fill();
    if (!reduced) assert.ok(next >= 0 && next < 0.35, `new model starts at its own progress: ${next}`);
    assert.equal(await page.locator("[data-sponsored-progress] i").first().locator("b").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a), 1);
    await page.clock.runFor(12000);
    assert.equal(await page.locator("[data-sponsored-progress]").getAttribute("data-slot"), "2");
    assert.equal(await page.locator("[data-sponsored-progress] i").last().locator("b").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a), 0, "future bars reset on wrap");
    await page.reload();
    await page.locator("[data-sponsored-progress]").waitFor();
    await page.clock.runFor(100);
    const expected = reduced ? 1 : await page.evaluate((epoch) => ((Date.now() - epoch) % 12000) / 12000, epochMs);
    assert.ok(Math.abs(await fill() - expected) < 0.03, "reload joins the shared clock rather than restarting a full interval");
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, []);
    const viewport = page.locator('[data-slide="current"]').locator('..').locator('..');
    await viewport.focus();
    await page.keyboard.press("ArrowLeft");
    await page.clock.runFor(800);
    assert.equal(await page.locator('[data-slide="current"]').count(), 1, "keyboard settles into one current card");
    const box = await viewport.boundingBox();
    await page.mouse.move(box.x + box.width * 0.85, box.y + 25);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + 25, { steps: 6 });
    const drag = await page.locator('[data-slide="current"]').evaluate(element => element.getBoundingClientRect().left - element.parentElement.parentElement.getBoundingClientRect().left);
    assert.ok(drag < -box.width * 0.3, "left swipe follows the pointer left");
    await page.mouse.up();
    await page.clock.runFor(800);
    assert.equal(await page.locator('[data-slide="incoming"]').count(), 0, "swipe settles without snapping");
    results.push({ width, reduced, initial, middle, next, errors, posts });
    await context.close();
  }
  console.log(JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
