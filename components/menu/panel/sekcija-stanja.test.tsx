// K08 render tests: the honest state of a panel section that is not built yet
// (SekcijaUPripremi), the panel's whole-screen states (loading, sign in, no
// access, service off, a section the role does not see) and the waiter panel's
// entry page (KonobarUlaz).
//
// The shared next/link stub (vitest.config.ts) is enough here: these tests need
// the href, the text and the class of a link, and the stub keeps all three.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuPanelDict, MenuPanelSekcijaUPripremi, MenuPanelStavka } from "@/lib/i18n/types";
import type { MenuTier } from "@/lib/menu/capabilities";
import { PANEL_NAV_SEKCIJE } from "@/lib/menu/panel-nav";
import { roleCan, type MenuActor, type MenuPermission } from "@/lib/menu/permissions";
import { KonobarUlaz } from "../konobar/ulaz";
import { SekcijaUPripremi } from "./sekcija";
import {
  PanelBezPristupa,
  PanelNeaktivan,
  PanelPrijava,
  PanelUcitavanje,
  SekcijaZabranjena,
} from "./stanja-panela";

const render = (node: ReactNode) => renderToStaticMarkup(node);
// Widened to the interface, as the component does: the lists differ per section.
const t: MenuPanelDict = menuPanelSr;

const SEKCIJE: readonly MenuPanelSekcijaUPripremi[] = [
  "pocetna",
  "operativa",
  "lokal",
  "funkcionalnosti",
  "tim",
  "analitika",
  "podesavanja",
];
const PLANOVI: readonly MenuTier[] = ["standard", "premium"];
const ULOGE: readonly MenuActor[] = ["owner", "manager", "editor", "admin"];

// What React puts into markup for text.
const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

// The reverse, for text and attribute values read back out of markup.
const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

function openTag(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>`).exec(html);
  if (!match) throw new Error(`no <${tag}> in: ${html}`);
  return match[0];
}

/** The markup of the first <tag>...</tag> (not nested in itself). */
function element(html: string, tag: string): string {
  const match = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`).exec(html);
  if (!match) throw new Error(`no <${tag}> element in: ${html}`);
  return match[0];
}

/** Every <section>...</section> in the markup, in order (none of these screens nests one in another). */
const sekcijeUMarkupu = (html: string) => [...html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/g)].map((match) => match[0]);

function klase(tag: string): string[] {
  const match = /\sclass="([^"]*)"/.exec(tag);
  return match ? match[1].split(/\s+/) : [];
}

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The inner markup of every <hN> in the markup, in order. */
function naslovi(html: string, nivo: 1 | 2 | 3): string[] {
  return [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((match) => match[1]);
}

const bezTagova = (markup: string) => markup.replace(/<[^>]+>/g, "").trim();

/** What a person reads: tags gone, entities decoded. */
const vidljivTekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " "));

const brojevi = (tekst: string) => tekst.match(/\d+/g) ?? [];

type Sidro = { tag: string; inner: string; href: string | undefined; text: string };

function sidra(html: string): Sidro[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((match) => {
    const tag = `<a${match[1]}>`;
    return { tag, inner: match[2], href: attr(tag, "href"), text: bezTagova(match[2]) };
  });
}

