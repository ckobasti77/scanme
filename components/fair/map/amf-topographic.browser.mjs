// Isolated browser QA of the real component. Starts NO HTTP/Next server and
// never contacts Convex. Only next/link and next/image are shimmed; API data
// are explicit browser-only fixtures. This does not prove the gated app route.
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const output = await mkdtemp(join(tmpdir(), "scanme-amf-topography-"));
const fixture = `
import React from "react";
import { createRoot } from "react-dom/client";
import { Map, Stamp, CarFront } from "lucide-react";
import { AmfTopographicMap } from "./amf-topographic-map";
import { AUTO_MOTO_FEST_2026_MAP } from "@/lib/fair-map/auto-moto-fest-2026";
import { AMF_HALL_ANCHORS } from "@/lib/fair-map/topography";
import { buildFairMapView } from "@/lib/fair-map/view";
const paid = new Set(["skoda", "toyota", "geely", "audi", "ford", "vespa", "honda-moto"]);
const stands = AMF_HALL_ANCHORS.filter(a => a.locationId).map(a => ({
 participationId: "qa-"+a.key, exhibitorName: a.name, standId: "qa-stand-"+a.key,
 mapLocationId: a.locationId, code: "qa", displayName: a.name,
 category: a.moto ? "moto" : "automobili", heatEligible: paid.has(a.key),
 brands: [{brandId:"qa-brand-"+a.key,brandName:a.name,models:[{id:"qa-model-"+a.key,slug:"qa-"+a.key,displayName:"QA "+a.name+" model"}]}]
}));
stands.push({participationId:"qa-aster",exhibitorName:"Aster Marketing",standId:"qa-aster",mapLocationId:"ispred-12",code:"qa",displayName:"Aster Marketing",brands:[],heatEligible:false});
const passport = {passportId:"qa-audi",eventId:"qa-event",brandId:"qa-brand-audi",brandName:"Audi",standMapLocationIds:["hala-1"],models:[{eventModelId:"qa-model-audi",slug:"qa-audi",displayName:"QA Audi model"}]};
const rotation={surface:"map",eventId:"qa-event",snapshotId:"qa-snapshot",version:1,dayKey:"2026-10-17",seed:"qa",epochMs:Date.now()-1000,intervalMs:12000,items:[{eventModelId:"qa-model-toyota",eventId:"qa-event",eventSlug:"auto-moto-fest-2026",slug:"qa-toyota",brandId:"qa-brand-toyota",brandName:"Toyota",displayName:"QA model",priceText:"",visual:"event_placeholder",standMapLocationId:"hala-2",order:0}]};
const root=createRoot(document.getElementById("app"));
function render(unknown=false){
 const data=unknown?stands.map(({heatEligible,...rest})=>rest):stands;
 root.render(<div className="fair-event fair-event--auto-moto">
 <header className="fair-shell"><div className="fair-shell__inner"><div className="fair-event-lockup"><span className="fair-event-lockup__mark"/><span><strong>Sajam automobila</strong><small>Auto Moto Fest</small></span></div><nav className="fair-shell__nav"><span className="fair-shell__current"><Map/><span>Mapa</span></span><a href="#"><Stamp/><span>Pasoši</span></a><a href="#"><CarFront/><span>Garaža</span></a></nav></div></header>
 <AmfTopographicMap eventSlug="auto-moto-fest-2026" view={buildFairMapView(AUTO_MOTO_FEST_2026_MAP,data,[passport])} rotation={rotation} display={false} passportProgress={[{passportId:"qa-audi",stampedModelIds:["qa-model-audi"],stampedCount:1,requiredCount:1,completed:true}]}/></div>);
}
window.amfQaRender=render;render();`;

