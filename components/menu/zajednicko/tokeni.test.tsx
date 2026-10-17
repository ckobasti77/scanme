// @vitest-environment node
//
// K07: the Menu panel tokens (tokeni.module.css) alias the admin tokens of
// app/globals.css with a fallback for use outside the admin. This test keeps
// every fallback equal to the admin value of the same theme (no drift), and
// proves the contrast floors of docs/menu/MENU-UX.md §2 in both themes and on
// the waiter surface: text 4.5:1, icons, control boundaries and focus 3:1.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { wcagContrast } from "culori";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const GLOBALS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const MODULE = readFileSync(path.join(__dirname, "tokeni.module.css"), "utf8");

/** The declarations of the first top-level block that starts with `selector {`. */
function block(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`block not found: ${selector}`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[match[1]] = match[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

const norm = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();

const adminLight = block(GLOBALS, ".admin-v1");
const adminDark = { ...adminLight, ...block(GLOBALS, 'html[data-theme="dark"] .admin-v1') };
const rootLight = block(GLOBALS, ":root");
const rootDark = { ...rootLight, ...block(GLOBALS, 'html[data-theme="dark"]') };

const moduleLight = block(MODULE, ".povrsina");
const moduleDark = block(MODULE, ':global(html[data-theme="dark"]) .povrsina');
const waiterLight = block(MODULE, '.povrsina[data-povrsina="konobar"]');
const waiterDark = block(MODULE, ':global(html[data-theme="dark"]) .povrsina[data-povrsina="konobar"]');

/** `var(--x, fallback)` → [--x, fallback]. */
function alias(value: string): [string, string] | null {
  const match = /^var\((--[\w-]+),\s*(.+)\)$/.exec(value);
  return match ? [match[1], match[2]] : null;
}

/** A source value with `var(--admin-…)` references resolved inside the same block. */
function resolveSource(source: Record<string, string>, name: string): string | undefined {
  let value = source[name];
  for (let depth = 0; value && depth < 5; depth += 1) {
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (!ref) break;
    value = source[ref[1]];
  }
  return value;
}

describe("Menu panel tokens alias the admin tokens without drift", () => {
  const cases: [string, Record<string, string>, Record<string, string>, Record<string, string>][] = [
    ["light", moduleLight, adminLight, rootLight],
    ["dark", moduleDark, adminDark, rootDark],
  ];
  for (const [theme, declarations, admin, root] of cases) {
    test(`${theme}: every fallback equals the source value`, () => {
      let checked = 0;
      for (const [name, value] of Object.entries(declarations)) {
        const parsed = alias(value);
        if (!parsed) continue;
        const [source, fallback] = parsed;
        const from = source.startsWith("--admin-") ? admin : source.startsWith("--mp-") ? null : root;
        if (!from) continue;
        const expected = resolveSource(from, source);
        expect(expected, `${name} → ${source} is not defined in app/globals.css (${theme})`).toBeDefined();
        expect(norm(fallback), `${name} fallback (${theme})`).toBe(norm(expected!));
        checked += 1;
      }
      expect(checked).toBeGreaterThan(theme === "light" ? 30 : 20);
    });
  }

  test("every --mp- token is namespaced; no other product's tokens", () => {
    for (const name of [...Object.keys(moduleLight), ...Object.keys(moduleDark)]) {
      expect(["--focus-ring", "--border"].includes(name) || name.startsWith("--mp-"), name).toBe(true);
    }
    expect(MODULE).not.toContain(["--", "venue", "-"].join(""));
    expect(MODULE).not.toContain(["--", "links", "-"].join(""));
  });
});

/** Concrete colours of one theme (aliases reduced to their fallback or global value). */
function palette(...layers: Record<string, string>[]): Record<string, string> {
  const merged: Record<string, string> = Object.assign({}, ...layers);
  const root = layers.includes(moduleDark) ? rootDark : rootLight;
  const out: Record<string, string> = {};
  const resolve = (value: string, depth = 0): string => {
    if (depth > 5) return value;
    const parsed = alias(value);
    if (parsed) {
      const [source, fallback] = parsed;
      if (source.startsWith("--mp-")) return resolve(merged[source] ?? fallback, depth + 1);
      if (!source.startsWith("--admin-") && root[source]) return resolve(root[source], depth + 1);
      return resolve(fallback, depth + 1);
    }
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref && merged[ref[1]]) return resolve(merged[ref[1]], depth + 1);
    return value;
  };
  for (const [name, value] of Object.entries(merged)) out[name] = resolve(value);
  return out;
}

const THEMES: [string, Record<string, string>][] = [
  ["panel, light", palette(moduleLight)],
  ["panel, dark", palette(moduleLight, moduleDark)],
  ["waiter, light", palette(moduleLight, waiterLight)],
  ["waiter, dark", palette(moduleLight, moduleDark, waiterDark)],
];

const TEXT_PAIRS: [string, string][] = [
  ["--mp-tekst", "--mp-okvir"],
  ["--mp-tekst", "--mp-povrsina"],
  ["--mp-tekst", "--mp-povrsina-utisana"],
  ["--mp-tekst-sporedni", "--mp-okvir"],
  ["--mp-tekst-sporedni", "--mp-povrsina"],
  ["--mp-tekst-sporedni", "--mp-povrsina-utisana"],
  ["--mp-akcent-tekst", "--mp-okvir"],
  ["--mp-akcent-tekst", "--mp-povrsina"],
  ["--mp-akcent-tekst", "--mp-akcent-meko"],
  ["--mp-na-mastilu", "--mp-mastilo"],
  ["--mp-na-akcentu", "--mp-akcent"],
  ["--mp-na-opasnosti", "--mp-opasnost"],
  ["--mp-na-istaknutom", "--mp-istaknuto"],
  ["--mp-na-istaknutom-sporedni", "--mp-istaknuto"],
  ["--mp-akcent", "--mp-istaknuto"],
  ["--mp-tekst", "--mp-uspeh-meko"],
  ["--mp-tekst", "--mp-upozorenje-meko"],
  ["--mp-tekst", "--mp-opasnost-meko"],
  ["--mp-tekst", "--mp-info-meko"],
  ["--mp-opasnost", "--mp-povrsina"],
];

const GRAPHIC_PAIRS: [string, string][] = [
  ["--mp-uspeh", "--mp-uspeh-meko"],
  ["--mp-upozorenje", "--mp-upozorenje-meko"],
  ["--mp-opasnost", "--mp-opasnost-meko"],
  ["--mp-info", "--mp-info-meko"],
  ["--mp-ivica-kontrole", "--mp-okvir"],
  ["--mp-ivica-kontrole", "--mp-povrsina"],
  ["--mp-fokus", "--mp-okvir"],
  ["--mp-fokus", "--mp-povrsina"],
  ["--mp-vrsta-poziv", "--mp-vrsta-poziv-meko"],
  ["--mp-vrsta-racun", "--mp-vrsta-racun-meko"],
  ["--mp-vrsta-porudzbina", "--mp-vrsta-porudzbina-meko"],
  ["--mp-vrsta-rezervacija", "--mp-vrsta-rezervacija-meko"],
  ["--mp-vrsta-poziv", "--mp-povrsina"],
  ["--mp-vrsta-racun", "--mp-povrsina"],
  ["--mp-vrsta-porudzbina", "--mp-povrsina"],
  ["--mp-vrsta-rezervacija", "--mp-povrsina"],
];

describe("contrast floors of the Menu panel tokens (WCAG 2.1 AA)", () => {
  for (const [label, colours] of THEMES) {
    test(`${label}: text pairs reach 4.5:1`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(colours[fg], `${fg} (${label})`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(colours[bg], `${bg} (${label})`).toMatch(/^#[0-9a-f]{6}$/i);
        expect(wcagContrast(colours[fg], colours[bg]), `${fg} on ${bg} (${label})`).toBeGreaterThanOrEqual(4.5);
      }
    });

    test(`${label}: icons, control boundaries and focus reach 3:1`, () => {
      for (const [fg, bg] of GRAPHIC_PAIRS) {
        expect(wcagContrast(colours[fg], colours[bg]), `${fg} on ${bg} (${label})`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  test("ScanMe green is never a text colour on a light surface (2.08:1)", () => {
    const light = THEMES[0][1];
    expect(wcagContrast(light["--mp-akcent"], light["--mp-povrsina"])).toBeLessThan(3);
    // …which is why text uses --mp-akcent-tekst and the green is a fill under ink.
    expect(light["--mp-akcent-tekst"]).not.toBe(light["--mp-akcent"]);
  });

  test("targets: 44 px in the panel, 48 px in the waiter panel", () => {
    expect(moduleLight["--mp-meta"]).toBe("2.75rem");
    expect(waiterLight["--mp-meta"]).toBe("3rem");
  });
});

describe("app/globals.css unlayered rules that Menu must work with", () => {
  // `* { border-color: var(--border) }` and `button { border-radius: var(--button-radius) }`
  // are unlayered, so they beat every Tailwind utility (@layer utilities). A Menu
  // border colour is set through --border, a Menu button radius through --button-radius.
  test("the two rules still exist (if they go away, this guard can be relaxed)", () => {
    expect(GLOBALS).toMatch(/\n\* \{\n\s*border-color: var\(--border\);/);
    expect(GLOBALS).toMatch(/border-radius: var\(--button-radius\);/);
  });

  test("no border-colour utility in Menu components (it would be silently overridden)", () => {
    const dirs = ["components/menu/zajednicko", "components/menu/izlog"];
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const name of readdirSync(path.join(ROOT, dir))) {
        if (!name.endsWith(".tsx") || name.endsWith(".test.tsx")) continue;
        const source = readFileSync(path.join(ROOT, dir, name), "utf8");
        for (const match of source.matchAll(/\bborder-(?:[trblxy]-)?(?:transparent|current|\[(?:var|color-mix|#|rgb)[^\]]*\])/g)) {
          offenders.push(`${dir}/${name}: ${match[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("Dugme sets --button-radius, so the global button rule draws the Menu shape", () => {
    const source = readFileSync(path.join(__dirname, "dugme.tsx"), "utf8");
    expect(source).toContain("[--button-radius:var(--mp-radius-dugme)]");
    expect(moduleLight["--border"]).toBe("var(--mp-ivica)");
  });
});