function stavkeListe(html: string): string[] {
  return [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map((match) => match[1]);
}

const svgovi = (html: string) => html.match(/<svg\b[^>]*>/g) ?? [];

/** The primary look of a Dugme (ink fill) and the secondary one (surface fill, outlined). */
const jePrimarno = (tag: string) =>
  klase(tag).includes("bg-[var(--mp-mastilo)]") && !klase(tag).includes("bg-[var(--mp-povrsina)]");
const jeSekundarno = (tag: string) =>
  klase(tag).includes("bg-[var(--mp-povrsina)]") && !klase(tag).includes("bg-[var(--mp-mastilo)]");

/** The markup of the <div> that opens at `od`, up to its matching </div>. */
function divOd(html: string, od: number): string {
  const trag = /<div\b|<\/div>/g;
  trag.lastIndex = od;
  let dubina = 0;
  for (let nadjeno = trag.exec(html); nadjeno; nadjeno = trag.exec(html)) {
    dubina += nadjeno[0] === "</div>" ? -1 : 1;
    if (dubina === 0) return html.slice(od, trag.lastIndex);
  }
  throw new Error("unbalanced <div>");
}

/** The <div> blocks hidden from assistive technology (the skeleton shapes). */
function skriveniBlokovi(html: string): string[] {
  return [...html.matchAll(/<div\b[^>]*\saria-hidden="true"[^>]*>/g)].map((match) => divOd(html, match.index ?? 0));
}

function tekstNapomene(sekcija: MenuPanelSekcijaUPripremi): string {
  const napomena = t.sekcija.napomenaMenadzer[sekcija];
  if (napomena === undefined) throw new Error(`no manager note for ${sekcija}`);
  return napomena;
}

/** The paragraph with exactly this text, cut out of the markup. */
function bezParagrafa(html: string, tekst: string): string {
  const kraj = `>${esc(tekst)}</p>`;
  const naKraju = html.indexOf(kraj);
  if (naKraju === -1) throw new Error(`no <p> with "${tekst}" in: ${html}`);
  return html.slice(0, html.lastIndexOf("<p", naKraju)) + html.slice(naKraju + kraj.length);
}

function stavkaSaDozvolom(sekcija: MenuPanelSekcijaUPripremi, dozvola: MenuPermission): MenuPanelStavka {
  const stavka = t.sekcija.stavke[sekcija].find((kandidat) => kandidat.dozvola === dozvola);
  if (!stavka) throw new Error(`no ${sekcija} line with permission ${dozvola}`);
  return stavka;
}

/** The lines a role is shown: a line with a permission is left out for a role without it. */
const vidljiveStavke = (sekcija: MenuPanelSekcijaUPripremi, actor: MenuActor): readonly MenuPanelStavka[] =>
  t.sekcija.stavke[sekcija].filter((stavka) => !stavka.dozvola || roleCan(actor, stavka.dozvola));

const SA_PREMIUM = SEKCIJE.filter((sekcija) => t.sekcija.stavke[sekcija].some((stavka) => stavka.premium));

type SekcijaOpcije = {
  sekcija: MenuPanelSekcijaUPripremi;
  plan?: MenuTier;
  actor?: MenuActor;
  editorHref?: string;
};

const renderSekcija = ({ sekcija, plan = "standard", actor = "owner", editorHref }: SekcijaOpcije) =>
  render(<SekcijaUPripremi sekcija={sekcija} plan={plan} actor={actor} editorHref={editorHref} />);

/** Every string the section is specified to show, in reading order (for the invented-numbers check). */
function ocekivaniTekst({ sekcija, plan = "standard", actor = "owner", editorHref }: SekcijaOpcije): string {
  const stavke = vidljiveStavke(sekcija, actor);
  const delovi = [
    t.sekcije[sekcija],
    t.sekcija.uPripremi,
    t.sekcija.opisi[sekcija],
    t.sekcija.praznoNaslov,
    t.sekcija.praznoOpis[sekcija],
  ];
  if (editorHref !== undefined) delovi.push(t.sekcija.zaSadaEditor, t.sekcija.otvoriEditor);
  delovi.push(t.sekcija.staDolazi);
  for (const stavka of stavke) {
    delovi.push(stavka.tekst);
    if (stavka.premium) {
      delovi.push(t.sekcija.premiumOznaka, plan === "premium" ? t.sekcija.premiumUkljucen : t.sekcija.premiumZakljucan);
    }
  }
  if (plan !== "premium" && stavke.some((stavka) => stavka.premium)) delovi.push(t.sekcija.premiumNapomena);
  if (actor === "manager" && t.sekcija.napomenaMenadzer[sekcija] !== undefined) {
    delovi.push(tekstNapomene(sekcija));
  }
  return delovi.join(" ");
}

describe("SekcijaUPripremi: the dictionary covers exactly the seven sections without a built screen", () => {
  test("every section but the editor has a line list, an empty-state text and a description", () => {
    expect(Object.keys(t.sekcija.stavke).sort()).toEqual([...SEKCIJE].sort());
    expect(Object.keys(t.sekcija.praznoOpis).sort()).toEqual([...SEKCIJE].sort());
    expect(Object.keys(t.sekcija.stavke)).not.toContain("editor");
    for (const sekcija of SEKCIJE) expect(t.sekcija.stavke[sekcija].length).toBeGreaterThan(0);
  });
});

for (const sekcija of SEKCIJE) {
  describe(`SekcijaUPripremi: ${sekcija}`, () => {
    // An owner on the Standard plan, no Editor link: every line is shown.
    const html = renderSekcija({ sekcija });
    const stavke = t.sekcija.stavke[sekcija];
    const brojPremium = stavke.filter((stavka) => stavka.premium).length;

    test("header: one h1 with the section name, the U pripremi status beside it, then the one-line description", () => {
      expect(count(html, "<h1")).toBe(1);
      expect(naslovi(html, 1)).toEqual([esc(t.sekcije[sekcija])]);
      expect(html).toContain('data-zaglavlje=""');

      const zaglavlje = element(html, "header");
      expect(count(zaglavlje, "data-status-ton")).toBe(1);
      expect(zaglavlje).toContain('data-status-ton="neutralno"');
      expect(zaglavlje).toContain("lucide-circle-dashed");
      expect(zaglavlje).toContain(`<span class="min-w-0">${esc(t.sekcija.uPripremi)}</span>`);
      expect(zaglavlje).toContain(`>${esc(t.sekcija.opisi[sekcija])}</p>`);
      // The status is not part of the heading text; it sits after it, before the description.
      expect(zaglavlje.indexOf("</h1>")).toBeLessThan(zaglavlje.indexOf("data-status-ton"));
      expect(zaglavlje.indexOf("data-status-ton")).toBeLessThan(zaglavlje.indexOf(esc(t.sekcija.opisi[sekcija])));
      // Nothing to press in the header: the one action lives in the card.
      expect(sidra(zaglavlje)).toEqual([]);
    });

    test("one card names what the person will do here: an h2 that labels the section, then a paragraph", () => {
      expect(count(html, "<section")).toBe(1);
      const karticaTag = openTag(html, "section");
      expect(attr(karticaTag, "data-sekcija-u-pripremi")).toBe(sekcija);
      expect(attr(karticaTag, "data-kartica")).toBe("obicna");
      expect(attr(karticaTag, "aria-labelledby")).toBe(`menu-panel-${sekcija}-naslov`);
      // One card, not an empty-state frame inside a card.
      expect(html).not.toContain("data-stanje=");
      // The header comes before the card and is not inside it.
      expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<section"));
      const kartica = element(html, "section");
      expect(kartica).not.toContain("<header");

      expect(naslovi(kartica, 2)).toEqual([esc(t.sekcija.praznoNaslov)]);
      expect(/<h2\b[^>]*\sid="([^"]+)"/.exec(kartica)?.[1]).toBe(attr(karticaTag, "aria-labelledby"));
      expect(kartica).toContain(`>${esc(t.sekcija.praznoOpis[sekcija])}</p>`);
      expect(kartica.indexOf("</h2>")).toBeLessThan(kartica.indexOf(esc(t.sekcija.praznoOpis[sekcija])));
    });

    test("lists every line of what is coming, in order, as a list labelled by its own h3", () => {
      const kartica = element(html, "section");
      expect(naslovi(kartica, 3)).toEqual([esc(t.sekcija.staDolazi)]);
      const naslovListe = /<h3\b[^>]*\sid="([^"]+)"/.exec(kartica)?.[1];
      expect(naslovListe).toBe(`menu-panel-${sekcija}-dolazi`);
      expect(count(kartica, "<ul")).toBe(1);
      expect(attr(openTag(kartica, "ul"), "aria-labelledby")).toBe(naslovListe);
      expect(kartica.indexOf("</h3>")).toBeLessThan(kartica.indexOf("<ul"));

      const redovi = stavkeListe(html).map(bezTagova);
      expect(redovi).toHaveLength(stavke.length);
      stavke.forEach((stavka, index) => {
        expect(redovi[index].startsWith(esc(stavka.tekst))).toBe(true);
      });
      for (const stavka of stavke) expect(html).toContain(esc(stavka.tekst));
    });

    test("heading outline: one h1, then one h2 for the card, then one h3 for the list, nothing deeper", () => {
      expect(count(html, "<h1")).toBe(1);
      expect(count(html, "<h2")).toBe(1);
      expect(count(html, "<h3")).toBe(1);
      expect(count(html, "<h4")).toBe(0);
      expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<h2"));
      expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
      const idjevi = [...html.matchAll(/<h[23]\b[^>]*\sid="([^"]+)"/g)].map((match) => match[1]);
      expect(idjevi).toHaveLength(2);
      expect(new Set(idjevi).size).toBe(2);
    });

    test("every icon is decorative, and the bullets of the list are plain dots, not icons", () => {
      // the U pripremi status, the section icon in the card, and one badge icon per Premium line
      const sve = svgovi(html);
      expect(sve).toHaveLength(2 + brojPremium);
      for (const svg of sve) expect(svg).toContain('aria-hidden="true"');

      const redovi = stavkeListe(html);
      for (const red of redovi) {
        expect(red).toMatch(/^<span aria-hidden="true" class="[^"]*"><\/span>/);
      }
      expect(svgovi(redovi.join(""))).toHaveLength(brojPremium);
    });

    test("is not a landmark of its own, holds no control and, without an Editor href, no link", () => {
      expect(html).not.toContain("<main");
      expect(html).not.toContain("<nav");
      expect(html).not.toContain("<button");
      expect(html).not.toContain("<input");
      expect(html).not.toContain("<form");
      expect(html).not.toContain("<a ");
    });
  });
}

