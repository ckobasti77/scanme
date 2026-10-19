// SSR markup stranice /sajam/3d (A05, A03 §6.2), po obrascu fair-model-page.test.tsx: poster kao
// LCP, lista od 78 delova i grupe kao `submit` dugmad GET forme (rade i bez JS-a), kartica za
// `?deo=`, filtrirana lista za `?grupa=` i ni jedan srpski tekst van rečnika.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { PARTS, SYSTEMS } from "@/lib/auto3d/catalog";
import { partsOfSystem } from "@/lib/auto3d/groups";
import { parseUrlState } from "@/lib/auto3d/url-state";
import { fairAuto3dSr as t } from "@/lib/i18n/sr/fair-auto3d";
import { fairAuto3dDeloviSr as delovi } from "@/lib/i18n/sr/fair-auto3d-delovi";

// Stub iz vitest.config nema getImageProps; ovde vraća props kao next/image sa `unoptimized`.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
  getImageProps: (p: { src: string; width: number; height: number; alt: string; fetchPriority?: string; loading?: string }) => ({
    props: { src: p.src, width: p.width, height: p.height, alt: p.alt, fetchPriority: p.fetchPriority, loading: p.loading },
  }),
}));

const { RendgenPage } = await import("./rendgen-page");

function render(search: Record<string, string> = {}): string {
  return renderToStaticMarkup(<RendgenPage url={parseUrlState(search)} />);
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

/** Vrednosti `value` dugmadi `submit` sa datim imenom (React piše `name` posle `value`). */
function submitValues(html: string, name: string): string[] {
  return [...html.matchAll(/<button[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes('type="submit"') && tag.includes(`name="${name}"`))
    .map((tag) => tag.match(/value="([^"]*)"/)?.[1] ?? "");
}

function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Svi tekstualni čvorovi i vrednosti atributa koje čovek čita (alt, aria-label, placeholder). */
function visibleTexts(html: string): string[] {
  const body = html.replace(/<style[\s\S]*?<\/style>/g, "");
  const nodes = [...body.matchAll(/>([^<]+)</g)].map((m) => m[1]);
  const attrs = [...body.matchAll(/\s(?:alt|aria-label|placeholder|title)="([^"]*)"/g)].map((m) => m[1]);
  return [...nodes, ...attrs].map((s) => decode(s).trim()).filter(Boolean);
}

function dictionaryPatterns(): RegExp[] {
  const values: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") values.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(t);
  walk(delovi);
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return values.map((v) => new RegExp(`^${escape(v).replace(/\\\{\w+\\\}/g, "[^]+?")}$`));
}

describe("SSR /sajam/3d", () => {
  test("poster je <picture> sa 3 izvora i <img fetchpriority=high>", () => {
    const html = render();
    const picture = html.match(/<picture[\s\S]*?<\/picture>/)?.[0] ?? "";
    expect(count(picture, /<source /g)).toBe(3);
    expect(picture).toMatch(/media="\(max-width: 767px\)" type="image\/avif" srcSet="\/3d\/auto3d\/poster-sklopljen-telefon\.avif"/);
    expect(picture).toMatch(/<img [^>]*fetchPriority="high"/i);
    expect(picture).toMatch(/<img [^>]*loading="eager"/);
    expect(picture).toContain(`alt="${t.posterAlt}"`);
    // Rasklopljen poster se ne renderuje dok nije potreban (rezerva bez canvasa).
    expect(html).not.toContain("poster-rasklopljen");
  });

  test("naslov, studio i jezičci", () => {
    const html = render();
    expect(count(html, /<h1[ >]/g)).toBe(1);
    expect(html).toContain(`<h1>${t.title}</h1>`);
    expect(html).toContain('role="group"');
    expect(html).toContain(`aria-roledescription="${t.sceneRole}"`);
    expect(count(html, /role="tab"/g)).toBe(3);
    expect(html).toContain('role="tabpanel"');
    expect(html).toMatch(/data-open="false"/);
  });

  test("lista: 78 delova kao submit dugmad GET forme, grupe kao dugmad sa brojem", () => {
    const html = render();
    expect(submitValues(html, "deo")).toEqual(PARTS.map((p) => p.id));
    expect(count(html, /data-part-row=/g)).toBe(PARTS.length);
    // Grupe: traka (desktop) i jezičak (telefon), svaka sa „Sve grupe“ i 10 sistema.
    const ids = SYSTEMS.map((x) => x.id);
    expect(submitValues(html, "grupa")).toEqual([...ids, ...ids]);
    expect(count(html, /aria-pressed="true"/g)).toBe(2);
    expect(html).toContain('action="/sajam/3d" method="get"');
    for (const s of SYSTEMS) expect(html).toContain(delovi.systems[s.id].name);
  });

  test("?deo=turbopunjac: kartica sa specifikacijama u tabeli, napomenom i oznakom ×2", () => {
    const html = render({ deo: "turbopunjac" });
    const card = html.match(/<article[\s\S]*?<\/article>/)?.[0] ?? "";
    const copy = delovi.parts.turbopunjac;
    expect(card).toContain(`>${copy.name}</h2>`);
    expect(card).toContain(copy.description);
    expect(count(card, /<th scope="row">/g)).toBe(copy.specs.length);
    expect(copy.specs.length).toBeGreaterThanOrEqual(3);
    for (const spec of copy.specs) expect(card).toContain(`<td>${spec.value}</td>`);
    expect(card).toContain(copy.fact);
    expect(card).toContain(t.exampleNote);
    expect(card).toContain(t.instancesTwo);
    expect(card).toContain(t.copyLink);
    // Prethodni i sledeći deo iste grupe, kao submit dugmad.
    expect(submitValues(card, "deo")).toEqual(["izduvna_grana", "starter_generator"]);
    // Jezičak Deo je otvoren, a panel vidljiv i na desktopu.
    expect(html).toMatch(/data-open="true" data-tab="deo"/);
    expect(html).toMatch(/aria-current="true"[^>]*data-part-row="turbopunjac"|data-part-row="turbopunjac"[^>]*aria-current="true"/);
  });

  test("?grupa=kocnice: lista samo te grupe, panel otvoren na listi", () => {
    const html = render({ grupa: "kocnice" });
    const rows = [...html.matchAll(/data-part-row="([a-z0-9_]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual([...partsOfSystem("kocnice")]);
    expect(html).toMatch(/data-open="true" data-tab="delovi"/);
    expect(html).toContain('<input type="hidden" name="grupa" value="kocnice"/>');
    expect(html).toContain(delovi.systems.kocnice.name);
  });

  test("nepoznat deo ne pravi karticu", () => {
    const html = render({ deo: "nepostojeci" });
    expect(html).not.toContain("<article");
    expect(html).toContain(t.partEmptyTitle);
  });

  test("nema srpskog teksta van rečnika", () => {
    const patterns = dictionaryPatterns();
    const allowed = /^[\d\s·/×,.%-]+$/;
    const searches: Record<string, string>[] = [
      {},
      { deo: "turbopunjac" },
      { grupa: "motor" },
      { deo: "hauba", rezim: "lak" },
      { tura: "1" },
      { kiosk: "1" },
      { rezim: "lak" },
    ];
    for (const search of searches) {
      for (const text of visibleTexts(render(search))) {
        if (allowed.test(text)) continue;
        expect(patterns.some((re) => re.test(text)), `tekst van rečnika: „${text}“`).toBe(true);
      }
    }
  });

  test("A10: dugme ture u zaglavlju, boje laka u laku, presek u donjoj traci", () => {
    const html = render();
    expect(html).toContain(t.tourStart);
    expect(html).toMatch(/aria-pressed="false"[^>]*>(?:(?!<\/button>).)*Vođena tura/);
    expect(html).not.toContain('aria-label="Boja laka"');
    expect(html).toContain(`title="${t.sectionToggle}"`);
    const lak = render({ rezim: "lak" });
    expect(lak).toContain(`aria-label="${t.paintLabel}"`);
    expect(count(lak, /data-paint="/g)).toBe(6);
    expect(lak).toMatch(/aria-checked="true"[^>]*data-paint="grafit"|data-paint="grafit"[^>]*aria-checked="true"/);
  });

  test("A10: ?tura=1 renderuje titl ture umesto donje trake", () => {
    const html = render({ tura: "1" });
    expect(html).toContain(`aria-label="${t.tourLabel}"`);
    expect(html).toContain(t.tourIntroTitle);
    expect(html).toContain(t.tourPause);
    expect(html).toContain(t.tourNext);
    expect(html).toContain(t.tourExit);
  });

  test("A10: ?kiosk=1: bez zaglavlja i uvoda; natpis, legenda 10 sistema i mesto za QR", () => {
    const html = render({ kiosk: "1" });
    expect(html).not.toContain("fair-shell");
    expect(html).not.toContain(t.tourStart);
    expect(html).toContain(t.kioskEvent);
    expect(html).toContain(t.kioskQrTitle);
    expect(html).toContain("data-qr-placeholder");
    expect(html).toMatch(/<h1 class="sr-only">/);
    const legend = html.split(`aria-label="${t.kioskLegend}"`)[1]?.split("</ul>")[0] ?? "";
    expect(count(legend, /<li/g)).toBe(SYSTEMS.length);
  });

  test("A11: sekcija paketa je ispod scene, a u kiosku je nema", () => {
    const html = render();
    expect(html).toContain('id="paketi"');
    // Ispod scene: posle liste delova (panel) i unutar <main>.
    expect(html.indexOf('id="paketi"')).toBeGreaterThan(html.lastIndexOf("data-part-row="));
    expect(html.indexOf('id="paketi"')).toBeLessThan(html.indexOf("</main>"));
    expect(html).toContain(t.packages.tiers.rendgen.price);
    expect(render({ kiosk: "1" })).not.toContain('id="paketi"');
  });
});
