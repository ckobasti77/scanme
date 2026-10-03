// Golden harness for the ScanMe Links render path (TASK-05 / RFC-001 §2.11).
//
//   node harness/run.mjs capture   render the corpus, write goldens
//   node harness/run.mjs check     re-render, diff against goldens, exit 1 on drift
//
// What is serialized per case (deliberate departure from RFC §2.11, per
// TASK-05 Step 2): the frame subtree's normalized outerHTML plus the resolved
// `--links-*` custom-property values on the token-bearing root. Full computed
// styles and screenshots are platform-dependent and would make goldens
// unportable between Windows and Linux CI, so neither is captured.

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOLDEN_DIR = path.join(ROOT, "harness", "goldens");
const PORT = 3199;
const URL_BASE = `http://127.0.0.1:${PORT}`;
const CORPUS_URL = `${URL_BASE}/dev/template-gallery?harness=1`;

// Fixed viewports: one desktop, one mobile (TASK-05 Step 1).
const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  mobile: { width: 390, height: 844 },
};

const mode = process.argv[2];
if (mode !== "capture" && mode !== "check") {
  console.error("Usage: node harness/run.mjs <capture|check>");
  process.exit(2);
}

function startDevServer() {
  const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-p", String(PORT), "-H", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } },
  );
  let log = "";
  child.stdout.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr.on("data", (chunk) => {
    log += chunk;
  });
  return { child, getLog: () => log };
}

function stopDevServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } else {
    child.kill("SIGTERM");
  }
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await fetch(URL_BASE, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() > deadline) {
      throw new Error(`Dev server did not answer on port ${PORT} in time`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

// Runs inside the page. Serializes one case subtree into canonical HTML:
// sorted attributes, CSS-module classes mapped to stable names, inline style
// declarations sorted by property name, comments dropped, whitespace-only
// text dropped and remaining runs collapsed, React-style generated ids
// masked. Returns [{ caseId, html, tokens }].
const EXTRACT_IN_PAGE = `(() => {
  const classMap = JSON.parse(
    document.getElementById("__harness-classmap").textContent,
  );
  const VOID_TAGS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "source", "track", "wbr",
  ]);
  const REACT_ID = /^(?:«r[0-9a-z]+»|:r[0-9a-z]+:)$/;

  const escapeAttr = (value) =>
    value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const escapeText = (value) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  const normalizeAttr = (element, name, value) => {
    if (name === "class") {
      return value
        .split(/\\s+/)
        .filter(Boolean)
        .map((cls) => classMap[cls] ?? cls)
        .join(" ");
    }
    if (name === "style") {
      const names = Array.from(element.style).sort();
      return names
        .map((prop) => prop + ": " + element.style.getPropertyValue(prop))
        .join("; ");
    }
    if (REACT_ID.test(value)) return "[react-generated-id]";
    return value;
  };

  const serialize = (node) => {
    if (node.nodeType === Node.COMMENT_NODE) return "";
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.data.replace(/\\s+/g, " ");
      return text.trim() === "" ? "" : escapeText(text.trim());
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const tag = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes)
      .map((attr) => [attr.name, normalizeAttr(node, attr.name, attr.value)])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([name, value]) =>
        value === "" ? name : name + '="' + escapeAttr(value) + '"',
      );
    const open = "<" + [tag, ...attrs].join(" ") + ">";
    if (VOID_TAGS.has(tag)) return open;
    const children = Array.from(node.childNodes).map(serialize).join("");
    return open + children + "</" + tag + ">";
  };

  return Array.from(document.querySelectorAll("[data-case-id]")).map(
    (section) => {
      const frame = section.firstElementChild;
      const tokenNames = Array.from(frame.style)
        .filter((name) => name.startsWith("--links-"))
        .sort();
      const computed = getComputedStyle(frame);
      const tokens = {};
      for (const name of tokenNames) {
        tokens[name] = computed.getPropertyValue(name).trim();
      }
      return {
        caseId: section.getAttribute("data-case-id"),
        html: serialize(frame),
        tokens,
      };
    },
  );
})()`;

async function renderCorpus(browser, viewport) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(240_000);
  await page.goto(CORPUS_URL, { waitUntil: "load", timeout: 240_000 });
  await page.waitForSelector("[data-case-id]");
  // Freeze animation/transition state and hide the caret before serializing.
  await page.addStyleTag({
    content:
      "*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }",
  });
  // Fonts are statically imported in app/layout.tsx; wait so no case is
  // serialized mid font swap.
  await page.evaluate(() => document.fonts.ready);
  // Wait for every image (fixture media backgrounds, preset logos) to settle.
  await page.waitForFunction(() =>
    Array.from(document.images).every((image) => image.complete),
  );
  const cases = await page.evaluate(EXTRACT_IN_PAGE);
  await context.close();
  return cases;
}

async function renderAll() {
  const { child, getLog } = startDevServer();
  try {
    await waitForServer();
    const browser = await chromium.launch();
    try {
      const byViewport = {};
      for (const [name, viewport] of Object.entries(VIEWPORTS)) {
        byViewport[name] = await renderCorpus(browser, viewport);
      }
      return byViewport;
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error("--- dev server log (tail) ---");
    console.error(getLog().slice(-4000));
    throw error;
  } finally {
    stopDevServer(child);
  }
}

function toGoldenDocument(byViewport, caseId) {
  const viewports = {};
  for (const name of Object.keys(VIEWPORTS)) {
    const found = byViewport[name].find((entry) => entry.caseId === caseId);
    viewports[name] = { html: found.html, tokens: found.tokens };
  }
  return { caseId, viewports };
}

function caseIdsOf(byViewport) {
  return byViewport[Object.keys(VIEWPORTS)[0]]
    .map((entry) => entry.caseId)
    .sort();
}

async function capture() {
  const byViewport = await renderAll();
  const caseIds = caseIdsOf(byViewport);
  await rm(GOLDEN_DIR, { recursive: true, force: true });
  await mkdir(GOLDEN_DIR, { recursive: true });
  for (const caseId of caseIds) {
    await writeFile(
      path.join(GOLDEN_DIR, `${caseId}.json`),
      JSON.stringify(toGoldenDocument(byViewport, caseId), null, 2) + "\n",
    );
  }
  await writeFile(
    path.join(GOLDEN_DIR, "manifest.json"),
    JSON.stringify(
      { caseCount: caseIds.length, viewports: Object.keys(VIEWPORTS), caseIds },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `harness:capture wrote ${caseIds.length} golden cases × ${Object.keys(VIEWPORTS).length} viewports to harness/goldens/`,
  );
}

function firstDifference(expected, actual) {
  const max = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < max && expected[index] === actual[index]) index += 1;
  const from = Math.max(0, index - 90);
  return {
    index,
    expected: expected.slice(from, index + 120),
    actual: actual.slice(from, index + 120),
  };
}

async function check() {
  let manifest;
  try {
    manifest = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, "manifest.json"), "utf8"),
    );
  } catch {
    console.error(
      "harness:check: no goldens found. Run `npm run harness:capture` first.",
    );
    process.exit(1);
  }

  const byViewport = await renderAll();
  const renderedIds = caseIdsOf(byViewport);
  const failures = [];

  const expectedIds = new Set(manifest.caseIds);
  for (const caseId of renderedIds) {
    if (!expectedIds.has(caseId)) {
      failures.push(`NEW CASE ${caseId}: rendered but no golden exists`);
    }
  }
  for (const caseId of manifest.caseIds) {
    if (!renderedIds.includes(caseId)) {
      failures.push(`MISSING CASE ${caseId}: golden exists but did not render`);
      continue;
    }
    const golden = JSON.parse(
      await readFile(path.join(GOLDEN_DIR, `${caseId}.json`), "utf8"),
    );
    for (const viewportName of Object.keys(VIEWPORTS)) {
      const expected = golden.viewports[viewportName];
      const actual = byViewport[viewportName].find(
        (entry) => entry.caseId === caseId,
      );

      const tokenNames = new Set([
        ...Object.keys(expected.tokens),
        ...Object.keys(actual.tokens),
      ]);
      for (const token of [...tokenNames].sort()) {
        if (expected.tokens[token] !== actual.tokens[token]) {
          failures.push(
            `TOKEN ${caseId} [${viewportName}] ${token}\n` +
              `  expected: ${JSON.stringify(expected.tokens[token])}\n` +
              `  actual:   ${JSON.stringify(actual.tokens[token])}`,
          );
        }
      }

      if (expected.html !== actual.html) {
        const diff = firstDifference(expected.html, actual.html);
        failures.push(
          `HTML ${caseId} [${viewportName}] first difference at char ${diff.index}\n` +
            `  expected: …${diff.expected}…\n` +
            `  actual:   …${diff.actual}…`,
        );
      }
    }
  }

  const goldenFiles = (await readdir(GOLDEN_DIR)).filter(
    (name) => name.endsWith(".json") && name !== "manifest.json",
  );
  if (goldenFiles.length !== manifest.caseIds.length) {
    failures.push(
      `MANIFEST DRIFT: ${goldenFiles.length} golden files vs ${manifest.caseIds.length} manifest entries`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `harness:check FAILED — ${failures.length} mismatch(es) across ${manifest.caseCount} cases\n`,
    );
    for (const failure of failures) console.error(failure + "\n");
    process.exit(1);
  }
  console.log(
    `harness:check passed — ${manifest.caseCount} cases × ${Object.keys(VIEWPORTS).length} viewports match the goldens byte-for-byte`,
  );
}

if (mode === "capture") {
  await capture();
} else {
  await check();
}