describe("SekcijaUPripremi: every section has its own icon in the card", () => {
  test("the seven icons are different", () => {
    const ikonice = SEKCIJE.map((sekcija) => {
      const klasa = /<section\b[\s\S]*?<svg\b[^>]*\sclass="([^"]*)"/.exec(renderSekcija({ sekcija }))?.[1];
      if (klasa === undefined) throw new Error(`no icon in the card of ${sekcija}`);
      return klasa.split(/\s+/).find((naziv) => naziv.startsWith("lucide-") && naziv !== "lucide");
    });
    expect(ikonice.every((ikonica) => ikonica !== undefined)).toBe(true);
    expect(new Set(ikonice).size).toBe(SEKCIJE.length);
  });
});

describe("SekcijaUPripremi: no invented numbers (master §20)", () => {
  for (const sekcija of SEKCIJE) {
    for (const plan of PLANOVI) {
      for (const actor of ULOGE) {
        test(`${sekcija} on ${plan} for ${actor}: the numbers on screen are exactly the numbers in the dictionary strings that are shown`, () => {
          const opcije = { sekcija, plan, actor, editorHref: "/demo-restoran/client-panel/meni/editor" };
          const naEkranu = brojevi(vidljivTekst(renderSekcija(opcije))).sort();
          const uRecniku = brojevi(ocekivaniTekst(opcije)).sort();
          expect(naEkranu).toEqual(uRecniku);
        });
      }
    }
  }

  test("only the day ranges of Početna and Analitika carry numbers, and 12 is in no section", () => {
    const poSekciji = Object.fromEntries(
      SEKCIJE.map((sekcija) => [sekcija, brojevi(vidljivTekst(renderSekcija({ sekcija })))]),
    );
    expect(poSekciji).toEqual({
      pocetna: ["7"],
      operativa: [],
      lokal: [],
      funkcionalnosti: [],
      tim: [],
      analitika: ["7", "30"],
      podesavanja: [],
    });
    for (const sekcija of SEKCIJE) {
      expect(brojevi(vidljivTekst(renderSekcija({ sekcija, plan: "premium", actor: "manager" })))).not.toContain("12");
    }
  });

  test("an editor reads no number on Početna: the line with the 7 days is hidden from this role", () => {
    expect(brojevi(vidljivTekst(renderSekcija({ sekcija: "pocetna", actor: "editor" })))).toEqual([]);
  });
});

