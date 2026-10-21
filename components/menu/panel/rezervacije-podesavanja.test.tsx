// K25 render tests of the reservation settings of the client panel: the choice
// in Funkcionalnosti (RezervacijeIzbor) and, in Podešavanja, the working hours
// (RadnoVreme) and the hold (ZadrzavanjeRezervacije), plus the panel izlog
// that mounts them. No DOM in the edge-runtime environment: the blocks are
// checked as renderToStaticMarkup strings, and the checks the form runs before
// it saves (proveriRadnoVreme) as pure functions. Invented data only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import {
  IZLOG_EKSTERNI_LINK,
  fixtureBezRadnogVremena,
  fixtureRadnoVreme,
  fixtureRezervacijeConfig,
} from "@/components/menu/fixtures/rezervacije";
import { PanelIzlog } from "@/components/menu/izlog/panel-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { parsePanelPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import type { ReservationMode } from "@/lib/menu/reservation-config";
import { RESERVATION_CONTACT_MODES, type ReservationContactMode } from "@/lib/menu/reservation-form";
import { RESERVATION_HOLD_MAX, RESERVATION_HOLD_MIN } from "@/lib/menu/reservation-late";
import { MENU_HOURS_MAX_INTERVALS, type WorkingHours } from "@/lib/menu/working-hours";
import { porukaKoda, type SacuvajIshod } from "./cuvanje";
import { RezervacijeIzbor } from "./funkcionalnosti/rezervacije";
import { RadnoVreme, poljaIz, proveriRadnoVreme, type DanPolja } from "./podesavanja/radno-vreme";
import { ZadrzavanjeRezervacije } from "./podesavanja/zadrzavanje";

const t = menuPanelSr.rezervacije;
const rv = menuPanelSr.radnoVreme;
const zd = menuPanelSr.zadrzavanje;

/** A save that always works (nothing in these render tests presses it). */
const SPREMNO = (): Promise<SacuvajIshod> => Promise.resolve({ ok: true });
const HREF_RADNO_VREME = "/demo-restoran/client-panel/meni/podesavanja";

// What React puts into markup for text, and back for attribute values.
const esc = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

const unesc = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");

const count = (html: string, needle: string) => html.split(needle).length - 1;

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The visible text of some markup. */
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

type Radio = { vrednost: string | undefined; izabran: boolean; onemogucen: boolean; opisan: string | undefined };

function radiji(html: string): Radio[] {
  return [...html.matchAll(/<input\b[^>]*type="radio"[^>]*>/g)].map((match) => ({
    vrednost: attr(match[0], "value"),
    izabran: /\schecked=""/.test(match[0]),
    onemogucen: /\sdisabled=""/.test(match[0]),
    opisan: attr(match[0], "aria-describedby"),
  }));
}

const legende = (html: string) => [...html.matchAll(/<legend\b[^>]*>([\s\S]*?)<\/legend>/g)].map((match) => unesc(match[1]));

function unosi(html: string): string[] {
  return [...html.matchAll(/<input\b[^>]*>/g)].map((match) => match[0]);
}

function tipoviUnosa(html: string): string[] {
  return unosi(html).map((tag) => attr(tag, "type") ?? "text");
}

/** The save button (the one submit button) of a block. */
function dugmeSnimanja(html: string): string {
  const match = /<button\b[^>]*type="submit"[^>]*>/.exec(html);
  if (!match) throw new Error(`no submit button in: ${html}`);
  return match[0];
}

const onemogucen = (tag: string) => /\sdisabled=""/.test(tag);

function izbor(opcije: {
  mode?: ReservationMode;
  contact?: ReservationContactMode;
  bezRadnogVremena?: boolean;
  disabled?: boolean;
  razlog?: string;
}): string {
  const bezRadnogVremena = opcije.bezRadnogVremena ?? false;
  return renderToStaticMarkup(
    <RezervacijeIzbor
      config={fixtureRezervacijeConfig({ mode: opcije.mode, contact: opcije.contact, bezRadnogVremena })}
      bezRadnogVremena={bezRadnogVremena}
      radnoVremeHref={HREF_RADNO_VREME}
      onSacuvaj={SPREMNO}
      disabled={opcije.disabled}
      razlog={opcije.razlog}
    />,
  );
}

