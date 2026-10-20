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
import { FairEventShell } from "../event-shell";
import { fairModelSr } from "@/lib/i18n/sr/fair-model";
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
 <FairEventShell eventId="qa-event" eventSlug="auto-moto-fest-2026" eventTitle="Sajam automobila" eventName="Auto Moto Fest" dict={fairModelSr} current="map" />
 <AmfTopographicMap eventSlug="auto-moto-fest-2026" view={buildFairMapView(AUTO_MOTO_FEST_2026_MAP,data,[passport])} rotation={rotation} display={false} passportProgress={[{passportId:"qa-audi",stampedModelIds:["qa-model-audi"],stampedCount:1,requiredCount:1,completed:true}]}/></div>);
}
window.amfQaRender=render;render();`;

const bundle = await build({
  absWorkingDir: project,
  stdin: { contents: fixture, loader: "tsx", resolveDir: dirname(fileURLToPath(import.meta.url)) },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  loader: { ".png": "dataurl", ".jpg": "dataurl", ".webp": "dataurl", ".svg": "dataurl" },
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
const wordmark = (await readFile(join(project, "app/globals.css"), "utf8")).match(/\.scanme-wordmark[^{}]*\{[^{}]*\}/g).join("\n");
const html = `<!doctype html><html lang="sr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font-family:Arial,sans-serif}*{box-sizing:border-box}${theme}\n${wordmark}\n${css}</style></head><body><div id="app"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
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
    assert.equal(await page.locator(".fair-event-lockup small").textContent(), "Auto Moto Fest 2026.");
    if (height > 520) { assert.equal(layout.scroll, false, `page scroll ${width}x${height}`); assert.ok(layout.sponsorBottom <= height + 1); }
    await page.waitForFunction(() => [...document.querySelectorAll('[data-moto="true"] img')].every(img => img.complete && img.naturalWidth > 0));
    const brands = await page.evaluate(() => {
      const bounds = (key) => document.querySelector(`[data-brand="${key}"] foreignObject`).getBoundingClientRect().toJSON();
      return { dongfeng: bounds("dongfeng"), bank: bounds("raiffeisen"), mercedes: bounds("mercedes"), lotos: bounds("lotos"), vidovdan: bounds("vidovdan"), mercedesMark: document.querySelector('[data-mark="mercedes"] > :is(svg,img)').getBoundingClientRect().width, vwMark: document.querySelector('[data-mark="vw"] > :is(svg,img)').getBoundingClientRect().width };
    });
    assert.ok(brands.dongfeng.bottom < brands.bank.top, `Dongfeng/Raiffeisen labels clear at ${width}x${height}`);
    assert.ok(Math.abs(brands.mercedes.y + brands.mercedes.height / 2 - (brands.lotos.y + brands.lotos.height / 2 + brands.vidovdan.y + brands.vidovdan.height / 2) / 2) < 1, "Mercedes centered between Lotos and Vidovdan");
    assert.ok(brands.mercedesMark > brands.vwMark * 1.4, "Mercedes mark is larger");
    const referenceMark = await page.locator('[data-mark="vw"] svg path').boundingBox();
    for (const key of ["audi", "dacia", "ford", "opel"]) {
      const emblem = await page.locator(`[data-mark="${key}"] svg path`).boundingBox();
      const caption = await page.locator(`[data-mark="${key}"] span`).boundingBox();
      assert.ok(emblem.width > referenceMark.width * 1.45, `${key} wide logo is visibly larger than the old square mark`);
      assert.ok(caption.y > emblem.y + emblem.height, `${key} logo does not overlap its caption`);
    }
    const before = await page.locator("[data-amf-layer]").getAttribute("style");
    await page.locator('[data-brand="audi"]').press("Enter");
    await page.getByRole("dialog", { name: "Audi" }).waitFor();
    assert.equal(await page.locator("[data-amf-layer]").getAttribute("style"), before, "selection must not zoom");
    assert.equal(await page.getByRole("dialog").getByRole("link").getAttribute("href"), "https://www.brosauto.rs/");
    assert.ok((await page.getByRole("dialog").innerText()).includes("1/1"));
    assert.equal(await page.getByRole('dialog').locator('a[href*="/model/"]').count(), 0, "stand pop-ups never browse vehicles");
    assert.equal(await page.locator('[data-amf-sponsor] a[href*="/model/"]').count(), 1, "the sponsor has the newly requested model link");
    const popup = await page.locator("[data-amf-popup]").boundingBox();
    const stage = await page.locator("[data-amf-canvas]").boundingBox();
    assert.ok(popup.width <= 220 && popup.height <= 104, "standard pop-up stays compact");
    const close = await page.getByRole("dialog").getByRole("button", { name: "Zatvori detalje štanda", exact: true }).boundingBox();
    assert.ok(close.width >= 43.9 && close.height >= 43.9, "compact close button keeps a finger-sized target");
    const tiles = await page.getByRole("dialog").locator('[class*="popupActions"] > *').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().toJSON()));
    assert.equal(tiles.length, 2);
    assert.ok(Math.abs(tiles[0].y - tiles[1].y) < .1, "stamps and website share a row");
    assert.ok(Math.abs(tiles[0].width - tiles[1].width) < .1, "stamps and website have the same width");
    assert.ok(Math.abs(tiles[0].height - tiles[1].height) < .1, "stamps and website have the same height");
    assert.ok(tiles[1].height >= 43.9, `website keeps a finger-sized target: ${tiles[1].height}`);
    const closeIcon = await page.getByRole("dialog").getByRole("button", { name: "Zatvori detalje štanda", exact: true }).locator('svg').boundingBox();
    const websiteIcon = await page.getByRole("dialog").getByRole("link").locator('svg').boundingBox();
    assert.ok(Math.abs(close.x + close.width - tiles[1].right) < 0.1, "close target aligns with the website tile right edge");
    assert.ok(Math.abs(closeIcon.x + closeIcon.width - websiteIcon.x - websiteIcon.width) < 0.1, "visible X and website icon share the same right edge");
    assert.ok(Math.abs(closeIcon.x + closeIcon.width / 2 - websiteIcon.x - websiteIcon.width / 2) < 0.1, "visible X and website icon share a vertical axis");
    assert.ok(popup.x >= stage.x && popup.x + popup.width <= stage.x + stage.width + 1, "pop-up fits horizontally");
    assert.ok(popup.y >= stage.y && popup.y + popup.height <= stage.y + stage.height + 1, "pop-up fits vertically");
    await page.screenshot({ path: join(output, `selected-${width}x${height}.png`) });
    if (width < 900) {
      for (const [key, name] of [["vw", "Volkswagen"], ["audi", "Audi"]]) {
        const mark = await page.locator(`[data-brand="${key}"] foreignObject`).first().boundingBox();
        await page.touchscreen.tap(mark.x + mark.width / 2, mark.y + mark.height / 2);
        await page.getByRole("dialog", { name, exact: true }).waitFor();
      }
      assert.equal(await page.locator("[data-amf-layer]").getAttribute("style"), before, "switching stands by finger does not zoom or require closing first");
    }
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
    for (const key of ["motogrini", "tvs", "vespa", "aprilia", "piaggio", "honda-moto"]) {
      const mark = page.locator(`[data-brand="${key}"]`);
      const box = await mark.locator("foreignObject").boundingBox();
      if (width < 900) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await mark.press("Enter");
      await page.getByRole("dialog").waitFor();
      assert.equal(await mark.getAttribute("aria-expanded"), "true", `${key} remains selectable`);
      await page.getByRole("button", { name: "Zatvori detalje štanda", exact: true }).click();
    }
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
      // The extra bottom space is intentional: a detached entrance arrow, not an empty map margin.
      assert.ok(bounds.width > 0.9 && bounds.height > 0.88, `hall fills phone space ${width}: ${JSON.stringify(bounds)}`);
      for (const label of bounds.labels) {
        assert.equal(label.inside, true, `${label.key} stays inside hall`);
        assert.equal(label.covered, false, `${label.key} is not covered by the fit button`);
      }
    }
    const entranceLabel = await page.locator('[data-amf-hall-entrance]').boundingBox();
    const wallBounds = await page.locator('[data-amf-wall]').boundingBox();
    const canvasBounds = await page.locator('[data-amf-canvas]').boundingBox();
    assert.ok(entranceLabel.y > wallBounds.y + wallBounds.height + 3, 'entrance is visibly detached from the wall');
    assert.ok(entranceLabel.y + entranceLabel.height <= canvasBounds.y + canvasBounds.height, 'the entire entrance arrow fits');
    if (height > 500) assert.ok(entranceLabel.height > 15, 'entrance arrow is long enough to see on a portrait phone');
    await page.screenshot({ path: join(output, `overview-${width}x${height}.png`) });
    await page.getByRole("button", { name: "Ulaz", exact: true }).click();
    await page.locator('[data-amf-canvas][data-zone="ispred"]').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-area] img')].every(img => img.complete && img.naturalWidth > 0));
    assert.equal(await page.locator('[data-exhibit][data-area="foyer"]').count(), 16);
    assert.equal(await page.locator('[data-exhibit][data-area="outdoor"]').count(), 5);
    assert.equal(await page.locator('[data-exhibit][data-area="foyer"][data-heat-eligible="true"]').count(), 0);
    assert.equal(await page.locator('[data-exhibit][data-area="foyer"] path').count(), 0, "indoor entrance booths do not draw heat contours");
    const entrance = await page.locator("[data-amf-main-entrance] rect").boundingBox();
    const outdoorLogos = await page.locator('[data-exhibit][data-area="outdoor"]').evaluateAll(nodes => nodes.map(n => {
      const key = n.getAttribute('data-exhibit');
      return { key, ...document.querySelector(`[data-mark="${key}"] [data-entrance-logo]`).getBoundingClientRect().toJSON() };
    }));
    for (let i = 0; i < outdoorLogos.length; i++) for (const other of outdoorLogos.slice(i + 1)) {
      const logo = outdoorLogos[i];
      assert.ok(logo.right + 2 <= other.left || other.right + 2 <= logo.left || logo.bottom + 2 <= other.top || other.bottom + 2 <= logo.top, `${logo.key}/${other.key} logos remain separated`);
    }
    for (const key of ["aodes", "xtreme", "auto-happy-outdoor", "swm", "kia"]) {
      assert.equal(await page.locator(`[data-exhibit="${key}"] :is(polygon,rect)`).count(), 0, `${key} has contours, no rectangular outline`);
      assert.equal(await page.locator(`[data-exhibit="${key}"] path`).count(), 6);
      const stand = await page.locator(`[data-brand="${key}"] foreignObject`).boundingBox();
      assert.ok(stand.x > entrance.x + entrance.width, `${key} is entirely right of the entrance`);
      const mark = page.locator(`[data-brand="${key}"] [data-entrance-logo]`);
      assert.equal(await mark.evaluate((image) => getComputedStyle(image).objectFit), "contain", `${key} logo retains its aspect ratio`);
      const artwork = await mark.boundingBox();
      const summit = await page.locator(`[data-exhibit="${key}"] path:last-child`).boundingBox();
      // Organic contours are asymmetric around their anchor; allow the small
      // difference between the anchor and the contour's bounding-box center.
      assert.ok(Math.abs(artwork.x + artwork.width / 2 - summit.x - summit.width / 2) < summit.width * 0.05, `${key} logo is centered on the contour horizontally`);
      assert.ok(Math.abs(artwork.y + artwork.height / 2 - summit.y - summit.height / 2) < summit.height * 0.05, `${key} logo is centered on the contour vertically`);
      const logo = await page.locator(`[data-brand="${key}"] foreignObject`).boundingBox();
      const canvas = await page.locator("[data-amf-canvas]").boundingBox();
      assert.ok(logo.x >= canvas.x && logo.x + logo.width <= canvas.x + canvas.width && logo.y >= canvas.y && logo.y + logo.height <= canvas.y + canvas.height, `${key} logo frame is entirely visible`);
    }
    const benni = await page.locator('[data-exhibit="benni"] > polygon').boundingBox();
    assert.ok(benni.x > entrance.x + entrance.width, "Benni leaves the entrance opening free");
    const entranceMarks = await page.evaluate(() => [...document.querySelectorAll('[data-brand][data-area], [data-brand]:has([data-area])')].map(element => {
      const frame = element.querySelector('foreignObject').getBoundingClientRect();
      const ring = element.querySelector('ellipse').getBoundingClientRect();
      const ellipseContains = [...element.querySelector('[data-area]').children].every(child => {
        const box = child.getBoundingClientRect();
        return [[box.left,box.top],[box.right,box.top],[box.left,box.bottom],[box.right,box.bottom]].every(([x,y]) => ((x-(ring.x+ring.width/2))/(ring.width/2))**2 + ((y-(ring.y+ring.height/2))/(ring.height/2))**2 <= 1.02);
      });
      const label = element.querySelector('[class*="entranceName"]');
      return { key: element.getAttribute('data-brand'), fitsRing: ellipseContains, textOverflow: label ? label.scrollWidth > label.clientWidth + 1 : false, frame: {x:frame.x,y:frame.y,width:frame.width,height:frame.height}, booth: document.querySelector(`[data-exhibit="${element.getAttribute('data-brand')}"] > polygon`)?.getBoundingClientRect().toJSON() };
    }));
    for (const mark of entranceMarks) {
      assert.ok(mark.fitsRing, `${mark.key} logo and label fit in the selection ellipse`);
      assert.equal(mark.textOverflow, false, `${mark.key} label is not clipped`);
      if (mark.booth) assert.ok(mark.frame.x >= mark.booth.x && mark.frame.y >= mark.booth.y && mark.frame.x+mark.frame.width <= mark.booth.right+1 && mark.frame.y+mark.frame.height <= mark.booth.bottom+1, `${mark.key} stays inside its booth`);
    }
    assert.ok((await page.locator('[data-mark="scanme"] .scanme-wordmark').evaluate(e => getComputedStyle(e,'::before').maskImage)).includes('scanme-wordmark-base-mask.svg'), 'current ScanMe wordmark is used');
    assert.notEqual(await page.locator('[data-mark="scanme"] .scanme-wordmark').evaluate(e => getComputedStyle(e,'::after').backgroundColor), await page.locator('[data-mark="scanme"] .scanme-wordmark').evaluate(e => getComputedStyle(e,'::before').backgroundColor), 'ScanMe retains its green accent');
    for (const key of ["servoremont", "zepter", "goes", "benni", "xtreme", "nm", "auto-happy-foyer", "auto-happy-outdoor", "swm", "kia"]) {
      assert.equal(await page.locator(`[data-mark="${key}"] span`).count(), 0, `${key} has no duplicate caption`);
    }
    assert.equal(await page.locator('[data-mark="makete"] :is(img,image)').count(), 0, 'Makete has no miniature car logo');
    assert.equal(await page.locator('[data-mark="makete"]').textContent(), 'Makete');
    if (width === 1280) {
      const benniLogo = await page.locator('[data-brand="benni"] foreignObject').boundingBox();
      await page.mouse.move(benniLogo.x+benniLogo.width/2,benniLogo.y+benniLogo.height/2);
      assert.notEqual(await page.locator('[data-brand="benni"] ellipse').evaluate(e=>getComputedStyle(e).strokeDasharray), 'none', 'hover is dashed too');
    }
    for (const key of ["scanme", "aster", "benni", "servoremont", "parking", "direkcija", "goes", "aodes", "xtreme", "swm", "kia", "auto-happy-outdoor"]) {
      const mark = page.locator(`[data-brand="${key}"]`);
      if (width < 900) {
        const box = await mark.locator("foreignObject").boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      } else await mark.press("Enter");
      await page.getByRole("dialog").waitFor();
      assert.equal(await mark.getAttribute("aria-expanded"), "true", `${key} touch selects the right stand`);
      assert.ok(await page.getByRole("dialog").getByRole("link").getAttribute("href"), `${key} website available without payment`);
      await page.keyboard.press("Escape");
      assert.notEqual(await mark.locator('ellipse').evaluate(e=>getComputedStyle(e).strokeDasharray), 'none', `${key} stays dashed after deselection`);
    }
    await page.screenshot({ path: join(output, `entrance-${width}x${height}.png`) });
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false);
    await page.getByRole("button", { name: "Hala", exact: true }).click();
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