describe("SekcijaUPripremi: lines a role will not see are left out", () => {
  const pocetna = t.sekcija.stavke.pocetna;
  const operativa = stavkaSaDozvolom("pocetna", "operations.read");
  const analitika = stavkaSaDozvolom("pocetna", "analytics.read");

  test("on Početna the Operativa line and the analytics line carry a permission, the other three do not", () => {
    expect(pocetna).toHaveLength(5);
    expect(pocetna.filter((stavka) => stavka.dozvola).map((stavka) => stavka.dozvola)).toEqual([
      "operations.read",
      "analytics.read",
    ]);
  });

  for (const actor of ["editor", "staff"] as const) {
    test(`${actor} on Početna: the Operativa line and the analytics line are not in the markup, the other three are, in order`, () => {
      const html = renderSekcija({ sekcija: "pocetna", actor });
      const redovi = stavkeListe(html).map(bezTagova);
      expect(redovi).toEqual(pocetna.filter((stavka) => !stavka.dozvola).map((stavka) => esc(stavka.tekst)));
      expect(redovi).toHaveLength(3);
      expect(html).not.toContain(esc(operativa.tekst));
      expect(html).not.toContain(esc(analitika.tekst));
      expect(brojevi(vidljivTekst(html))).toEqual([]);
    });
  }

  for (const actor of ["owner", "manager", "admin"] as const) {
    test(`${actor} on Početna sees all five lines, in order`, () => {
      const html = renderSekcija({ sekcija: "pocetna", actor });
      expect(stavkeListe(html).map(bezTagova)).toEqual(pocetna.map((stavka) => esc(stavka.tekst)));
      expect(html).toContain(esc(operativa.tekst));
      expect(html).toContain(esc(analitika.tekst));
      expect(brojevi(vidljivTekst(html))).toEqual(["7"]);
    });
  }

  test("only the lines with a permission are left out: an editor keeps every other line, and the rest of the card", () => {
    for (const sekcija of SEKCIJE) {
      const html = renderSekcija({ sekcija, actor: "editor" });
      expect(stavkeListe(html)).toHaveLength(vidljiveStavke(sekcija, "editor").length);
      expect(naslovi(html, 1)).toEqual([esc(t.sekcije[sekcija])]);
      expect(html).toContain(`>${esc(t.sekcija.praznoOpis[sekcija])}</p>`);
      expect(html).toContain(esc(t.sekcija.staDolazi));
    }
    expect(stavkeListe(renderSekcija({ sekcija: "pocetna", actor: "editor" }))).toHaveLength(3);
  });
});

describe("SekcijaUPripremi: Premium lines", () => {
  test("exactly Funkcionalnosti, Analitika and Podešavanja have Premium lines", () => {
    expect(SA_PREMIUM).toEqual(["funkcionalnosti", "analitika", "podesavanja"]);
  });

  for (const sekcija of SEKCIJE) {
    for (const plan of PLANOVI) {
      test(`${sekcija} on ${plan}: Premium lines carry the badge, the others never do`, () => {
        const html = renderSekcija({ sekcija, plan });
        const stavke = t.sekcija.stavke[sekcija];
        const redovi = stavkeListe(html);
        expect(redovi).toHaveLength(stavke.length);

        stavke.forEach((stavka, index) => {
          const red = redovi[index];
          if (stavka.premium) {
            const opis = plan === "premium" ? t.sekcija.premiumUkljucen : t.sekcija.premiumZakljucan;
            const drugiOpis = plan === "premium" ? t.sekcija.premiumZakljucan : t.sekcija.premiumUkljucen;
            expect(count(red, 'data-status-ton="neutralno"')).toBe(1);
            // the line, the visible badge text, then the state in words for screen readers
            expect(bezTagova(red)).toBe(`${esc(stavka.tekst)} ${esc(t.sekcija.premiumOznaka)}, ${esc(opis)}`);
            expect(red).toContain(`<span class="sr-only">, ${esc(opis)}</span>`);
            expect(red).not.toContain(esc(drugiOpis));
            // the bullet is a dot, so the badge icon is the line's only svg: a check on Premium, a lock on Standard
            const ikonice = svgovi(red);
            expect(ikonice).toHaveLength(1);
            expect(ikonice[0]).toContain('aria-hidden="true"');
            expect(ikonice[0]).toContain(plan === "premium" ? "lucide-circle-check" : "lucide-lock");
            expect(ikonice[0]).not.toContain(plan === "premium" ? "lucide-lock" : "lucide-circle-check");
          } else {
            expect(red).not.toContain("data-status-ton");
            expect(red).not.toContain("<svg");
            expect(bezTagova(red)).toBe(esc(stavka.tekst));
          }
        });

        // the U pripremi status in the header, plus one badge per Premium line
        expect(count(html, "data-status-ton")).toBe(1 + stavke.filter((stavka) => stavka.premium).length);
        expect(html.includes("lucide-lock")).toBe(plan === "standard" && SA_PREMIUM.includes(sekcija));
        expect(html.includes("lucide-circle-check")).toBe(plan === "premium" && SA_PREMIUM.includes(sekcija));
      });
    }
  }

  test("a section without Premium lines has no badge, no lock and no check anywhere but the U pripremi status", () => {
    for (const sekcija of SEKCIJE.filter((s) => !SA_PREMIUM.includes(s))) {
      for (const plan of PLANOVI) {
        const html = renderSekcija({ sekcija, plan });
        expect(count(html, "data-status-ton")).toBe(1);
        expect(html).not.toContain("lucide-lock");
        expect(html).not.toContain("lucide-circle-check");
        expect(html).not.toContain(esc(t.sekcija.premiumOznaka));
      }
    }
  });
});

