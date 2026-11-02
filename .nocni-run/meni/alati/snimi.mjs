// Snimci izloga (dev preview rute) za noćni run MENI. Koriste ga agenti; dev server pokreće agent.
//
//   node .nocni-run/meni/alati/snimi.mjs --rute "/dev/menu-editor-preview,/dev/menu-public-preview?layout=tok"
//     [--url http://localhost:3170]        adresa dev servera
//     [--sirine 1440,390]                  širina ili ŠIRINAxVISINA (npr. 1024,768,1280x720)
//     [--teme svetla,tamna]                tema aplikacije (localStorage "scanme-theme" + prefers-color-scheme)
//     [--izlaz output/playwright/meni/K07] folder za PNG (git ga ignoriše)
//     [--pun]                              snimak cele stranice umesto vidljivog dela
//     [--cekaj 800]                        dodatno čekanje posle učitavanja (ms)
//
// Za svaki snimak ispisuje jedan JSON red:
//   { ruta, sirina, visina, tema, status, naslov, snimak, prelivanje, greske, maleMete, slikeBezAlt, bezJezika }
// Poslednji red je { "kraj": true, "snimaka": N, "problema": M }.
// Problem: HTTP >= 400 ili nedostupna ruta, vodoravni skrol stranice.
// Upozorenja: greške u konzoli, dodirne mete manje od 40 px na širini ispod 600, slike bez alt.
// Snima samo dev rute; prijava u pravi /admin, klijentski ili konobarski panel nije deo alata.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

function parseArgs(argv) {
  const out = { url: "http://localhost:3170", rute: [], sirine: ["1440", "390"], teme: ["svetla"], izlaz: "output/playwright/meni/snimci", pun: false, cekaj: 800 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? "";
    if (a === "--url") out.url = next().replace(/\/+$/, "");
    else if (a === "--rute") out.rute = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--sirine") out.sirine = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--teme") out.teme = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--izlaz") out.izlaz = next();
    else if (a === "--pun") out.pun = true;
    else if (a === "--cekaj") out.cekaj = Number(next()) || 0;
  }
  return out;
}

function size(token) {
  const m = /^(\d+)(?:x(\d+))?$/.exec(token);
  if (!m) return null;
  const width = Number(m[1]);
  const height = m[2] ? Number(m[2]) : width < 600 ? 844 : width < 900 ? 1024 : width < 1200 ? 768 : 900;
  return { width, height, label: m[2] ? `${width}x${height}` : String(width) };
}

const NOISE = [/favicon/i, /Download the React DevTools/i, /\[Fast Refresh\]/i, /\[HMR\]/i];

async function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"]';
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.visibility === "hidden" || st.display === "none") continue;
      if (r.bottom < 0 || r.top > window.innerHeight * 3) continue;
      // tekstualni link u pasusu nije meta za palac
      if (el.tagName === "A" && st.display === "inline" && el.closest("p")) continue;
      if (r.width < 40 || r.height < 40) {
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40);
        out.push(`${el.tagName.toLowerCase()} "${label}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      if (out.length >= 12) break;
    }
    return out;
  });
}

const args = parseArgs(process.argv.slice(2));
if (!args.rute.length) {
  console.error('upotreba: node .nocni-run/meni/alati/snimi.mjs --rute "/dev/menu-editor-preview[,...]" [--sirine 1440,390] [--teme svetla,tamna] [--izlaz output/playwright/meni/<ID>]');
  process.exit(2);
}
mkdirSync(args.izlaz, { recursive: true });

let shots = 0;
let problems = 0;
const browser = await chromium.launch();
try {
  for (const route of args.rute) {
    for (const token of args.sirine) {
      const vp = size(token);
      if (!vp) continue;
      for (const theme of args.teme) {
        const dark = theme === "tamna" || theme === "dark";
        const mobile = vp.width < 600;
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: 1,
          colorScheme: dark ? "dark" : "light",
          isMobile: mobile,
          hasTouch: vp.width < 1100,
          reducedMotion: "reduce",
          locale: "sr-RS",
          timezoneId: "Europe/Belgrade",
        });
        await context.addInitScript((t) => {
          try {
            window.localStorage.setItem("scanme-theme", t);
          } catch {}
        }, dark ? "dark" : "light");
        const page = await context.newPage();
        const errors = [];
        page.on("console", (m) => {
          if (m.type() !== "error") return;
          const text = m.text();
          if (!NOISE.some((rx) => rx.test(text))) errors.push(text.slice(0, 400));
        });
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 400)));
        const safe = route.replace(/^\/+/, "").replace(/[^A-Za-z0-9-]+/g, "_") || "root";
        const name = `${safe}-${vp.label}-${dark ? "tamna" : "svetla"}.png`;
        const file = join(args.izlaz, name);
        const row = { ruta: route, sirina: vp.width, visina: vp.height, tema: dark ? "tamna" : "svetla", status: null, naslov: "", snimak: file, prelivanje: false, greske: errors, maleMete: [], slikeBezAlt: 0, bezJezika: false };
        try {
          const res = await page.goto(args.url + route, { waitUntil: "load", timeout: 180000 });
          row.status = res ? res.status() : null;
          await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
          if (args.cekaj) await page.waitForTimeout(args.cekaj);
          row.naslov = await page.title();
          row.prelivanje = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          row.slikeBezAlt = await page.evaluate(() => Array.from(document.images).filter((im) => !im.hasAttribute("alt")).length);
          row.bezJezika = await page.evaluate(() => !document.documentElement.getAttribute("lang"));
          if (mobile) row.maleMete = await smallTargets(page);
          await page.screenshot({ path: file, fullPage: args.pun });
        } catch (e) {
          row.greske.push(`nije učitano: ${String(e && e.message ? e.message : e).slice(0, 300)}`);
        }
        const bad = row.status === null || row.status >= 400 || row.prelivanje;
        shots++;
        if (bad) problems++;
        console.log(JSON.stringify(row));
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({ kraj: true, snimaka: shots, problema: problems }));
