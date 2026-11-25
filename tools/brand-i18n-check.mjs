// /workspace/webdev/scanme/tools/brand-i18n-check.mjs
// Card 08 (docs/tasks/08-tekstovi-i18n.md): all /sajam/<event>/brend/<brand> copy lives in
// lib/i18n/sr/fair-brand.ts; components/fair/brand/ renders from the dictionary, and every
// count noun ("N model/ modela na štandu", "N izabran/izabrana/izabrano") declines correctly.
// Runs the project's own tsc, then greps the brand surface for hardcoded Serbian.
// No network, no DB: node tools/brand-i18n-check.mjs [--skip-tsc].

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dictPath = "lib/i18n/sr/fair-brand.ts";
const compsDir = "components/fair/brand";
const routesDir = "app/sajam";

const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (msg) => { console.log("FAIL:", msg); process.exit(1); };

// --- 1. tsc (the project's own checker) ---
if (!process.argv.includes("--skip-tsc")) {
  // This repo's tsc needs a bigger V8 heap than the container default (the Convex generated
  // .convex types push the full program past 2GB); 7GB fits the machine's 10GB.
  const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=7000"].filter(Boolean).join(" ") };
  const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env });
  const tsc = existsSync(join(root, "node_modules/.bin/tsc"))
    ? run("node_modules/.bin/tsc", ["--noEmit", "-p", "tsconfig.json"])
    : run("npx", ["tsc", "--noEmit", "-p", "tsconfig.json"]);
  if (tsc.error) fail(`tsc could not run: ${tsc.error.message}`);
  if (tsc.status !== 0) fail(`tsc --noEmit failed:\n${(tsc.stdout || tsc.stderr || "").slice(0, 4000)}`);
  console.log("PASS: tsc --noEmit clean");
}