describe("SekcijaUPripremi: the Premium note", () => {
  const napomena = `>${esc(t.sekcija.premiumNapomena)}</p>`;

  test("is one sentence without a number", () => {
    expect(brojevi(t.sekcija.premiumNapomena)).toEqual([]);
  });

  for (const sekcija of SEKCIJE) {
    test(`${sekcija}: shown on Standard only when the section has a Premium line, never on Premium`, () => {
      const imaPremium = SA_PREMIUM.includes(sekcija);
      expect(count(renderSekcija({ sekcija, plan: "standard" }), napomena)).toBe(imaPremium ? 1 : 0);
      expect(renderSekcija({ sekcija, plan: "premium" })).not.toContain(napomena);
    });
  }

  test("on Standard it is a paragraph in the card, after the list", () => {
    for (const sekcija of SA_PREMIUM) {
      const html = renderSekcija({ sekcija, plan: "standard" });
      expect(html.indexOf(napomena)).toBeGreaterThan(html.indexOf("</ul>"));
      expect(html.indexOf(napomena)).toBeLessThan(html.indexOf("</section>"));
    }
  });

  test("it does not depend on the role, except through the lines the role sees", () => {
    for (const actor of ULOGE) {
      expect(count(renderSekcija({ sekcija: "analitika", actor }), napomena)).toBe(1);
      expect(renderSekcija({ sekcija: "tim", actor })).not.toContain(napomena);
    }
  });
});

describe("SekcijaUPripremi: the manager's note", () => {
  const SA_NAPOMENOM = ["tim", "podesavanja"] as const;

  for (const sekcija of SA_NAPOMENOM) {
    test(`a manager on ${sekcija} reads the note, as a paragraph after the list`, () => {
      const html = renderSekcija({ sekcija, actor: "manager" });
      const napomena = tekstNapomene(sekcija);
      expect(html).toContain(`>${esc(napomena)}</p>`);
      expect(html.indexOf(esc(napomena))).toBeGreaterThan(html.indexOf("</ul>"));
      expect(count(html, esc(napomena))).toBe(1);
    });

    test(`the note is the only difference between a manager and an owner on ${sekcija}`, () => {
      const manager = renderSekcija({ sekcija, actor: "manager" });
      const owner = renderSekcija({ sekcija, actor: "owner" });
      expect(manager).not.toBe(owner);
      expect(bezParagrafa(manager, tekstNapomene(sekcija))).toBe(owner);
    });

    test(`the owner, the editor and the admin never see the note on ${sekcija}`, () => {
      for (const actor of ["owner", "editor", "admin"] as const) {
        expect(renderSekcija({ sekcija, actor })).not.toContain(esc(tekstNapomene(sekcija)));
      }
    });
  }

  test("the two notes are different sentences, each on its own section", () => {
    expect(tekstNapomene("tim")).not.toBe(tekstNapomene("podesavanja"));
    expect(renderSekcija({ sekcija: "tim", actor: "manager" })).not.toContain(esc(tekstNapomene("podesavanja")));
    expect(renderSekcija({ sekcija: "podesavanja", actor: "manager" })).not.toContain(esc(tekstNapomene("tim")));
  });

  test("a manager on a section without a note sees the same as an owner", () => {
    for (const sekcija of SEKCIJE.filter((s) => !(SA_NAPOMENOM as readonly string[]).includes(s))) {
      expect(renderSekcija({ sekcija, actor: "manager" })).toBe(renderSekcija({ sekcija, actor: "owner" }));
    }
  });
});

describe("SekcijaUPripremi: the Editor action, on every section", () => {
  const EDITOR_HREF = "/dev/menu-panel-preview?sekcija=editor&uloga=vlasnik&plan=standard";
  const zaSadaEditor = `>${esc(t.sekcija.zaSadaEditor)}</p>`;

  for (const sekcija of SEKCIJE) {
    test(`${sekcija} with editorHref: the sentence and one link to the Editor, in the card's left column`, () => {
      for (const actor of ULOGE) {
        for (const plan of PLANOVI) {
          const html = renderSekcija({ sekcija, plan, actor, editorHref: EDITOR_HREF });
          const linkovi = sidra(html);
          expect(linkovi).toHaveLength(1);
          expect(linkovi[0].href).toBe(EDITOR_HREF);
          expect(linkovi[0].text).toBe(esc(t.sekcija.otvoriEditor));
          expect(openTag(linkovi[0].inner, "svg")).toContain('aria-hidden="true"');
          expect(klase(linkovi[0].tag)).toContain("min-h-[var(--mp-meta)]");

          // in the card, never in the header
          expect(sidra(element(html, "header"))).toEqual([]);
          expect(sidra(element(html, "section"))).toHaveLength(1);

          // the sentence once, after what the person will do here and before the link and the list
          expect(count(html, zaSadaEditor)).toBe(1);
          const opisSekcije = html.indexOf(esc(t.sekcija.praznoOpis[sekcija]));
          const recenica = html.indexOf(esc(t.sekcija.zaSadaEditor));
          const link = html.indexOf("<a ");
          expect(opisSekcije).toBeLessThan(recenica);
          expect(recenica).toBeLessThan(link);
          expect(link).toBeLessThan(html.indexOf("<h3"));
        }
      }
    });
  }

  test("the main look is the ink fill on Početna and the quiet one on the six other sections", () => {
    const tagPocetne = sidra(renderSekcija({ sekcija: "pocetna", editorHref: EDITOR_HREF }))[0].tag;
    expect(jePrimarno(tagPocetne)).toBe(true);
    expect(jeSekundarno(tagPocetne)).toBe(false);
    for (const sekcija of SEKCIJE.filter((s) => s !== "pocetna")) {
      const tag = sidra(renderSekcija({ sekcija, editorHref: EDITOR_HREF }))[0].tag;
      expect(jeSekundarno(tag)).toBe(true);
      expect(jePrimarno(tag)).toBe(false);
    }
  });

  test("an editor on Početna is offered the Editor too", () => {
    const html = renderSekcija({ sekcija: "pocetna", actor: "editor", editorHref: EDITOR_HREF });
    expect(sidra(html).map((link) => link.href)).toEqual([EDITOR_HREF]);
  });

  test("without editorHref no section shows the sentence or any link", () => {
    for (const sekcija of SEKCIJE) {
      for (const actor of ULOGE) {
        const html = renderSekcija({ sekcija, actor });
        expect(sidra(html)).toEqual([]);
        expect(html).not.toContain("<a ");
        expect(html).not.toContain(esc(t.sekcija.otvoriEditor));
        expect(html).not.toContain(esc(t.sekcija.zaSadaEditor));
      }
    }
  });

  test("the Editor href is escaped in the attribute and read back unchanged", () => {
    for (const sekcija of ["pocetna", "tim"] as const) {
      const html = renderSekcija({ sekcija, editorHref: EDITOR_HREF });
      expect(html).toContain("sekcija=editor&amp;uloga=vlasnik&amp;plan=standard");
      expect(html).not.toContain("sekcija=editor&uloga");
    }
  });
});

