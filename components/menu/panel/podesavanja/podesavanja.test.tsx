// K28 render tests of the client-panel section Podešavanja: the layout, Jezici,
// the waiter-panel thresholds and Brend i nalog. No DOM in the edge-runtime
// environment: the blocks are checked as renderToStaticMarkup strings (the
// pattern of funkcionalnosti.test.tsx). The save cycle and the add/remove clicks
// need a browser and are not exercised here; the logic behind them is in
// lib/menu/settings-view.test.ts. Invented data only.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { SacuvajIshod } from "../cuvanje";
import { BrendNalog, zatraziPromenuHref } from "./brend-nalog";
import { Jezici, imeJezika } from "./jezici";
import { Podesavanja, PODESAVANJA_REDOSLED } from "./podesavanja";
import { PragoviPanela } from "./pragovi";

const t = menuPanelSr.podesavanja;
const PREMIUM_LIMIT = 28;

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

/** The visible text of some markup. */
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function attr(tag: string | undefined, name: string): string | undefined {
  const value = tag === undefined ? undefined : new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The opening tags of one element name. */
const tagovi = (html: string, ime: string) => html.match(new RegExp(`<${ime}\\b[^>]*>`, "g")) ?? [];

/** The element with this id: its opening tag and everything up to the closing tag of the same name. */
function element(html: string, id: string): { otvaranje: string; sadrzaj: string } | null {
  const poc = html.search(new RegExp(`<[a-z0-9]+\\b[^>]*\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  if (poc < 0) return null;
  const otvaranje = /^<([a-z0-9]+)\b[^>]*>/.exec(html.slice(poc));
  if (!otvaranje) return null;
  const ime = otvaranje[1];
  const rest = html.slice(poc + otvaranje[0].length);
  const kraj = rest.indexOf(`</${ime}>`);
  return { otvaranje: otvaranje[0], sadrzaj: kraj < 0 ? rest : rest.slice(0, kraj) };
}

const sacuvano = async (): Promise<SacuvajIshod> => ({ ok: true });

function jezici(props: Partial<Parameters<typeof Jezici>[0]> = {}) {
  return renderToStaticMarkup(
    <Jezici prevodi={["en"]} maxJezika={2} plan="standard" moze onSacuvaj={sacuvano} {...props} />,
  );
}

function selectIDugme(html: string) {
  const izbor = tagovi(html, "select")[0];
  const dugme = tagovi(html, "button").find((tag) => !attr(tag, "aria-label") && attr(tag, "type") === "button");
  if (izbor === undefined || dugme === undefined) throw new Error("the add control is missing");
  return { izbor, dugme };
}

describe("Jezici", () => {
  test("Standard with sr + en: the add control is locked, with the Premium badge and the reason it points to", () => {
    const html = jezici();
    const { izbor, dugme } = selectIDugme(html);
    expect(izbor).toBeDefined();
    expect(attr(izbor, "disabled")).toBeDefined();
    expect(dugme).toBeDefined();
    expect(attr(dugme!, "aria-disabled")).toBe("true");

    const razlogId = attr(izbor, "aria-describedby");
    expect(razlogId).toBeTruthy();
    expect(attr(dugme!, "aria-describedby")).toBe(razlogId);
    const razlog = element(html, razlogId!);
    expect(razlog).not.toBeNull();
    expect(tekst(razlog!.sadrzaj)).toContain(t.jezici.premiumRazlog);
    expect(tekst(razlog!.sadrzaj)).toContain(t.jezici.premiumOznaka);
    expect(html).toContain("lucide-lock");
    expect(tekst(html)).toContain(t.jezici.standardLimit);
  });

  test("Standard shows the source language first, the translation with its remove button, and the dropdown holds only the rest", () => {
    const html = jezici();
    const tekstovi = tekst(html);
    expect(tekstovi.indexOf("Srpski")).toBeGreaterThanOrEqual(0);
    expect(tekstovi.indexOf("Srpski")).toBeLessThan(tekstovi.indexOf("Engleski"));
    expect(tekstovi).toContain(t.jezici.izvorni);
    const ukloni = fmt(t.jezici.ukloni, { jezik: "engleski" });
    expect(html).toContain(`aria-label="${ukloni}"`);
    expect(html).not.toContain(fmt(t.jezici.ukloni, { jezik: "srpski" }));
    expect(html).not.toContain('<option value="en"');
    expect(html).not.toContain('<option value="sr"');
    expect(html).toContain('<option value="de"');
  });

  test("Standard with only Serbian: one translation fits, so the control is open and nothing is locked", () => {
    const html = jezici({ prevodi: [] });
    const { izbor, dugme } = selectIDugme(html);
    expect(attr(izbor, "disabled")).toBeUndefined();
    expect(attr(dugme!, "aria-disabled")).toBeUndefined();
    expect(attr(dugme!, "disabled")).toBeUndefined();
    expect(html).not.toContain(t.jezici.premiumRazlog);
    expect(tekst(html)).toContain(t.jezici.nemaPrevoda);
  });

  test("Premium: the add control is enabled and there is no lock, badge or reason", () => {
    const html = jezici({ plan: "premium", maxJezika: PREMIUM_LIMIT, prevodi: ["en", "de"] });
    const { izbor, dugme } = selectIDugme(html);
    expect(attr(izbor, "disabled")).toBeUndefined();
    expect(attr(dugme!, "disabled")).toBeUndefined();
    expect(attr(dugme!, "aria-disabled")).toBeUndefined();
    expect(html).not.toContain("lucide-lock");
    expect(html).not.toContain(t.jezici.premiumRazlog);
    expect(html).not.toContain(t.jezici.standardLimit);
    expect(html).not.toContain(t.jezici.iznadLimita);
  });

  test("a stored list above the limit shows the over-limit note, the lock, and still lets every language be removed", () => {
    const html = jezici({ prevodi: ["en", "de", "fr"], maxJezika: 2 });
    expect(tekst(html)).toContain(t.jezici.iznadLimita);
    expect(attr(selectIDugme(html).izbor, "disabled")).toBeDefined();
    for (const jezik of ["engleski", "nemački", "francuski"]) {
      const dugme = tagovi(html, "button").find((tag) => attr(tag, "aria-label") === fmt(t.jezici.ukloni, { jezik }));
      expect(dugme, jezik).toBeDefined();
      expect(attr(dugme!, "disabled")).toBeUndefined();
    }
  });

  test("the note that a change goes through publishing is always on the screen", () => {
    const stanja = [
      jezici(),
      jezici({ prevodi: [] }),
      jezici({ plan: "premium", maxJezika: PREMIUM_LIMIT }),
      jezici({ prevodi: ["en", "de", "fr"] }),
      jezici({ moze: false, razlog: "Samo vlasnik." }),
    ];
    for (const html of stanja) expect(tekst(html)).toContain(t.jezici.krozObjavu);
  });

  test("without the right everything is off and the reason is written and referenced", () => {
    const razlog = t.nemaPrava;
    const html = jezici({ plan: "premium", maxJezika: PREMIUM_LIMIT, moze: false, razlog });
    const { izbor, dugme } = selectIDugme(html);
    expect(attr(izbor, "disabled")).toBeDefined();
    expect(attr(dugme!, "disabled")).toBeDefined();
    expect(tekst(html)).toContain(razlog);
    const razlogId = attr(izbor, "aria-describedby");
    expect(razlogId).toBeTruthy();
    expect(tekst(element(html, razlogId!)?.sadrzaj ?? "")).toBe(razlog);
    const sacuvajDugme = tagovi(html, "button").find((tag) => attr(tag, "type") === "submit");
    expect(attr(sacuvajDugme!, "disabled")).toBeDefined();
    for (const tag of tagovi(html, "button").filter((tag) => attr(tag, "aria-label"))) {
      expect(attr(tag, "disabled")).toBeDefined();
    }
  });

  test("the save button and the empty status line are there", () => {
    const html = jezici();
    expect(tekst(html)).toContain(t.jezici.sacuvaj);
    expect(html).toContain('data-cuvanje="mirno"');
  });

  test("language names are the studio's, capitalised", () => {
    expect(imeJezika("sr")).toBe("Srpski");
    expect(imeJezika("de")).toBe("Nemački");
    expect(imeJezika("cs")).toBe("Češki");
  });
});

describe("PragoviPanela", () => {
  const render = (props: Partial<Parameters<typeof PragoviPanela>[0]> = {}) =>
    renderToStaticMarkup(<PragoviPanela prag={15} podsetnik={5} moze onSacuvaj={sacuvano} {...props} />);

  test("renders both values, the ranges in the help text and the unit", () => {
    const html = render();
    const polja = tagovi(html, "input");
    expect(polja).toHaveLength(2);
    expect(attr(polja[0], "value")).toBe("15");
    expect(attr(polja[0], "min")).toBe("1");
    expect(attr(polja[0], "max")).toBe("120");
    expect(attr(polja[1], "value")).toBe("5");
    expect(attr(polja[1], "min")).toBe("0");
    expect(attr(polja[1], "max")).toBe("60");
    const tekstovi = tekst(html);
    expect(tekstovi).toContain(t.konobar.prag);
    expect(tekstovi).toContain(t.konobar.pragPomoc);
    expect(tekstovi).toContain(t.konobar.podsetnik);
    expect(tekstovi).toContain(t.konobar.podsetnikPomoc);
    expect(tekstovi).toContain(t.konobar.jedinica);
    expect(tekstovi).toContain(t.konobar.sacuvaj);
    expect(polja.every((polje) => attr(polje, "disabled") === undefined)).toBe(true);
  });

  test("0 is a valid reminder and is shown as 0", () => {
    const polja = tagovi(render({ podsetnik: 0 }), "input");
    expect(attr(polja[1], "value")).toBe("0");
  });

  test("each field is described by its own help text", () => {
    const html = render();
    for (const polje of tagovi(html, "input")) {
      const opis = attr(polje, "aria-describedby");
      expect(opis).toBeTruthy();
      expect(element(html, opis!.split(" ")[0])).not.toBeNull();
    }
  });

  test("without the right the fields and the button are off and the reason is written and referenced", () => {
    const html = render({ moze: false, razlog: t.nemaPrava });
    for (const polje of tagovi(html, "input")) {
      expect(attr(polje, "disabled")).toBeDefined();
      const opis = attr(polje, "aria-describedby") ?? "";
      const razlogId = opis.split(" ").find((idDela) => element(html, idDela)?.sadrzaj === t.nemaPrava);
      expect(razlogId).toBeTruthy();
    }
    const dugme = tagovi(html, "button").find((tag) => attr(tag, "type") === "submit");
    expect(attr(dugme!, "disabled")).toBeDefined();
    expect(tekst(html)).toContain(t.nemaPrava);
  });
});

describe("BrendNalog", () => {
  const href = zatraziPromenuHref("Demo restoran");
  const render = (props: Partial<Parameters<typeof BrendNalog>[0]> = {}) =>
    renderToStaticMarkup(
      <BrendNalog
        naziv="Demo restoran"
        plan="standard"
        rezim="hospitality"
        izgledHref="/demo-restoran/client-panel/meni/editor?deo=izgled"
        zatraziHref={href}
        {...props}
      />,
    );

  test("shows the name, the mode line and a mailto link to ScanMe, and nothing that changes the mode", () => {
    const html = render();
    const tekstovi = tekst(html);
    expect(tekstovi).toContain("Demo restoran");
    expect(tekstovi).toContain(t.brend.nazivPomoc);
    expect(tekstovi).toContain("ScanMe Menu · Ugostiteljstvo");
    expect(tekstovi).toContain(t.brend.rezimPomoc);

    const veza = tagovi(html, "a").find((tag) => attr(tag, "href")?.startsWith("mailto:office@scanme.rs"));
    expect(veza).toBeDefined();
    const sadrzaj = html.slice(html.indexOf(veza!));
    expect(tekst(sadrzaj.slice(0, sadrzaj.indexOf("</a>")))).toBe("Zatraži promenu režima");

    expect(html).not.toContain("<select");
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain("<button");
    expect(html).not.toContain('type="checkbox"');
  });

  test("the mode line follows the mode", () => {
    expect(tekst(render({ rezim: "services" }))).toContain(
      fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes.services }),
    );
    expect(tekst(render({ rezim: "retail" }))).toContain("ScanMe Menu · Prodaja i preuzimanje");
  });

  test("Standard lists what Premium unlocks", () => {
    const tekstovi = tekst(render());
    expect(tekstovi).toContain(t.brend.planStandard);
    expect(tekstovi).toContain(t.brend.premiumOtkljucava);
    for (const stavka of t.brend.premiumStavke) expect(tekstovi).toContain(stavka);
    expect(tekstovi).not.toContain(t.brend.premiumUkljucen);
  });

  test("Premium says everything is included instead of the list", () => {
    const tekstovi = tekst(render({ plan: "premium" }));
    expect(tekstovi).toContain(t.brend.planPremium);
    expect(tekstovi).toContain(t.brend.premiumUkljucen);
    expect(tekstovi).not.toContain(t.brend.premiumOtkljucava);
    expect(tekstovi).not.toContain(t.brend.premiumStavke[0]);
  });

  test("the look row links to the Editor, and has no link when there is no way there", () => {
    const html = render();
    expect(tekst(html)).toContain(t.brend.izgled);
    expect(tekst(html)).toContain(t.brend.izgledPomoc);
    const veza = tagovi(html, "a").find((tag) => attr(tag, "href")?.includes("/editor"));
    expect(veza).toBeDefined();
    expect(tekst(html)).toContain(t.brend.otvoriIzgled);

    const bez = render({ izgledHref: null });
    expect(tekst(bez)).toContain(t.brend.izgledPomoc);
    expect(tekst(bez)).not.toContain(t.brend.otvoriIzgled);
  });

  test("the prepared e-mail carries the venue in the subject and the body", () => {
    const delovi = /^mailto:office@scanme\.rs\?subject=([^&]*)&body=(.*)$/.exec(href);
    expect(delovi).not.toBeNull();
    expect(decodeURIComponent(delovi![1])).toBe(fmt(t.brend.zatraziPredmet, { lokal: "Demo restoran" }));
    expect(decodeURIComponent(delovi![2])).toBe(fmt(t.brend.zatraziTelo, { lokal: "Demo restoran" }));
    expect(href).not.toContain(" ");
    expect(href).not.toContain("\n");
  });

  test("a venue name with reserved characters stays inside its query value", () => {
    const poseban = zatraziPromenuHref("Čarda & Ribe #1?");
    expect(poseban.split("&")).toHaveLength(2);
    expect(poseban).not.toContain("#");
    const telo = poseban.split("&body=")[1];
    expect(decodeURIComponent(telo)).toContain("Čarda & Ribe #1?");
  });
});

describe("Podesavanja", () => {
  const blokovi = Object.fromEntries(PODESAVANJA_REDOSLED.map((kljuc) => [kljuc, <p key={kljuc}>blok-{kljuc}</p>])) as Record<
    (typeof PODESAVANJA_REDOSLED)[number],
    ReactNode
  >;
  const html = renderToStaticMarkup(<Podesavanja blokovi={blokovi} />);

  test("has the seven sections in the agreed order, each with its id and its title", () => {
    expect(PODESAVANJA_REDOSLED).toEqual(["radnoVreme", "jezici", "konobar", "zadrzavanje", "posta", "sabloni", "brend"]);
    const sekcije = tagovi(html, "section");
    expect(sekcije.map((tag) => attr(tag, "id"))).toEqual(PODESAVANJA_REDOSLED.map((kljuc) => `podesavanja-${kljuc}`));
    for (const tag of sekcije) {
      const naslov = element(html, attr(tag, "aria-labelledby")!);
      expect(naslov).not.toBeNull();
    }
    const naslovi = PODESAVANJA_REDOSLED.map((kljuc) => t.blokovi[kljuc]);
    let od = html.indexOf("<section");
    for (const naslov of naslovi) {
      // The summary is a label (span), not a heading: each block brings its own h2 (lead review).
      const na = html.indexOf(`>${naslov}</span>`, od);
      expect(na, naslov).toBeGreaterThan(od);
      od = na;
    }
  });

  test("each block lands in its own section, in order", () => {
    let od = 0;
    for (const kljuc of PODESAVANJA_REDOSLED) {
      const na = html.indexOf(`blok-${kljuc}`, od);
      expect(na, kljuc).toBeGreaterThan(od);
      od = na;
    }
  });

  test("one labelled nav links to every section", () => {
    const navovi = tagovi(html, "nav");
    expect(navovi).toHaveLength(1);
    expect(attr(navovi[0], "aria-label")).toBe(t.sidro);
    const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
    const veze = tagovi(nav, "a").map((tag) => attr(tag, "href"));
    expect(veze).toEqual(PODESAVANJA_REDOSLED.map((kljuc) => `#podesavanja-${kljuc}`));
    expect(tekst(nav)).toBe(PODESAVANJA_REDOSLED.map((kljuc) => t.blokovi[kljuc]).join(" "));
  });

  test("on the phone the blocks are native details, the first one open, with a summary each", () => {
    const details = tagovi(html, "details");
    expect(details).toHaveLength(7);
    expect(details.map((tag) => /\sopen(=|\s|>)/.test(tag))).toEqual([true, false, false, false, false, false, false]);
    expect(html.match(/<summary\b/g)).toHaveLength(7);
    for (const summary of tagovi(html, "summary")) expect(summary).toContain("min-h-[var(--mp-meta)]");
  });

  test("says what the section is for and holds no script-only control", () => {
    expect(tekst(html)).toContain(t.opis);
    expect(html).not.toContain("<button");
  });
});