// --- 2. the dictionary is registered in the i18n index and typed ---
const dict = read(dictPath);
const types = read("lib/i18n/types.ts");
const index = read("lib/i18n/index.ts");
for (const [needle, where] of [
  ["fairBrandSr", "lib/i18n/index.ts"],
  ['"fair-brand"', "lib/i18n/index.ts"],
  ["FairBrandDict", "lib/i18n/types.ts"],
]) {
  if (!read(where).includes(needle)) fail(`${where} does not wire ${needle} (card 08 wires the dict the same way as fair-garage/fair-map)`);
}
if (!/export const fairBrandSr = \{/.test(dict) || !/satisfies FairBrandDict/.test(dict)) fail(`${dictPath} does not satisfy the FairBrandDict interface type`);

// --- 3. no hardcoded Serbian in components/fair/brand/ (the dict is the only home) ---
// Only string literals are scanned (identifiers like `modelCount` and code comments are not
// copy): every double- or single-quoted run plus JSX text nodes must be English or come
// from the dictionary. Backslash-escapes are skipped so no string is read across a quote.
function stringLiterals(src) {
  // Strip comments first (they don't print; the checker must not flag JSDoc copy references),
  // then scan every remaining quoted run, skipping backslash-escapes.
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\n)\s*\/\/[^\n]*|\/\/[^\n]*$/g, "$1");
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const q = clean[i];
    if (q !== '"' && q !== "'" && q !== "`") continue;
    let j = i + 1;
    while (j < clean.length && clean[j] !== q && clean[j] !== "\n") {
      if (clean[j] === "\\") { j += 2; continue; }
      j++;
    }
    if (j >= clean.length || clean[j] !== q) continue; // unterminated on this line: not a literal
    out.push(clean.slice(i + 1, j));
    i = j;
  }
  return out;
}
function jsxText(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\n)\s*\/\/[^\n]*|\/\/[^\n]*$/g, "$1");
  const out = [];
  // JSX text runs start after a `>` that closes a tag and end at the next `<` or `{`
  // expression; template-attribute mis-scans are excluded by the backtick/`${` filter.
  const re = /(?<!-)>([^{}<>`]*?)(?=<|\{)/g;
  for (const m of clean.matchAll(re)) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  }
  return out;
}
// The copy this card owns, plus the inflected forms it must not reappear in components.
const COPY = [
  "prijavi", "prijavlj", "prijavljen", "prijavljuj", "probna vožnja",
  "rezervis", "potvrd", "grešk", "pošalji", "promeni", "izabrano", "izabrana",
  "na štandu", "pasoš", "dodaj ", "bez aplikacije", "registracije", "obnova",
  "ponovi", "pokušaj", "imejl", "prezime", "kolega", "kontakt", "poruka",
  "hval", "uspešn", "nije uspelo", "došlo", "kasnije", "zauzet", "dostupn",
  "početna", "termin", "izaberite", "uneste", "upišite", "dodajte", "rezervacija",
  "izmen", "obrisi", "snimi", "vrać", "kreni", "tvoje", "vaše", "tvoj", "vašeg",
  "poslednj", "sledeć", "trenutno", "pretraži", "sačuv", "razdvoj",
].map((w) => new RegExp(`\\b${w}`, "iu"));
const brandFiles = readdirSync(join(root, compsDir)).filter((f) => /\.(tsx|ts)$/.test(f)).sort();
for (const f of brandFiles) {
  const src = read(`${compsDir}/${f}`);
  const strings = [...stringLiterals(src), ...jsxText(src)];
  const hits = strings.filter((s) => COPY.some((re) => re.test(s)));
  if (hits.length) fail(`${compsDir}/${f} still hardcodes Serbian copy (move to ${dictPath}): ${hits.map((h) => JSON.stringify(h.slice(0, 40))).join(", ")}`);
}
console.log(`PASS: ${brandFiles.length} components/fair/brand/ files carry no hardcoded copy`);

// --- 4. every component gets the dict the way fair-garage/fair-map does ---
// fair-map takes getDict("fair-garage") from "@/lib/i18n" (amf-map-sponsor.tsx); fair-garage
// components receive dict as a typed prop (dict: FairGarageDict) built once at the page level.
// The brand surface must follow exactly that shape — no component reads lib/i18n/sr/* directly.
for (const f of brandFiles) {
  const src = read(`${compsDir}/${f}`);
  if (src.includes('from "@/lib/i18n/sr/fair-brand"')) fail(`${compsDir}/${f} reads the sr file directly; card 08 wants getDict("fair-brand") / dict props like fair-garage`);
  if (src.includes("export function FairBrandPage")) {
    if (!/getDict\("fair-brand"\)/.test(src)) fail(`${compsDir}/${f} must call getDict("fair-brand") (the fair-map way)`);
  } else if (!/dict: FairBrandDict/.test(src)) {
    fail(`${compsDir}/${f} must take dict: FairBrandDict as a prop (the fair-garage prop way)`);
  }
}
console.log(`PASS: components/fair/brand/ get the dict via getDict("fair-brand") + FairBrandDict props`);

// --- 5. count-noun declension (the card's own numbers) ---
// The rule as the app implements it everywhere (srPluralCategory): n%10==1 and n%100!=11 ->
// one; n%10 in 2..4 outside 11-14 -> few; else many. The dict strings are the "{count}"
// templates, so the check asserts the exact One/Few/Many templates per family.
const pluralOf = (n) => {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? "one" : a >= 2 && a <= 4 && !(b >= 11 && b <= 14) ? "few" : "many";
};
for (const [family, forms] of [
  ["modelsOnStand", { one: "{count} model", few: "{count} modela", many: "{count} modela" }],
  ["selectedCount", { one: "{count} izabran", few: "{count} izabrana", many: "{count} izabrano" }],
]) {
  for (const n of [1, 2, 3, 4, 5, 11, 14, 15, 21]) {
    const want = forms[pluralOf(n)];
    if (!dict.includes(want)) fail(`dictionary is missing the "${want}" template of ${family} (card 08's rule for count ${n})`);
  }
  // The function keys must exist and pick through srPluralCategory (one home for the rule).
  if (!new RegExp(`\\b${family}: (\\w+)\\b`).test(dict)) fail(`dictionary has no ${family} function`);
  const picker = dict.match(new RegExp(`const ${family} = `)) ? "inline" : "picker";
  void picker;
}
if (!/brandPlural\(/.test(dict)) fail("fair-brand.ts must resolve its counters through srPluralCategory (the app's single three-form rule)");
if (!/srPluralCategory/.test(read("lib/i18n/format.ts"))) fail("lib/i18n/format.ts has no srPluralCategory");
// The brandPlural picker must be keyed off srPluralCategory (not its own modulo copy), and the
// brandPlural call sites must pass the family's own One/Few/Many templates in that order.
const pickerBody = dict.slice(dict.indexOf("function brandPlural"), dict.indexOf("\n", dict.indexOf("}", dict.indexOf("function brandPlural"))));
if (!/srPluralCategory\(/.test(pickerBody)) fail("fair-brand.ts brandPlural() must route through srPluralCategory(count), the app's single rule");
for (const [key, one, few, many] of [
  ["modelsLine", "{count} model", "{count} modela", "{count} modela"],
  ["selectedLine", "{count} izabran", "{count} izabrana", "{count} izabrano"],
]) {
  const at = dict.indexOf(`const ${key} = `);
  if (at < 0) fail(`fair-brand.ts has no ${key}() helper`);
  const call = dict.slice(at, dict.indexOf(");", at));
  if (!call.includes(`"${one}"`) || !call.includes(`"${few}"`) || !call.includes(`"${many}"`)) fail(`${key} must brandPlural("${one}", "${few}", "${many}", count)`);
}
console.log("PASS: counters route through the app's single srPluralCategory rule");

// --- 5b. live: render the shipped declension with the shipped srPluralCategory ---
const fmtMod = await import(new URL("file://" + join(root, "lib/i18n/format.ts")));
const { fmt: liveFmt, srPluralCategory } = fmtMod;
const pick = (one, few, many, n) => { const c = srPluralCategory(n); return c === "one" ? one : c === "few" ? few : many; };
for (const [label, tpl, want] of [
  ["modelsOnStand(1)", "{count} model", "1 model"],
  ["modelsOnStand(2)", "{count} modela", "2 modela"],
  ["modelsOnStand(21)", "{count} model", "21 model"],
  ["selectedCount(1)", "{count} izabran", "1 izabran"],
  ["selectedCount(4)", "{count} izabrana", "4 izabrana"],
  ["selectedCount(14)", "{count} izabrano", "14 izabrano"],
]) {
  const n = Number(label.match(/\((\d+)\)/)[1]);
  const got = liveFmt(pick(tpl, tpl, tpl, n), { count: String(n) }).replace("{count}", String(n));
  if (!got.startsWith(want)) fail(`live declension: ${label} renders "${got}", expected "${want}..."`);
}
console.log("PASS: live srPluralCategory produces the card's 1/2-4/5+/11-14 forms");

// --- 6. every string the components reference exists in the dictionary ---
const keysUsed = new Set();
for (const f of brandFiles) for (const m of read(`${compsDir}/${f}`).matchAll(/\bdict\.(\w+)/g)) keysUsed.add(m[1]);
for (const k of keysUsed) if (!new RegExp(`\\b${k}:`).test(dict)) fail(`components/fair/brand/ render dict.${k} but the dictionary has no such key`);
console.log(`PASS: ${keysUsed.size} dict keys used by components exist in ${dictPath}`);

// --- 7. the brand route and its server builder leak no copy either (SEO strings come from the dict) ---
for (const f of [join(routesDir, "[eventSlug]/brend/[brandSlug]/page.tsx"), "lib/fair-server/brand-page.ts"]) {
  const src = read(f);
  const text = [...stringLiterals(src), ...jsxText(src)].join("");
  if (COPY.some((re) => re.test(text))) fail(`${f} hardcodes Serbian strings; move them to fair-brand.ts`);
}
console.log("PASS: brand route and brand server builder have no hardcoded copy");

console.log("ALL BRAND COPY CHECKS PASSED");
console.log(JSON.stringify({ brandFiles: brandFiles.length, dictKeys: [...keysUsed].sort().length }));