describe("PanelBezPristupa", () => {
  const KLIJENTSKI = "/demo-restoran/client-panel";
  const KONOBAR = "/demo-restoran/konobar";
  const html = render(<PanelBezPristupa klijentskiPanelHref={KLIJENTSKI} konobarHref={KONOBAR} />);
  const [vlasnikKartica, osobljeKartica] = sekcijeUMarkupu(html);

  test("is a main landmark on the panel surface with exactly one h1 and its explanation", () => {
    expect(count(html, "<main")).toBe(1);
    expect(openTag(html, "main")).toContain('data-povrsina="panel"');
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(t.stanja.bezPristupaNaslov)]);
    expect(html).toContain(`>${esc(t.stanja.bezPristupaOpis)}</p>`);
  });

  test("card 1 offers the way back to the client panel as the one primary action", () => {
    const prvaKartica = html.slice(0, html.indexOf("<section"));
    expect(prvaKartica).toContain(esc(t.stanja.bezPristupaNaslov));
    expect(prvaKartica).toContain(esc(t.stanja.bezPristupaOpis));
    const linkovi = sidra(prvaKartica);
    expect(linkovi).toHaveLength(1);
    expect(linkovi[0].href).toBe(KLIJENTSKI);
    expect(linkovi[0].text).toBe(esc(t.stanja.nazadNaKlijentskiPanel));
    expect(klase(linkovi[0].tag)).toContain("min-h-[var(--mp-meta)]");
    expect(jePrimarno(linkovi[0].tag)).toBe(true);
  });

  test("card 2 asks the owner to check the account: its own h2 and a sentence, no action", () => {
    expect(vlasnikKartica).toBeDefined();
    const tag = openTag(vlasnikKartica, "section");
    const idNaslova = /<h2\b[^>]*\sid="([^"]+)"/.exec(vlasnikKartica)?.[1];
    expect(attr(tag, "aria-labelledby")).toBeTruthy();
    expect(idNaslova).toBe(attr(tag, "aria-labelledby"));
    expect(naslovi(vlasnikKartica, 2)).toEqual([esc(t.stanja.vlasnikNaslov)]);
    expect(vlasnikKartica).toContain(`>${esc(t.stanja.vlasnikOpis)}</p>`);
    expect(sidra(vlasnikKartica)).toEqual([]);
    expect(vlasnikKartica).not.toContain("<button");
  });

  test("card 3 tells staff where their work is: its own h2, a sentence and a secondary link to the waiter panel", () => {
    expect(osobljeKartica).toBeDefined();
    const tag = openTag(osobljeKartica, "section");
    const idNaslova = /<h2\b[^>]*\sid="([^"]+)"/.exec(osobljeKartica)?.[1];
    expect(attr(tag, "aria-labelledby")).toBeTruthy();
    expect(idNaslova).toBe(attr(tag, "aria-labelledby"));
    expect(naslovi(osobljeKartica, 2)).toEqual([esc(t.stanja.osobljeNaslov)]);
    expect(osobljeKartica).toContain(`>${esc(t.stanja.osobljeOpis)}</p>`);

    const linkovi = sidra(osobljeKartica);
    expect(linkovi).toHaveLength(1);
    expect(linkovi[0].href).toBe(KONOBAR);
    expect(linkovi[0].text).toBe(esc(t.stanja.osobljeDugme));
    expect(klase(linkovi[0].tag)).toContain("min-h-[var(--mp-meta)]");
    expect(jeSekundarno(linkovi[0].tag)).toBe(true);
  });

  test("there are exactly two cards after the first, with different headings", () => {
    expect(sekcijeUMarkupu(html)).toHaveLength(2);
    expect(attr(openTag(vlasnikKartica, "section"), "aria-labelledby")).not.toBe(
      attr(openTag(osobljeKartica, "section"), "aria-labelledby"),
    );
    expect(t.stanja.vlasnikNaslov).not.toBe(t.stanja.osobljeNaslov);
  });

  test("the page has exactly these two links, the way back first", () => {
    expect(sidra(html).map((sidro) => sidro.href)).toEqual([KLIJENTSKI, KONOBAR]);
  });

  test("heading outline: the h1, then the owner's h2, then the staff h2, nothing deeper", () => {
    expect(naslovi(html, 2)).toEqual([esc(t.stanja.vlasnikNaslov), esc(t.stanja.osobljeNaslov)]);
    expect(count(html, "<h3")).toBe(0);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<h2"));
  });

  test("the wordmark and every icon are decorative", () => {
    expect(html).toContain('<span aria-hidden="true" class="scanme-wordmark');
    const ikonice = svgovi(html);
    expect(ikonice.length).toBeGreaterThanOrEqual(3);
    for (const svg of ikonice) expect(svg).toContain('aria-hidden="true"');
  });
});

