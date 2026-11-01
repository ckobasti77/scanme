// K28 render tests of the invitation page. No DOM in the edge-runtime
// environment: the screen is checked as renderToStaticMarkup strings (the
// pattern of funkcionalnosti.test.tsx). The accept click and the mapping of
// the query result live in the route component and need a browser. Invented
// data only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { Prihvatanje, type PozivStanje, type PrihvatanjeProps } from "./prihvatanje";

const t = menuPanelSr.poziv;

const PRIJAVA_HREF = "/demo-restoran/client-panel";
const PANEL_HREF = "/demo-restoran/client-panel/meni";
const LOKAL = "Konoba Tri Bureta";

const NASLOV: Record<PozivStanje, string> = {
  ucitava: t.naslov,
  vazeca: t.naslov,
  istekla: t.istekaoNaslov,
  nevazeca: t.nevazeciNaslov,
  prijava: t.prijavaNaslov,
  "drugi-nalog": t.drugiNalogNaslov,
  prihvaceno: t.uspehNaslov,
};

const STANJA = Object.keys(NASLOV) as PozivStanje[];

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function prikazi(stanje: PozivStanje, dodatno: Partial<PrihvatanjeProps> = {}): string {
  return renderToStaticMarkup(
    <Prihvatanje stanje={stanje} prijavaHref={PRIJAVA_HREF} panelHref={PANEL_HREF} {...dodatno} />,
  );
}

const SVE_O_POZIVU: Partial<PrihvatanjeProps> = {
  lokal: LOKAL,
  uloga: "editor",
  istice: Date.UTC(2026, 9, 28, 10, 0, 0),
};

describe("Prihvatanje", () => {
  test.each(STANJA)("%s: title and exactly one h1", (stanje) => {
    const html = prikazi(stanje, SVE_O_POZIVU);
    expect(html.split("<h1").length - 1).toBe(1);
    expect(tekst(html)).toContain(NASLOV[stanje]);
  });

  test("vazeca: venue, role, its description, the term and the button", () => {
    const html = prikazi("vazeca", SVE_O_POZIVU);
    const sadrzaj = tekst(html);
    expect(sadrzaj).toContain(LOKAL);
    expect(sadrzaj).toContain("Urednik");
    expect(sadrzaj).toContain(menuPanelSr.tim.uloge.editor.opis);
    expect(sadrzaj).toContain("Pozivnica važi do 28. 10. 2026.");
    expect(html).toContain("<button");
    expect(sadrzaj).toContain(t.prihvati);
  });

  test("vazeca: working state and an error with role alert", () => {
    const radi = prikazi("vazeca", { ...SVE_O_POZIVU, radi: true });
    expect(tekst(radi)).toContain(t.prihvata);
    expect(radi).toContain('aria-busy="true"');
    expect(radi).not.toContain('role="alert"');

    const greska = prikazi("vazeca", { ...SVE_O_POZIVU, greska: t.greska });
    expect(greska).toContain('role="alert"');
    expect(tekst(greska)).toContain(t.greska);
  });

  test("nevazeca: the venue name does not leak", () => {
    const html = prikazi("nevazeca", SVE_O_POZIVU);
    expect(html).not.toContain(LOKAL);
    expect(html).not.toContain("Urednik");
    expect(tekst(html)).toContain(t.nevazeciOpis);
  });

  test("istekla: says it expired and does not leak the venue name", () => {
    const html = prikazi("istekla", SVE_O_POZIVU);
    expect(html).not.toContain(LOKAL);
    expect(tekst(html)).toContain(t.istekaoOpis);
  });

  test("prijava: links to the client-panel sign-in", () => {
    const html = prikazi("prijava", SVE_O_POZIVU);
    expect(html).toContain(`href="${PRIJAVA_HREF}"`);
    expect(tekst(html)).toContain(t.prijavaDugme);
    expect(html).not.toContain("<form");
  });

  test("prihvaceno: success and the way to the panel", () => {
    const html = prikazi("prihvaceno", SVE_O_POZIVU);
    expect(html).toContain(`href="${PANEL_HREF}"`);
    expect(tekst(html)).toContain(t.otvoriPanel);
  });

  test("drugi-nalog: explains the mismatch", () => {
    expect(tekst(prikazi("drugi-nalog", SVE_O_POZIVU))).toContain(t.drugiNalogOpis);
  });

  test.each(STANJA)("%s: no e-mail address anywhere", (stanje) => {
    expect(prikazi(stanje, SVE_O_POZIVU)).not.toContain("@");
  });
});