describe("RezervacijeIzbor: the three ways", () => {
  const REZIMI = ["off", "form", "external"] as const;

  test("a radio group of the three ways in order, with the chosen one checked", () => {
    for (const mode of REZIMI) {
      const html = izbor({ mode });
      const grupa = radiji(html).slice(0, 3);
      expect(grupa.map((radio) => radio.vrednost)).toEqual(["off", "form", "external"]);
      expect(grupa.filter((radio) => radio.izabran).map((radio) => radio.vrednost)).toEqual([mode]);
      expect(grupa.every((radio) => !radio.onemogucen)).toBe(true);
      expect(legende(html)[0]).toBe(esc(t.izbor));
      for (const rezim of REZIMI) expect(html).toContain(`>${esc(t.rezimi[rezim])}</span>`);
    }
  });

  test("the card is titled Rezervacije and says in one line what the chosen way does", () => {
    for (const mode of REZIMI) {
      const html = izbor({ mode });
      expect(html).toContain(">" + esc(t.naslov) + "</h2>");
      expect(count(html, `>${esc(t.rezimiOpis[mode])}</p>`)).toBe(1);
      for (const drugi of REZIMI.filter((rezim) => rezim !== mode)) expect(html).not.toContain(esc(t.rezimiOpis[drugi]));
    }
  });

  test("the group is described by that line", () => {
    const html = izbor({ mode: "form" });
    const fieldset = /<fieldset\b[^>]*>/.exec(html)?.[0] ?? "";
    const opisId = attr(fieldset, "aria-describedby");
    expect(opisId).toBeTruthy();
    expect(html).toContain(`<p id="${opisId}"`);
  });

  test("the change is immediate and does not wait for the menu's publication", () => {
    for (const mode of REZIMI) expect(izbor({ mode })).toContain(`>${esc(t.vaziOdmah)}</p>`);
  });

  test("one save button, enabled, with a polite live region for saving, saved and errors", () => {
    const html = izbor({ mode: "form" });
    expect(count(html, 'type="submit"')).toBe(1);
    expect(onemogucen(dugmeSnimanja(html))).toBe(false);
    expect(html).toContain(`>${esc(t.sacuvaj)}</button>`);
    expect(html).toMatch(/role="status" aria-live="polite"/);
  });

  test("the working hours stay in Podešavanja: the note is there for the form and the venue's system, not for off", () => {
    expect(izbor({ mode: "form" })).toContain(esc(t.radnoVremeNapomena));
    expect(izbor({ mode: "external" })).toContain(esc(t.radnoVremeNapomena));
    expect(izbor({ mode: "off" })).not.toContain(esc(t.radnoVremeNapomena));
  });

  test("a venue already on the form that is shown the form does not read the 'leaving the form' note", () => {
    expect(izbor({ mode: "form" })).not.toContain(esc(t.postojece));
    expect(izbor({ mode: "off" })).not.toContain(esc(t.postojece));
  });
});

describe("RezervacijeIzbor: ScanMe forma", () => {
  test("asks which contact the guest leaves: e-mail, phone or both, with the venue's choice checked", () => {
    for (const contact of RESERVATION_CONTACT_MODES) {
      const html = izbor({ mode: "form", contact });
      const radnje = radiji(html);
      expect(radnje).toHaveLength(6);
      const kontakti = radnje.slice(3);
      expect(kontakti.map((radio) => radio.vrednost)).toEqual(["email", "phone", "both"]);
      expect(kontakti.filter((radio) => radio.izabran).map((radio) => radio.vrednost)).toEqual([contact]);
      expect(legende(html)).toEqual([esc(t.izbor), esc(t.kontakt)]);
      for (const vrsta of RESERVATION_CONTACT_MODES) expect(html).toContain(`>${esc(t.kontakti[vrsta])}</span>`);
    }
  });

  test("says what the guest fills in, with the chosen contact and nothing else", () => {
    for (const contact of RESERVATION_CONTACT_MODES) {
      const html = izbor({ mode: "form", contact });
      const recenica = esc(fmt(t.gostPopunjava, { kontakt: t.gostPopunjavaKontakt[contact] }));
      expect(count(html, `>${recenica}</p>`)).toBe(1);
      for (const drugi of RESERVATION_CONTACT_MODES.filter((vrsta) => vrsta !== contact)) {
        expect(html).not.toContain(esc(fmt(t.gostPopunjava, { kontakt: t.gostPopunjavaKontakt[drugi] })));
      }
    }
  });

  test("has no link field (that belongs to the venue's own system)", () => {
    const html = izbor({ mode: "form" });
    expect(tipoviUnosa(html).every((tip) => tip === "radio")).toBe(true);
    expect(html).not.toContain(esc(t.link));
    expect(html).not.toContain(IZLOG_EKSTERNI_LINK);
  });
});