describe("PanelPrijava", () => {
  const PRIJAVA = "/demo-restoran/client-panel?tema=tamna&x=1";
  const KONOBAR = "/demo-restoran/konobar";
  const html = render(<PanelPrijava prijavaHref={PRIJAVA} konobarHref={KONOBAR} />);

  test("is a main landmark with one h1 and the explanation", () => {
    expect(count(html, "<main")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(t.stanja.prijavaNaslov)]);
    expect(html).toContain(`>${esc(t.stanja.prijavaOpis)}</p>`);
  });

  test("links to the sign-in href first (primary), then staff (no account) to the waiter entry (secondary)", () => {
    const linkovi = sidra(html);
    expect(linkovi).toHaveLength(2);
    expect(linkovi[0].href).toBe(PRIJAVA);
    expect(linkovi[0].text).toBe(esc(t.stanja.prijavaDugme));
    expect(jePrimarno(linkovi[0].tag)).toBe(true);
    expect(linkovi[1].href).toBe(KONOBAR);
    expect(linkovi[1].text).toBe(esc(t.stanja.osobljeDugme));
    expect(jeSekundarno(linkovi[1].tag)).toBe(true);
    expect(html).toContain("tema=tamna&amp;x=1");
  });

  test("the sign-in link is in the first card, the waiter link in the staff card", () => {
    const sekcije = sekcijeUMarkupu(html);
    expect(sekcije).toHaveLength(1);
    expect(sidra(html.slice(0, html.indexOf("<section"))).map((link) => link.href)).toEqual([PRIJAVA]);
    expect(sidra(sekcije[0]).map((link) => link.href)).toEqual([KONOBAR]);
  });

  test("the staff card has its own h2 and sentence, and there is no owner card here", () => {
    const [osoblje] = sekcijeUMarkupu(html);
    const idNaslova = /<h2\b[^>]*\sid="([^"]+)"/.exec(osoblje)?.[1];
    expect(idNaslova).toBe(attr(openTag(osoblje, "section"), "aria-labelledby"));
    expect(naslovi(html, 2)).toEqual([esc(t.stanja.osobljeNaslov)]);
    expect(osoblje).toContain(`>${esc(t.stanja.osobljeOpis)}</p>`);
    expect(html).not.toContain(esc(t.stanja.vlasnikNaslov));
    expect(count(html, "<h3")).toBe(0);
  });

  test("has no form of its own: the auth flow stays in the existing client panel", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="password"');
  });
});

describe("PanelNeaktivan", () => {
  const KLIJENTSKI = "/demo-restoran/client-panel";
  const html = render(<PanelNeaktivan klijentskiPanelHref={KLIJENTSKI} />);

  test("says the service is off, in one h1, with the explanation", () => {
    expect(count(html, "<main")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(t.stanja.neaktivnoNaslov)]);
    expect(html).toContain(`>${esc(t.stanja.neaktivnoOpis)}</p>`);
  });

  test("offers the way back to the client panel and nothing else", () => {
    const linkovi = sidra(html);
    expect(linkovi).toHaveLength(1);
    expect(linkovi[0].href).toBe(KLIJENTSKI);
    expect(linkovi[0].text).toBe(esc(t.stanja.nazadNaKlijentskiPanel));
  });

  test("shows no staff card and no form", () => {
    expect(html).not.toContain("<section");
    expect(html).not.toContain(esc(t.stanja.osobljeNaslov));
    expect(html).not.toContain("<form");
  });
});

describe("PanelUcitavanje", () => {
  const html = render(<PanelUcitavanje />);
  const skriveni = skriveniBlokovi(html);

  test("is a polite status that says what is loading, once", () => {
    expect(count(html, 'role="status"')).toBe(1);
    const tag = /<div\b[^>]*role="status"[^>]*>/.exec(html)?.[0] ?? "";
    expect(tag).not.toBe("");
    expect(tag).toContain('aria-live="polite"');
    expect(html).toContain(`<span class="sr-only">${esc(t.stanja.ucitavanje)}</span>`);
    expect(count(html, esc(t.stanja.ucitavanje))).toBe(1);
  });

  test("is a skeleton, not a spinner, on the panel surface", () => {
    expect(openTag(html, "div")).toContain('data-povrsina="panel"');
    expect(html).toContain('data-oblik="kartice"');
    expect(html).not.toContain("animate-spin");
  });

  test("the frame has three hidden shapes: the phone top bar, the side navigation and a page header", () => {
    expect(skriveni).toHaveLength(3);
    const [traka, navigacija, zaglavlje] = skriveni.map((blok) => klase(openTag(blok, "div")));
    // the top bar is for below 1024 px, the side navigation from 1024 px, the header at every width
    expect(traka).toContain("lg:hidden");
    expect(navigacija).toContain("hidden");
    expect(navigacija).toContain("lg:block");
    expect(zaglavlje).not.toContain("lg:hidden");
    expect(zaglavlje).not.toContain("hidden");
    // the navigation shape has one row per section
    expect(count(skriveni[1], 'h-9"')).toBe(PANEL_NAV_SEKCIJE.length);
  });

  test("the content is the status with one skeleton card (one row), outside the hidden shapes", () => {
    const status = html.slice(html.indexOf('role="status"'));
    expect(count(status, "mp-radius-kartica")).toBe(1);
    for (const blok of skriveni) expect(blok).not.toContain('role="status"');
  });

  test("a screen reader meets only the status sentence: the shapes are hidden", () => {
    const bezSkrivenih = skriveni.reduce((ostatak, blok) => ostatak.replace(blok, ""), html);
    expect(bezSkrivenih).toContain('role="status"');
    expect(bezTagova(bezSkrivenih)).toBe(esc(t.stanja.ucitavanje));
  });

  test("has nothing to focus, no heading and no main landmark while it waits", () => {
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<main");
    expect(html).not.toContain("<input");
  });
});