const bundle = await build({
  absWorkingDir: project,
  stdin: { contents: fixture, loader: "tsx", resolveDir: dirname(fileURLToPath(import.meta.url)) },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  outfile: join(output, "component.js"), define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "qa-next-primitives",
    setup(plugin) {
      plugin.onResolve({ filter: /^next\/(image|link)$/ }, (args) => ({ path: args.path, namespace: "qa-next" }));
      plugin.onLoad({ filter: /.*/, namespace: "qa-next" }, (args) => ({
        loader: "jsx", resolveDir: project,
        contents: args.path.endsWith("link")
          ? 'import React from "react";export default function Link({prefetch,children,...p}){return <a {...p}>{children}</a>}'
          : 'import React from "react";export default function Image({fill,unoptimized,priority,loading,...p}){return <img {...p}/>} ',
      }));
    },
  }],
});
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
const theme = await readFile(join(project, "app/sajam/fair-event.css"), "utf8");
const html = `<!doctype html><html lang="sr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}${theme}\n${css}</style></head><body><div id="app"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  for (const [width, height] of [[360,640],[375,812],[390,844],[430,932],[1280,900],[844,390]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width < 900, isMobile: width < 900 });
    const page = await context.newPage();
    const errors = [], posts = [], expectedErrors = [];
    let heatFailed = false;
    page.on("pageerror", (error) => { errors.push(error.message); console.error("Browser error:", error.message); });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (heatFailed && message.text().includes("500")) expectedErrors.push(message.text());
      else errors.push(message.text());
    });
    page.on("request", (request) => { if (request.method() === "POST") posts.push(request.url()); });
    if (width === 390) {
      const slow = await context.newCDPSession(page);
      await slow.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    }
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      if (url.pathname.startsWith("/api/fair/heat/")) return route.fulfill(heatFailed ? { status: 500, json: { ok: false } } : { json: { ok: true, value: { at: 1, today: { enough: true, levels: [{locationId:"hala-1",level:1}], participationLevels: [{participationId:"qa-audi",level:0.8},{participationId:"qa-toyota",level:0.55},{participationId:"qa-geely",level:0.3}] }, hour: { enough: false, levels: [] } } } });
      const file = resolve(project, "public", `.${url.pathname}`);
      if (!file.startsWith(join(project,"public") + sep)) return route.fulfill({ status: 404, body: "" });
      try { return await route.fulfill({ contentType: file.endsWith(".svg") ? "image/svg+xml" : "image/webp", body: await readFile(file) }); } catch { return route.fulfill({ status: 404, body: "" }); }
    });
    await page.goto("https://amf-qa.invalid/");
    await page.locator("[data-amf-layer]").waitFor({ timeout: 8000 }).catch(async (error) => {
      console.error(JSON.stringify({ output, errors, layout: await page.evaluate(() => [...document.querySelectorAll("[data-amf-topographic], [data-amf-canvas]")].map((element) => ({ className: element.className, rect: element.getBoundingClientRect().toJSON(), height: getComputedStyle(element).height }))) }));
      await page.screenshot({ path: join(output, "failure.png") });
      throw error;
    });
    await page.waitForFunction(() => document.querySelector('[data-exhibit="audi"] path:last-child')?.getAttribute("fill-opacity") > 0.5);
    const layout = await page.evaluate(() => ({
      height: innerHeight,
      bottom: document.querySelector("[data-amf-topographic]").getBoundingClientRect().bottom,
      sponsorBottom: document.querySelector("[data-amf-sponsor]").getBoundingClientRect().bottom,
      overflow: document.documentElement.scrollWidth > innerWidth,
      scroll: document.documentElement.scrollHeight > innerHeight,
    }));
    assert.equal(layout.overflow, false, `horizontal overflow ${width}`);
    if (height > 520) { assert.equal(layout.scroll, false, `page scroll ${width}x${height}`); assert.ok(layout.sponsorBottom <= height + 1); }
    const before = await page.locator("[data-amf-layer]").getAttribute("style");
    await page.locator('[data-brand="audi"]').press("Enter");
    await page.getByRole("dialog", { name: "Audi" }).waitFor();
    assert.equal(await page.locator("[data-amf-layer]").getAttribute("style"), before, "selection must not zoom");
    assert.equal(await page.getByRole("dialog").getByRole("link").getAttribute("href"), "https://www.brosauto.rs/");
    assert.ok((await page.getByRole("dialog").innerText()).includes("1/1"));
    assert.equal(await page.locator('a[href*="/model/"]').count(), 0, "map must not browse vehicles, including through the sponsor");
    const popup = await page.locator("[data-amf-popup]").boundingBox();
    const stage = await page.locator("[data-amf-canvas]").boundingBox();
    assert.ok(popup.x >= stage.x && popup.x + popup.width <= stage.x + stage.width + 1, "pop-up fits horizontally");
    assert.ok(popup.y >= stage.y && popup.y + popup.height <= stage.y + stage.height + 1, "pop-up fits vertically");
    await page.screenshot({ path: join(output, `selected-${width}x${height}.png`) });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(await page.locator('[data-brand="audi"]').evaluate((element) => document.activeElement === element), true);
    await page.getByRole("button", { name: "Pronađi brend ili izlagača", exact: true }).click();
    await page.getByRole("searchbox").fill("skoda");
    await page.locator("#amf-map-results button").first().click();
    await page.getByRole("dialog", { name: "Škoda" }).waitFor();
    await page.getByRole("button", { name: "Prikaži spisak izlagača", exact: true }).click();
    await page.locator("#amf-map-directory").waitFor();
    await page.locator("#amf-map-directory button").filter({ hasText: "Raiffeisen" }).click();
    await page.getByRole("dialog", { name: "Raiffeisen" }).waitFor();
    await page.getByRole("button", { name: "Zatvori detalje štanda", exact: true }).click();
    if (width < 500) {
      const bounds = await page.evaluate(() => {
        const wall = document.querySelector("[data-amf-wall]");
        const box = document.querySelector("[data-amf-canvas]").getBoundingClientRect();
        const rect = wall.getBoundingClientRect();
        const inverse = wall.getScreenCTM().inverse();
        const path = new Path2D(wall.getAttribute("d"));
        const ctx = document.createElement("canvas").getContext("2d");
        const inside = (x, y) => { const p = new DOMPoint(x, y).matrixTransform(inverse); return ctx.isPointInPath(path, p.x, p.y); };
        const fit = document.querySelector('[data-amf-canvas] button').getBoundingClientRect();
        return { width: rect.width / box.width, height: rect.height / box.height, labels: ["auto1", "honda-car"].map((key) => {
          const label = document.querySelector(`[data-brand="${key}"] foreignObject`).getBoundingClientRect();
          return { key, inside: [[label.left,label.top],[label.right,label.top],[label.left,label.bottom],[label.right,label.bottom]].every(([x,y]) => inside(x,y)), covered: label.left < fit.right && label.right > fit.left && label.top < fit.bottom && label.bottom > fit.top };
        }) };
      });
      assert.ok(bounds.width > 0.9 && bounds.height > 0.9, `hall fills phone space ${width}: ${JSON.stringify(bounds)}`);
      for (const label of bounds.labels) {
        assert.equal(label.inside, true, `${label.key} stays inside hall`);
        assert.equal(label.covered, false, `${label.key} is not covered by the fit button`);
      }
    }
    await page.screenshot({ path: join(output, `overview-${width}x${height}.png`) });
    if (width === 1280) {
      const original = await page.locator("[data-amf-layer]").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      const box = await page.locator("[data-amf-canvas]").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -200);
      await page.waitForFunction((initial) => new DOMMatrix(getComputedStyle(document.querySelector("[data-amf-layer]")).transform).a > initial, original);
      await page.getByRole("button", { name: "Prikaži ceo deo", exact: true }).click();
    }
    if (width === 390) {
      const canvas = await page.locator("[data-amf-canvas]").boundingBox();
      const matrixScale = () => page.locator("[data-amf-layer]").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
      const originalScale = await matrixScale();
      const cdp = await context.newCDPSession(page);
      const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{id:1,x:cx-25,y:cy},{id:2,x:cx+25,y:cy}] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{id:1,x:cx-60,y:cy},{id:2,x:cx+60,y:cy}] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForFunction((original) => new DOMMatrix(getComputedStyle(document.querySelector("[data-amf-layer]")).transform).a > original * 1.5, originalScale);
      assert.equal(await page.getByRole("dialog").count(), 0, "pinch must not select a brand");
      await page.screenshot({ path: join(output, "pinched-390x844.png") });
      await page.getByRole("button", { name: "Prikaži ceo deo", exact: true }).click();
      await page.waitForFunction((original) => Math.abs(new DOMMatrix(getComputedStyle(document.querySelector("[data-amf-layer]")).transform).a - original) < 0.001, originalScale);
      await page.getByRole("button", { name: "Ulaz", exact: true }).click();
      await page.locator('[data-amf-canvas][data-zone="ispred"]').waitFor();
      await page.getByRole("button", { name: "Hala", exact: true }).click();
      await page.getByRole("button", { name: "Pronađi brend ili izlagača", exact: true }).click();
      await page.getByRole("searchbox").fill("nepostojeci");
      await page.getByRole("status").waitFor();
      await page.keyboard.press("Escape");
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
      await page.screenshot({ path: join(output, "reduced-motion-dark-preference.png") });
      heatFailed = true;
      await page.reload();
      await page.getByRole("button", { name: "Pokušaj ponovo", exact: true }).waitFor();
      heatFailed = false;
      await page.getByRole("button", { name: "Pokušaj ponovo", exact: true }).click();
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].some(b => b.textContent === "Pokušaj ponovo"));
      await page.evaluate(() => window.amfQaRender(true));
      await page.waitForFunction(() => document.querySelectorAll('[data-heat-eligible="true"]').length === 0);
      await page.screenshot({ path: join(output, "unknown-service-neutral.png") });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, [], "map QA must not write visitor events");
    results.push({ width, height, ...layout, errors, posts });
    await context.close();
  }
  console.log(JSON.stringify({ mode: "isolated component, not running app route", output, results }, null, 2));
} finally { await browser.close(); }