describe("RezervacijeIzbor: Vaš sistem", () => {
  const html = izbor({ mode: "external", contact: "both" });

  test("shows only the link field, with its hint, filled with the saved address", () => {
    const polja = unosi(html).filter((tag) => attr(tag, "type") === "url");
    expect(polja).toHaveLength(1);
    expect(attr(polja[0], "value")).toBe(IZLOG_EKSTERNI_LINK);
    expect(attr(polja[0], "placeholder")).toBe(t.linkPrimer);
    expect(html).toContain(`>${esc(t.link)}</label>`);
    expect(html).toContain(`>${esc(t.linkOpis)}</p>`);
    expect(attr(polja[0], "aria-describedby")).toBeTruthy();
    expect(attr(polja[0], "aria-invalid")).toBeUndefined();
  });

  test("never shows the form's contact choice or the sentence about what the guest fills in", () => {
    expect(radiji(html)).toHaveLength(3);
    expect(legende(html)).toEqual([esc(t.izbor)]);
    expect(html).not.toContain(esc(t.kontakt));
    for (const contact of RESERVATION_CONTACT_MODES) {
      expect(html).not.toContain(esc(fmt(t.gostPopunjava, { kontakt: t.gostPopunjavaKontakt[contact] })));
    }
    for (const vrsta of RESERVATION_CONTACT_MODES) expect(html).not.toContain(`>${esc(t.kontakti[vrsta])}</span>`);
  });

  test("an address that is not https is refused before anything is sent, with the domain's sentence", () => {
    // The sentence the field shows is the domain's text of reservation/url_invalid.
    expect(porukaKoda("reservation/url_invalid", t.greska)).toBe(menuDomenSr.errors["reservation/url_invalid"]);
    expect(menuDomenSr.errors["reservation/url_invalid"]).toContain("https://");
  });
});

describe("RezervacijeIzbor: without working hours", () => {
  test("the ScanMe form is locked, with the reason named by the option, and a link to enter the hours", () => {
    const html = izbor({ mode: "off", bezRadnogVremena: true });
    const grupa = radiji(html).slice(0, 3);
    const forma = grupa.find((radio) => radio.vrednost === "form");
    expect(forma?.onemogucen).toBe(true);
    expect(grupa.filter((radio) => radio.onemogucen).map((radio) => radio.vrednost)).toEqual(["form"]);
    expect(forma?.opisan).toBeTruthy();

    const pocetak = html.indexOf(`id="${forma?.opisan}"`);
    expect(pocetak).toBeGreaterThan(0);
    const razlog = html.slice(pocetak, html.indexOf("</div>", pocetak));
    expect(tekst(razlog)).toContain(t.bezRadnogVremena);
    const veza = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/.exec(razlog);
    expect(veza?.[1]).toBe(HREF_RADNO_VREME);
    expect(tekst(veza?.[2] ?? "")).toBe(t.unesiRadnoVreme);
  });

  test("the other two ways still save", () => {
    for (const mode of ["off", "external"] as const) {
      const html = izbor({ mode, bezRadnogVremena: true });
      expect(onemogucen(dugmeSnimanja(html))).toBe(false);
    }
  });

  test("with hours, no lock and no link", () => {
    const html = izbor({ mode: "off", bezRadnogVremena: false });
    expect(radiji(html).some((radio) => radio.onemogucen)).toBe(false);
    expect(html).not.toContain(esc(t.bezRadnogVremena));
    expect(html).not.toContain(esc(t.unesiRadnoVreme));
  });

  test("a venue that is on the form but lost its hours cannot save until it enters them", () => {
    const html = izbor({ mode: "form", bezRadnogVremena: true });
    const forma = radiji(html)[1];
    expect(forma).toMatchObject({ vrednost: "form", izabran: true, onemogucen: true });
    const dugme = dugmeSnimanja(html);
    expect(onemogucen(dugme)).toBe(true);
    expect(attr(dugme, "aria-describedby")).toBe(forma.opisan);
    expect(html).toContain(esc(t.bezRadnogVremena));
  });
});

describe("RezervacijeIzbor: a role that cannot edit", () => {
  const razlog = menuDomenSr.errors["menu/forbidden"];
  const html = izbor({ mode: "form", disabled: true, razlog });

  test("every control is off and the reason is on the screen, named by the save button", () => {
    // Both radio groups (the way, the contact) are disabled fieldsets: that disables every radio in them.
    expect(count(html, "<fieldset disabled")).toBe(2);
    expect(onemogucen(dugmeSnimanja(html))).toBe(true);
    expect(html).toContain(`<span class="min-w-0">${esc(razlog)}</span>`);
    const dugme = dugmeSnimanja(html);
    expect(html).toContain(`id="${attr(dugme, "aria-describedby")}"`);
  });

  test("the link field of the venue's own system is off too", () => {
    const vanjski = izbor({ mode: "external", disabled: true, razlog });
    const polje = unosi(vanjski).find((tag) => attr(tag, "type") === "url");
    expect(polje && onemogucen(polje)).toBe(true);
  });

  test("without the flag, no reason is written", () => {
    expect(izbor({ mode: "form", razlog })).not.toContain(esc(razlog));
  });
});

