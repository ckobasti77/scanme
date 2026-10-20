// The actual form with only Convex and Next Link replaced: no server or real submissions.
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const folder = dirname(fileURLToPath(import.meta.url));
const project = resolve(folder, "../..");
const bundle = await build({
  absWorkingDir: project, bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", outfile: "qa.js",
  stdin: { loader: "tsx", resolveDir: folder, contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {ExhibitorRegistration} from "./exhibitor-registration";
    import {fairExhibitorRegistrationSr as dict} from "../../lib/i18n/sr/fair-exhibitor-registration";
    window.qaCalls=[];
    createRoot(document.getElementById("app")).render(<React.StrictMode><ExhibitorRegistration dict={dict}/></React.StrictMode>);
  ` },
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "registration-qa", setup(plugin) {
    plugin.onResolve({ filter: /^(convex\/react|next\/link)$/ }, (args) => ({ path: args.path, namespace: "qa" }));
    plugin.onLoad({ filter: /.*/, namespace: "qa" }, (args) => ({ loader: "jsx", resolveDir: project, contents: args.path === "next/link"
      ? 'import React from "react";export default function Link(p){return <a {...p}/>;}'
      : `export function useMutation(){return async function(args){window.qaCalls.push(args);return new Promise((resolve,reject)=>{window.qaComplete=()=>window.qaFail?reject(new Error("TEST offline")):resolve({status:"accepted"});});};}` }));
  } }],
});
const js = bundle.outputFiles.find((file) => file.path.endsWith(".js")).text;
const css = bundle.outputFiles.find((file) => file.path.endsWith(".css")).text;
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  *{box-sizing:border-box}body{margin:0;font:16px Arial;background:#faf7ef;color:#211e19}
  fieldset{border:0;padding:0;margin:0}button,input{font:inherit}button{border:0}label{display:block}input:not([type=radio]){width:100%;padding:8px 12px;border:1px solid;border-radius:6px}a{color:inherit}
  :root{--fair-ink:#211e19;--fair-ink-muted:#655d51;--fair-accent:#d95119;--fair-accent-ink:white;--fair-accent-soft:#f5e1d4;--fair-line-strong:#a99c8c;--fair-line:#ded4c3;--fair-border:1px solid #ded4c3;--fair-surface:#fffdf8;--fair-danger:#a52d21}
  ${css}</style></head><body><div id="app"></div><script>${js.replaceAll("</script", "<\\/script")}</script></body></html>`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
const output = resolve(project, "output/playwright/amf-registration-corrections");
await mkdir(output, { recursive: true });
const results = [];
try {
  for (const [width, height] of [[360, 640], [390, 844], [430, 932], [844, 390], [1280, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => route.request().url() === "https://registration-qa.invalid/"
      ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html }) : route.abort());
    await page.goto("https://registration-qa.invalid/");
    const models = () => page.getByRole("textbox", { name: "Marka i model", exact: true });
    const group = (number) => page.getByRole("group", { name: `Vozilo ${number}`, exact: true });
    const formValid = () => page.locator("form").evaluate((form) => form.checkValidity());
    const calls = () => page.evaluate(() => window.qaCalls);
    assert.equal(await models().count(), 1);
    assert.equal(await models().first().getAttribute("placeholder"), null);
    assert.equal(await page.locator("form").getAttribute("novalidate"), "");
    assert.equal(await page.locator('input[name="businessName"]').evaluate((input) => !!(input.compareDocumentPosition(document.querySelector('[name="vehicle-model-0"]')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
    await page.getByRole("button", { name: "Pošaljite upit" }).click();
    for (const message of ["Unesite naziv firme", "Unesite ime i prezime", "Unesite telefon ili email", "Unesite marku i model", "Izaberite Starter ili Napredni"]) {
      assert.equal(await page.getByRole("alert").filter({ hasText: message }).count(), 1);
    }
    assert.equal((await calls()).length, 0);
    // Selecting a package first is supported and can be undone without losing the only row.
    await group(1).getByRole("radio", { name: "Starter" }).check();
    await page.getByRole("button", { name: "Ukloni vozilo 1" }).click();
    assert.equal(await models().count(), 1);
    assert.equal(await page.locator("input:checked").count(), 0);
    assert.equal(await models().first().evaluate((input) => input === document.activeElement), true);
    await models().first().fill("   ");
    assert.equal(await models().count(), 1, "spaces must not append rows");
    await models().first().fill("");
    await models().first().pressSequentially("TEST Model A");
    assert.equal(await models().count(), 1, "typing must never reveal the next row");
    assert.equal(await models().first().evaluate((input) => input === document.activeElement), true);
    await group(1).getByRole("radio", { name: "Napredni" }).check();
    assert.equal(await models().count(), 2, "leaving the model and choosing its package reveals one next row");
    await models().nth(1).fill("TEST Model B");
    await group(2).getByRole("radio", { name: "Starter" }).check();
    await models().nth(2).fill("TEST Model C");
    await group(3).getByRole("radio", { name: "Napredni" }).check();
    assert.equal(await models().count(), 4);
    await page.getByRole("button", { name: "Ukloni vozilo 2" }).click();
    assert.deepEqual(await models().evaluateAll((inputs) => inputs.map((input) => input.value)), ["TEST Model A", "TEST Model C", ""]);
    assert.equal(await group(2).getByRole("radio", { name: "Napredni" }).isChecked(), true, "package stays with the model after removal");
    await group(2).getByRole("radio", { name: "Starter" }).check();
    // Last row can be selected before typing and removed; a new empty invitation remains.
    await group(3).getByRole("radio", { name: "Starter" }).check();
    await page.getByRole("button", { name: "Ukloni vozilo 3" }).click();
    assert.equal(await models().count(), 3);
    assert.equal(await models().last().inputValue(), "");
    await page.getByRole("textbox", { name: "Naziv firme" }).fill("TEST Firma");
    await page.getByRole("textbox", { name: "Ime i prezime" }).fill("TEST Izlagač");
    await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("+381 60 000 0000");
    assert.equal(await formValid(), true, "unused empty final row and email are optional");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("broken");
    assert.equal(await formValid(), false);
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("");
    await models().last().fill("TEST incomplete");
    assert.equal(await formValid(), false, "a named vehicle must have a package");
    await models().nth(2).fill("");
    assert.equal(await models().count(), 3, "clearing a model must not leave two empty tail rows");
    assert.equal(await formValid(), true);
    await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("");
    assert.equal(await formValid(), false, "one contact channel is required");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("test@example.invalid");
    assert.equal(await formValid(), true, "email alone is sufficient");
    await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("+381 60 000 0000");
    assert.equal(await formValid(), true, "both contact channels are accepted");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("");
    if (width > 560) {
      const modelBox = await models().first().boundingBox();
      const packageBox = await group(1).getByRole("radio", { name: "Napredni" }).locator('..').boundingBox();
      assert.ok(Math.abs(modelBox.y - packageBox.y) < 2, "model input and package controls align at the top");
      assert.ok(Math.abs(modelBox.height - packageBox.height) < 2, "model input and package controls have equal heights");
    }
    await page.screenshot({ path: resolve(output, `form-${width}.png`), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("123");
    await page.getByRole("button", { name: "Pošaljite upit" }).click();
    await page.getByRole("alert").waitFor();
    assert.equal((await calls()).length, 0);
    assert.equal(await page.getByRole("textbox", { name: "Telefon", exact: true }).evaluate((input) => input === document.activeElement), true);
    await page.getByRole("textbox", { name: "Telefon", exact: true }).fill("+381 60 000 0000");
    await page.evaluate(() => { window.qaFail = true; });
    await page.getByRole("button", { name: "Pošaljite upit" }).click();
    await page.getByRole("button", { name: "Šaljemo upit…" }).waitFor();
    assert.equal(await models().first().isDisabled(), true);
    assert.equal(await page.getByRole("button", { name: "Šaljemo upit…" }).isDisabled(), true);
    await page.evaluate(() => window.qaComplete());
    await page.getByRole("button", { name: "Pošaljite upit" }).waitFor();
    assert.equal(await models().first().inputValue(), "TEST Model A");
    await page.evaluate(() => { window.qaFail = false; });
    await page.getByRole("button", { name: "Pošaljite upit" }).click();
    await page.getByRole("button", { name: "Šaljemo upit…" }).waitFor();
    const submissions = await calls();
    assert.equal(submissions.length, 2);
    assert.equal(submissions[0].submissionId, submissions[1].submissionId);
    assert.deepEqual(JSON.parse(submissions[1].offerSelection).vehicles, [{ model: "TEST Model A", package: "advanced" }, { model: "TEST Model C", package: "starter" }]);
    assert.equal(submissions[1].email, "");
    await page.evaluate(() => window.qaComplete());
    await page.getByRole("heading", { name: "Upit je primljen" }).waitFor();
    assert.equal(await page.getByRole("status").evaluate((element) => element === document.activeElement), true);
    assert.deepEqual(errors, []);
    results.push({ width, height, rowsOnlyAfterBlur: true, mixedPackages: true, contactEitherOr: true, serbianErrors: true, emptyTail: true, errorRetrySuccess: true, errors });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" });
  const page = await context.newPage();
  await page.route("**/*", (route) => route.request().url() === "https://registration-qa.invalid/"
    ? route.fulfill({ contentType: "text/html; charset=utf-8", body: html }) : route.abort());
  await page.goto("https://registration-qa.invalid/");
  await page.screenshot({ path: resolve(output, "form-empty-mobile.png"), fullPage: true });
  const model = page.getByRole("textbox", { name: "Marka i model", exact: true }).first();
  await model.fill("TEST Model A");
  assert.equal(await page.getByRole("group", { name: "Vozilo 2", exact: true }).count(), 0);
  await model.press("Tab");
  const reveal = page.getByRole("group", { name: "Vozilo 2", exact: true }).locator("..");
  await reveal.waitFor({ state: "attached" });
  const initial = await reveal.evaluate((element) => ({ height: element.getBoundingClientRect().height, opacity: Number(getComputedStyle(element).opacity) }));
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll('fieldset')].find((element) => element.querySelector('legend')?.textContent === "Vozilo 2");
    return row && getComputedStyle(row.parentElement).opacity === "1";
  });
  const final = await reveal.evaluate((element) => ({ height: element.getBoundingClientRect().height, opacity: Number(getComputedStyle(element).opacity) }));
  assert.ok(initial.height < final.height && initial.opacity < final.opacity, "the next row grows and fades in after blur");
  assert.equal(await model.evaluate((element) => element === document.activeElement), false);
  results.push({ animationOnBlur: true, initial, final });
  await page.getByRole("group", { name: "Vozilo 1", exact: true }).getByRole("radio", { name: "Napredni" }).check();
  const firstRow = model.locator("xpath=ancestor::fieldset[1]/..");
  const beforeRemoval = await firstRow.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Ukloni vozilo 1" }).click();
  const exiting = page.locator('[inert][aria-hidden="true"]');
  await page.waitForFunction(() => {
    const row = document.querySelector('[inert][aria-hidden="true"]');
    return row && Number(getComputedStyle(row).opacity) < 1 && row.getBoundingClientRect().height > 0;
  });
  const duringRemoval = await exiting.evaluate((element) => ({ height: element.getBoundingClientRect().height, opacity: Number(getComputedStyle(element).opacity) }));
  assert.ok(duringRemoval.height > 0 && duringRemoval.height < beforeRemoval && duringRemoval.opacity < 1, "removed row stays visible while collapsing and fading out");
  assert.equal(await page.getByRole("textbox", { name: "Marka i model", exact: true }).count(), 1, "the exiting row is immediately removed from keyboard and accessibility interaction");
  await exiting.waitFor({ state: "detached" });
  assert.equal(await page.getByRole("textbox", { name: "Marka i model", exact: true }).evaluate((element) => element === document.activeElement), true, "focus remains on the surviving row");
  results.push({ animationOnRemove: true, beforeRemoval, duringRemoval });
  await context.close();
  console.log(JSON.stringify({ results }, null, 2));
} finally { await browser.close(); }