describe("SekcijaZabranjena", () => {
  const POCETNA = "/demo-restoran/client-panel/meni";
  const html = render(<SekcijaZabranjena naslov={t.sekcije.tim} uloga="Urednik" pocetnaHref={POCETNA} />);

  test("the given section title is the h1", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(t.sekcije.tim)]);
  });

  test("says the section is not for this role and names the role", () => {
    expect(t.stanja.zabranjenoOpis).toContain("{uloga}");
    expect(html).toContain('data-sekcija-zabranjena=""');
    expect(naslovi(html, 2)).toEqual([esc(t.stanja.zabranjenoNaslov)]);
    expect(html).toContain(`>${esc(fmt(t.stanja.zabranjenoOpis, { uloga: "Urednik" }))}</p>`);
    expect(html).not.toContain("{uloga}");
    expect(vidljivTekst(html)).toContain("Urednik");
  });

  test("links to Početna, and only there", () => {
    const linkovi = sidra(html);
    expect(linkovi).toHaveLength(1);
    expect(linkovi[0].href).toBe(POCETNA);
    expect(linkovi[0].text).toBe(esc(t.stanja.idiNaPocetnu));
    expect(jeSekundarno(linkovi[0].tag)).toBe(true);
  });

  test("shows a lock, decorative, and is not a landmark of its own", () => {
    expect(html).toContain("lucide-lock");
    for (const svg of svgovi(html)) expect(svg).toContain('aria-hidden="true"');
    expect(html).not.toContain("<main");
  });

  test("another title and role are used as given, and the section is not shown", () => {
    const drugi = render(
      <SekcijaZabranjena naslov={t.sekcije.analitika} uloga="Menadžer" pocetnaHref="/dev/menu-panel-preview?tema=tamna" />,
    );
    expect(naslovi(drugi, 1)).toEqual([esc(t.sekcije.analitika)]);
    expect(drugi).toContain(esc(fmt(t.stanja.zabranjenoOpis, { uloga: "Menadžer" })));
    expect(sidra(drugi).map((sidro) => sidro.href)).toEqual(["/dev/menu-panel-preview?tema=tamna"]);
    for (const markup of [html, drugi]) {
      expect(markup).not.toContain("data-sekcija-u-pripremi");
      expect(markup).not.toContain(esc(t.sekcija.staDolazi));
    }
  });
});

describe("KonobarUlaz", () => {
  const KLIJENTSKI = "/demo-restoran/client-panel";
  const html = render(<KonobarUlaz klijentskiPanelHref={KLIJENTSKI} />);

  test("is the main landmark of the waiter surface, with exactly one h1 and the description", () => {
    expect(count(html, "<main")).toBe(1);
    expect(openTag(html, "main")).toContain('data-povrsina="konobar"');
    expect(html).not.toContain('data-povrsina="panel"');
    expect(count(html, "<h1")).toBe(1);
    expect(naslovi(html, 1)).toEqual([esc(t.konobar.naslov)]);
    expect(count(html, "<h2")).toBe(0);
    expect(html).toContain(`>${esc(t.konobar.opis)}</p>`);
  });

  test("tells the three steps in an ordered list, in order", () => {
    expect(t.konobar.koraci).toHaveLength(3);
    expect(count(html, "<ol")).toBe(1);
    expect(count(html, "<ul")).toBe(0);
    const redovi = stavkeListe(element(html, "ol")).map(bezTagova);
    expect(redovi).toEqual(t.konobar.koraci.map(esc));
    // description, then the steps, then what to do without a link
    expect(html.indexOf(esc(t.konobar.opis))).toBeLessThan(html.indexOf("<ol"));
    expect(html.indexOf("</ol>")).toBeLessThan(html.indexOf(esc(t.konobar.bezLinka)));
  });

  test("says what to do without a link or a QR code", () => {
    expect(html).toContain(`>${esc(t.konobar.bezLinka)}</p>`);
    expect(count(html, esc(t.konobar.bezLinka))).toBe(1);
  });

  test("has one link, to the client panel, for the owner or manager who landed here", () => {
    const linkovi = sidra(html);
    expect(linkovi).toHaveLength(1);
    expect(linkovi[0].href).toBe(KLIJENTSKI);
    expect(linkovi[0].text).toBe(esc(t.konobar.vlasnik));
    expect(klase(linkovi[0].tag)).toContain("min-h-[var(--mp-meta)]");
    // after the card
    expect(html.indexOf(esc(t.konobar.bezLinka))).toBeLessThan(html.indexOf("<a "));
    expect(count(html, "href=")).toBe(1);
  });

  test("has no form and no control: it only says how to get in", () => {
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<textarea");
    expect(html).not.toContain("<select");
  });

  test("the wordmark and every icon are decorative", () => {
    expect(html).toContain('<span aria-hidden="true" class="scanme-wordmark');
    const ikonice = svgovi(html);
    expect(ikonice.length).toBeGreaterThanOrEqual(1);
    for (const svg of ikonice) expect(svg).toContain('aria-hidden="true"');
  });

  test("another client panel href is used as given", () => {
    const drugi = render(<KonobarUlaz klijentskiPanelHref="/dev/menu-panel-preview?tema=tamna" />);
    expect(sidra(drugi).map((link) => link.href)).toEqual(["/dev/menu-panel-preview?tema=tamna"]);
  });
});