describe("the reservation settings of Funkcionalnosti and Podešavanja set no other thing", () => {
  const SVE = [
    ...(["off", "form", "external"] as const).flatMap((mode) =>
      RESERVATION_CONTACT_MODES.map((contact) => izbor({ mode, contact })),
    ),
    izbor({ mode: "off", bezRadnogVremena: true }),
  ];

  test("RezervacijeIzbor has no duration, deadline, table or sound field: only radios and the link", () => {
    for (const html of SVE) {
      for (const tip of tipoviUnosa(html)) expect(["radio", "url"]).toContain(tip);
      expect(html).not.toMatch(/<(select|textarea)\b/);
      expect(html).not.toContain('role="switch"');
      expect(tekst(html)).not.toMatch(/trajanj|zvuk|\brok\b/i);
    }
  });

  test("RadnoVreme and Zadržavanje hold nothing but clock fields, switches and one number", () => {
    const radno = renderToStaticMarkup(<RadnoVreme radnoVreme={fixtureRadnoVreme()} onSacuvaj={SPREMNO} />);
    const zadrzavanje = renderToStaticMarkup(<ZadrzavanjeRezervacije minuta={15} onSacuvaj={SPREMNO} />);
    for (const tip of tipoviUnosa(radno)) expect(["time", "checkbox"]).toContain(tip);
    expect(tipoviUnosa(zadrzavanje)).toEqual(["number"]);
    for (const html of [radno, zadrzavanje]) expect(html).not.toMatch(/<(select|textarea)\b/);
  });
});

describe("RadnoVreme", () => {
  const radno = (radnoVreme: WorkingHours | null, ostalo: { disabled?: boolean; razlog?: string } = {}) =>
    renderToStaticMarkup(<RadnoVreme radnoVreme={radnoVreme} onSacuvaj={SPREMNO} {...ostalo} />);

  const dani = (html: string) =>
    [...html.matchAll(/<fieldset\b[^>]*data-dan="(\d)"[^>]*>([\s\S]*?)<\/fieldset>/g)].map((match) => ({
      indeks: Number(match[1]),
      html: match[2],
    }));

  test("seven fieldsets, Monday first, each named by its day", () => {
    const html = radno(fixtureRadnoVreme());
    const sedmica = dani(html);
    expect(sedmica).toHaveLength(7);
    expect(sedmica.map((dan) => dan.indeks)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(sedmica.map((dan) => legende(dan.html)[0])).toEqual(menuDomenSr.weekdays.map(esc));
    expect(menuDomenSr.weekdays[0]).toBe("Ponedeljak");
    expect(count(html, "<fieldset")).toBe(7);
  });

  test("every day has an open/closed switch, on for the days with hours", () => {
    const sedmica = dani(radno(fixtureRadnoVreme()));
    for (const dan of sedmica) {
      expect(count(dan.html, 'role="switch"')).toBe(1);
      expect(dan.html).toContain(`>${esc(rv.otvoreno)}</span>`);
      expect(/role="switch"[^>]*\schecked=""|\schecked=""[^>]*role="switch"/.test(dan.html)).toBe(true);
    }
  });

  test("clock fields are time inputs in five-minute steps, named by the day, the interval and od/do", () => {
    const sedmica = dani(radno(fixtureRadnoVreme()));
    const ponedeljak = unosi(sedmica[0].html).filter((tag) => attr(tag, "type") === "time");
    expect(ponedeljak).toHaveLength(2);
    expect(ponedeljak.map((tag) => attr(tag, "step"))).toEqual(["300", "300"]);
    expect(ponedeljak.map((tag) => attr(tag, "value"))).toEqual(["12:00", "23:00"]);
    expect(ponedeljak.map((tag) => attr(tag, "aria-label"))).toEqual([
      `${fmt(rv.intervalCitac, { dan: "Ponedeljak", broj: 1 })}, ${rv.od}`,
      `${fmt(rv.intervalCitac, { dan: "Ponedeljak", broj: 1 })}, ${rv.do}`,
    ]);
    // Sunday has two intervals, the second named as interval 2.
    const nedelja = unosi(sedmica[6].html).filter((tag) => attr(tag, "type") === "time");
    expect(nedelja.map((tag) => attr(tag, "value"))).toEqual(["12:00", "16:00", "18:00", "22:00"]);
    expect(attr(nedelja[2], "aria-label")).toContain(fmt(rv.intervalCitac, { dan: "Nedelja", broj: 2 }));
  });

  test("an interval that ends at or before its start says it runs past midnight", () => {
    const sedmica = dani(radno(fixtureRadnoVreme()));
    // Friday and Saturday 12:00–01:00.
    for (const indeks of [4, 5]) {
      expect(sedmica[indeks].html).toContain("data-posle-ponoci");
      expect(tekst(sedmica[indeks].html)).toContain(fmt(rv.poslePonoci, { vreme: "01:00" }));
    }
    for (const indeks of [0, 1, 2, 3, 6]) expect(sedmica[indeks].html).not.toContain("data-posle-ponoci");
  });

  test("midnight itself ends the day after: 18:00–00:00 is past midnight, 18:00–18:00 is not an interval", () => {
    const ponoc = radno({ days: [[{ start: 18 * 60, end: 24 * 60 }], [], [], [], [], [], []] });
    expect(ponoc).toContain(esc(fmt(rv.poslePonoci, { vreme: "00:00" })));
    const neispravno = renderToStaticMarkup(
      <RadnoVreme
        radnoVreme={{ days: [[{ start: 18 * 60, end: 20 * 60 }], [], [], [], [], [], []] }}
        onSacuvaj={SPREMNO}
      />,
    );
    expect(neispravno).not.toContain("data-posle-ponoci");
  });

  test("a closed day shows 'Zatvoreno' instead of clock fields, and its switch is off", () => {
    const sedmica = dani(radno({ days: [[{ start: 9 * 60, end: 17 * 60 }], [], [], [], [], [], []] }));
    expect(sedmica[0].html).toContain("type=\"time\"");
    for (const dan of sedmica.slice(1)) {
      expect(dan.html).not.toContain('type="time"');
      expect(tekst(dan.html)).toContain(rv.zatvoreno);
      expect(dan.html).not.toMatch(/\schecked=""/);
    }
    expect(sedmica[0].html).not.toContain(`>${esc(rv.zatvoreno)}</p>`);
  });

  test("at most three intervals a day: the add button is off at three, with the reason", () => {
    const tri = Array.from({ length: MENU_HOURS_MAX_INTERVALS }, (_, i) => ({ start: 8 * 60 + i * 300, end: 8 * 60 + i * 300 + 120 }));
    expect(tri).toHaveLength(3);
    const sedmica = dani(radno({ days: [tri, [{ start: 9 * 60, end: 17 * 60 }], [], [], [], [], []] }));
    const dugmeDodaj = (html: string) => {
      const match = new RegExp(`<button\\b[^>]*>(?:(?!</button>)[\\s\\S])*?${esc(rv.dodaj)}[\\s\\S]*?</button>`).exec(html);
      if (!match) throw new Error("no add button");
      return match[0];
    };
    const naTri = dugmeDodaj(sedmica[0].html);
    expect(onemogucen(naTri)).toBe(true);
    const razlogId = attr(naTri, "aria-describedby");
    expect(razlogId).toBeTruthy();
    expect(sedmica[0].html).toContain(`<p id="${razlogId}"`);
    expect(tekst(sedmica[0].html)).toContain(rv.greske.previse);

    const naJedan = dugmeDodaj(sedmica[1].html);
    expect(onemogucen(naJedan)).toBe(false);
    expect(attr(naJedan, "aria-describedby")).toBeUndefined();
    expect(tekst(sedmica[1].html)).not.toContain(rv.greske.previse);
    // Closed days have no add button at all.
    expect(sedmica[2].html).not.toContain(esc(rv.dodaj));
  });

  test("an interval can be removed only when the day keeps another one", () => {
    const sedmica = dani(radno(fixtureRadnoVreme()));
    expect(count(sedmica[0].html, `>${esc(rv.ukloni)}</button>`)).toBe(0);
    expect(count(sedmica[6].html, `>${esc(rv.ukloni)}</button>`)).toBe(2);
    expect(sedmica[6].html).toContain(
      `aria-label="${esc(fmt(rv.ukloniCitac, { od: "12:00", do: "16:00", dan: "Nedelja" }))}"`,
    );
  });

  test("copy Monday to Tuesday–Friday is offered once, next to the title", () => {
    const html = radno(fixtureRadnoVreme());
    expect(count(html, `>${esc(rv.kopiraj)}</button>`)).toBe(1);
    expect(html.indexOf(esc(rv.kopiraj))).toBeLessThan(html.indexOf('data-dan="0"'));
  });

  test("the empty state: the venue has no hours yet", () => {
    for (const prazno of [null, fixtureBezRadnogVremena()]) {
      const html = radno(prazno);
      expect(html).toContain(esc(rv.prazno));
      expect(dani(html)).toHaveLength(7);
      expect(html).not.toContain('type="time"');
      expect(count(html, 'role="switch"')).toBe(7);
      expect(html).not.toMatch(/role="switch"[^>]*\schecked=""/);
    }
    expect(radno(fixtureRadnoVreme())).not.toContain(esc(rv.prazno));
  });

  test("one save button with the live status, and a title, a sentence and a section heading", () => {
    const html = radno(fixtureRadnoVreme());
    expect(count(html, 'type="submit"')).toBe(1);
    expect(html).toContain(`>${esc(rv.sacuvaj)}</button>`);
    expect(html).toMatch(/role="status" aria-live="polite"/);
    expect(html).toContain(">" + esc(rv.naslov) + "</h2>");
    expect(html).toContain(esc(rv.opis));
  });

  test("a role that cannot edit settings: the days, the buttons and the save are off, with the reason", () => {
    const razlog = menuDomenSr.errors["menu/forbidden"];
    const html = radno(fixtureRadnoVreme(), { disabled: true, razlog });
    expect(count(html, "<fieldset disabled")).toBe(7);
    expect(onemogucen(dugmeSnimanja(html))).toBe(true);
    expect(html).toContain(esc(razlog));
    const kopiraj = [...html.matchAll(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g)].find((match) =>
      match[0].includes(esc(rv.kopiraj)),
    );
    expect(kopiraj && onemogucen(kopiraj[0])).toBe(true);
  });
});

describe("proveriRadnoVreme: the checks before saving", () => {
  const dan = (...intervali: Array<[string, string]>): DanPolja => ({
    otvoreno: intervali.length > 0,
    intervali: intervali.map(([pocetak, kraj]) => ({ pocetak, kraj })),
  });
  const nedelja = (izmene: Record<number, DanPolja>): DanPolja[] =>
    Array.from({ length: 7 }, (_, indeks) => izmene[indeks] ?? dan());

  test("the fields of a saved week give the same week back", () => {
    const sacuvano = fixtureRadnoVreme();
    const provera = proveriRadnoVreme(poljaIz(sacuvano));
    expect(provera).toEqual({ ok: true, radnoVreme: sacuvano });
  });

  test("a week with no hours is a valid, closed week", () => {
    expect(proveriRadnoVreme(poljaIz(null))).toEqual({ ok: true, radnoVreme: { days: [[], [], [], [], [], [], []] } });
  });

  test("an end at or before the start means past midnight", () => {
    const provera = proveriRadnoVreme(nedelja({ 4: dan(["18:00", "02:00"]) }));
    expect(provera.ok && provera.radnoVreme.days[4]).toEqual([{ start: 18 * 60, end: 26 * 60 }]);
  });

  test("a cleared or impossible clock field is 'neispravno' for that interval only", () => {
    const provera = proveriRadnoVreme(nedelja({ 2: dan(["09:00", "12:00"], ["", "17:00"]), 3: dan(["09:03", "12:00"]) }));
    expect(provera.ok).toBe(false);
    if (provera.ok) return;
    expect(provera.greske[2]).toEqual({ neispravni: [1], dan: null });
    expect(provera.greske[3]).toEqual({ neispravni: [0], dan: null });
    expect(provera.greske[0]).toEqual({ neispravni: [], dan: null });
  });

  test("overlapping intervals of a day are 'preklapanje'", () => {
    const provera = proveriRadnoVreme(nedelja({ 1: dan(["09:00", "12:00"], ["11:00", "15:00"]) }));
    expect(provera.ok).toBe(false);
    if (!provera.ok) expect(provera.greske[1].dan).toBe("preklapanje");
  });

  test("intervals typed out of order are put in order, not refused", () => {
    const provera = proveriRadnoVreme(nedelja({ 1: dan(["18:00", "22:00"], ["09:00", "12:00"]) }));
    expect(provera.ok && provera.radnoVreme.days[1]).toEqual([
      { start: 9 * 60, end: 12 * 60 },
      { start: 18 * 60, end: 22 * 60 },
    ]);
  });

  test("an interval past midnight must end before the next day opens", () => {
    const provera = proveriRadnoVreme(nedelja({ 0: dan(["18:00", "02:00"]), 1: dan(["01:00", "05:00"]) }));
    expect(provera.ok).toBe(false);
    if (!provera.ok) expect(provera.greske[0].dan).toBe("preklapanje");
    const uredno = proveriRadnoVreme(nedelja({ 0: dan(["18:00", "02:00"]), 1: dan(["02:00", "05:00"]) }));
    expect(uredno.ok).toBe(true);
    // Sunday spills into Monday.
    const krug = proveriRadnoVreme(nedelja({ 6: dan(["18:00", "03:00"]), 0: dan(["02:00", "05:00"]) }));
    expect(krug.ok).toBe(false);
    if (!krug.ok) expect(krug.greske[6].dan).toBe("preklapanje");
  });

  test("more than three intervals are 'previse'", () => {
    const provera = proveriRadnoVreme(
      nedelja({ 5: dan(["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"]) }),
    );
    expect(provera.ok).toBe(false);
    if (!provera.ok) expect(provera.greske[5].dan).toBe("previse");
  });

  test("a closed day sends nothing, whatever its fields still hold", () => {
    const zatvoren: DanPolja = { otvoreno: false, intervali: [{ pocetak: "", kraj: "xx" }] };
    const provera = proveriRadnoVreme(nedelja({ 3: zatvoren }));
    expect(provera.ok && provera.radnoVreme.days[3]).toEqual([]);
  });
});

describe("ZadrzavanjeRezervacije", () => {
  const html = renderToStaticMarkup(<ZadrzavanjeRezervacije minuta={15} onSacuvaj={SPREMNO} />);

  test("one number field from 5 to 180 minutes in steps of 5, with the saved value, the unit and the range", () => {
    const polja = unosi(html);
    expect(polja).toHaveLength(1);
    expect(attr(polja[0], "type")).toBe("number");
    expect(attr(polja[0], "min")).toBe(String(RESERVATION_HOLD_MIN));
    expect(attr(polja[0], "max")).toBe(String(RESERVATION_HOLD_MAX));
    expect([RESERVATION_HOLD_MIN, RESERVATION_HOLD_MAX]).toEqual([5, 180]);
    expect(attr(polja[0], "step")).toBe("5");
    expect(attr(polja[0], "value")).toBe("15");
    expect(html).toContain(`>${esc(zd.oznaka)}</label>`);
    expect(html).toContain(`>${esc(zd.jedinica)}</span>`);
    expect(html).toContain(`>${esc(zd.opseg)}</p>`);
    expect(attr(polja[0], "aria-describedby")).toBeTruthy();
  });

  test("says what the hold does and that nothing is cancelled on its own", () => {
    expect(html).toContain(esc(zd.opis));
    expect(html).toContain(">" + esc(zd.naslov) + "</h2>");
  });

  test("one enabled save button with the live status", () => {
    expect(count(html, 'type="submit"')).toBe(1);
    expect(onemogucen(dugmeSnimanja(html))).toBe(false);
    expect(html).toContain(`>${esc(zd.sacuvaj)}</button>`);
    expect(html).toMatch(/role="status" aria-live="polite"/);
  });

  test("the value of the venue is what the field starts from", () => {
    for (const minuta of [5, 45, 180]) {
      const unos = unosi(renderToStaticMarkup(<ZadrzavanjeRezervacije minuta={minuta} onSacuvaj={SPREMNO} />))[0];
      expect(attr(unos, "value")).toBe(String(minuta));
    }
  });

  test("a role that cannot edit settings: the field and the save are off, with the reason", () => {
    const razlog = menuDomenSr.errors["menu/forbidden"];
    const iskljuceno = renderToStaticMarkup(<ZadrzavanjeRezervacije minuta={15} onSacuvaj={SPREMNO} disabled razlog={razlog} />);
    expect(onemogucen(unosi(iskljuceno)[0])).toBe(true);
    expect(onemogucen(dugmeSnimanja(iskljuceno))).toBe(true);
    expect(iskljuceno).toContain(esc(razlog));
  });
});

describe("porukaKoda", () => {
  test("a known code is the domain's sentence, an unknown one gets the block's own", () => {
    expect(porukaKoda("reservation/hours_missing", "x")).toBe(menuDomenSr.errors["reservation/hours_missing"]);
    expect(porukaKoda("reservation/hours_invalid", "x")).toBe(menuDomenSr.errors["reservation/hours_invalid"]);
    expect(porukaKoda("mreza", t.greska)).toBe(t.greska);
  });
});

describe("the panel izlog mounts the blocks", () => {
  function panel(query: IzlogSearchParams): string {
    const parsed = parsePanelPreview(query);
    if (parsed.sekcija === "primitivi") throw new Error("not a panel section");
    return renderToStaticMarkup(<PanelIzlog params={{ ...parsed, sekcija: parsed.sekcija }} />);
  }

  test("Funkcionalnosti shows the reservation choice, the ScanMe form by default", () => {
    const html = panel({ sekcija: "funkcionalnosti" });
    expect(html).toContain("data-rezervacije-izlog");
    const grupa = radiji(html).slice(0, 3);
    expect(grupa.filter((radio) => radio.izabran).map((radio) => radio.vrednost)).toEqual(["form"]);
    expect(html).toContain(esc(fmt(t.gostPopunjava, { kontakt: t.gostPopunjavaKontakt.both })));
  });

  test("rezervacije= picks the way: eksterni shows the link only, iskljuceno shows neither", () => {
    const eksterni = panel({ sekcija: "funkcionalnosti", rezervacije: "eksterni" });
    expect(radiji(eksterni)).toHaveLength(3);
    expect(radiji(eksterni)[2].izabran).toBe(true);
    expect(eksterni).toContain(esc(IZLOG_EKSTERNI_LINK));
    expect(eksterni).not.toContain(esc(t.kontakt));

    const iskljuceno = panel({ sekcija: "funkcionalnosti", rezervacije: "iskljuceno" });
    expect(radiji(iskljuceno)).toHaveLength(3);
    expect(radiji(iskljuceno)[0].izabran).toBe(true);
    // K27 (intentional): Funkcionalnosti now also has the feature switches; only the reservation block is checked.
    const blok = iskljuceno.slice(iskljuceno.indexOf("data-rezervacije-izlog"), iskljuceno.indexOf('data-funkcija="occupancy"'));
    expect(blok.length).toBeGreaterThan(0);
    expect(tipoviUnosa(blok).filter((tip) => tip !== "radio")).toEqual([]);
    expect(iskljuceno).not.toContain(esc(t.kontakt));
  });

  test("radno-vreme=prazno locks the form option and links to the izlog's Podešavanja, with the theme", () => {
    const html = panel({ sekcija: "funkcionalnosti", "radno-vreme": "prazno", rezervacije: "forma", tema: "tamna" });
    const grupa = radiji(html).slice(0, 3);
    expect(grupa.find((radio) => radio.vrednost === "form")?.onemogucen).toBe(true);
    const veza = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].find(
      (match) => tekst(match[2]) === t.unesiRadnoVreme,
    );
    expect(unesc(veza?.[1] ?? "")).toBe(
      "/dev/menu-panel-preview?sekcija=podesavanja&uloga=vlasnik&plan=standard&radno-vreme=prazno&tema=tamna",
    );
    // Without hours and without an explicit way, the venue starts with reservations off.
    const bezIzbora = panel({ sekcija: "funkcionalnosti", "radno-vreme": "prazno" });
    expect(radiji(bezIzbora)[0].izabran).toBe(true);
    expect(radiji(bezIzbora)[1].onemogucen).toBe(true);
  });

  test("Podešavanja shows the working hours and the hold, from the fixtures or empty", () => {
    const html = panel({ sekcija: "podesavanja" });
    expect(html).toContain("data-podesavanja-rezervacija-izlog");
    expect(count(html, "<fieldset disabled")).toBe(0);
    expect(count(html, 'data-dan="')).toBe(7);
    expect(count(html, 'type="time"')).toBe(14 + 2);
    expect(html).toContain(esc(rv.naslov));
    expect(html).toContain(esc(zd.naslov));
    expect(html).not.toContain(esc(rv.prazno));

    const prazno = panel({ sekcija: "podesavanja", "radno-vreme": "prazno" });
    expect(prazno).toContain(esc(rv.prazno));
    expect(prazno).not.toContain('type="time"');
    expect(prazno).toContain(esc(zd.naslov));
  });

  test("the blocks stand between the section's title and its 'u pripremi' card", () => {
    // K27 (intentional): Funkcionalnosti is a finished section now (no 'u pripremi' card); Podešavanja keeps it until K28.
    for (const [sekcija, oznaka] of [["podesavanja", "data-radno-vreme"]] as const) {
      const html = panel({ sekcija });
      expect(html.indexOf("<h1")).toBeGreaterThan(0);
      expect(html.indexOf("<h1")).toBeLessThan(html.indexOf(oznaka));
      expect(html.indexOf(oznaka)).toBeLessThan(html.indexOf("data-sekcija-u-pripremi"));
      expect(count(html, "<h1")).toBe(1);
      for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
    }
    // Funkcionalnosti: the title, the guest's switches, then the reservation block; one h1, decorative icons.
    const html = panel({ sekcija: "funkcionalnosti" });
    expect(count(html, "<h1")).toBe(1);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf('data-funkcija="callWaiter"'));
    expect(html.indexOf('data-funkcija="callWaiter"')).toBeLessThan(html.indexOf("data-rezervacije-izbor"));
    expect(html).not.toContain("data-sekcija-u-pripremi");
    for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
  });

  test("an editor does not see either section: the forbidden state, no blocks", () => {
    for (const sekcija of ["funkcionalnosti", "podesavanja"]) {
      const html = panel({ uloga: "urednik", sekcija });
      expect(html).toContain("data-sekcija-zabranjena");
      expect(html).not.toContain("data-rezervacije-izbor");
      expect(html).not.toContain("data-radno-vreme");
      expect(html).not.toContain("data-zadrzavanje");
    }
  });

  test("other sections do not show them", () => {
    for (const sekcija of ["pocetna", "operativa", "tim", "analitika"]) {
      const html = panel({ sekcija });
      expect(html).not.toContain("data-rezervacije-izbor");
      expect(html).not.toContain("data-radno-vreme");
    }
  });
});
