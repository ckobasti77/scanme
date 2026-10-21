// K27 render tests of the client-panel section Funkcionalnosti and of the card
// "Podaci o lokalu za Menu" in Lokal i QR. No DOM in the edge-runtime
// environment: the screens are checked as renderToStaticMarkup strings (the
// pattern of rezervacije-podesavanja.test.tsx). The save cycle itself (the
// wish stays, the error brings the switch back) needs a browser and is not
// exercised here. Invented data only.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { IZLOG_EKSTERNI_LINK } from "@/components/menu/fixtures/rezervacije";
import { FunkcionalnostiIzlog } from "@/components/menu/izlog/funkcionalnosti-izlog";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { LokalIshod, LokalPodaci, LokalPozicija, LokalRadnje } from "@/lib/menu/lokal/model";
import type { MenuMode } from "@/lib/menu/modes";
import { LokalEkran, sazetakLokala } from "../../lokal/lokal-ekran";
import type { SacuvajIshod } from "../cuvanje";
import { PodaciLokala } from "../lokal/podaci-lokala";
import { Funkcionalnosti, type FunkcijaKljuc } from "./funkcionalnosti";

const t = menuPanelSr.funkcionalnosti;
const rez = menuPanelSr.rezervacije;
const lp = menuPanelSr.lokalPodaci;

const KLJUCEVI: readonly FunkcijaKljuc[] = ["callWaiter", "billRequest", "ordering", "occupancy", "roomService"];
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

/** The visible text of some markup. */
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

function attr(tag: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return value === undefined ? undefined : unesc(value);
}

const regexSigurno = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Prekidac = { tag: string; ukljucen: boolean; onemogucen: boolean; opisan: string[] };

function prekidaci(html: string): Prekidac[] {
  return [...html.matchAll(/<input\b[^>]*role="switch"[^>]*>/g)].map((match) => ({
    tag: match[0],
    ukljucen: /\schecked=""/.test(match[0]),
    onemogucen: /\sdisabled=""/.test(match[0]),
    opisan: (attr(match[0], "aria-describedby") ?? "").split(" ").filter(Boolean),
  }));
}

/** The card of one feature, from its marker to the next card's marker (or the end of the markup). */
function kartica(html: string, kljuc: FunkcijaKljuc): string {
  const pocetak = html.indexOf(`data-funkcija="${kljuc}"`);
  if (pocetak === -1) throw new Error(`no card for ${kljuc}`);
  const kraj = html.indexOf('data-funkcija="', pocetak + 1);
  return html.slice(pocetak, kraj === -1 ? undefined : kraj);
}

function prekidac(html: string, kljuc: FunkcijaKljuc): Prekidac {
  const nadjen = prekidaci(kartica(html, kljuc))[0];
  if (!nadjen) throw new Error(`no switch in the card of ${kljuc}`);
  return nadjen;
}

/** The text of the element with this id, as long as it holds no markup of its own. */
function tekstElementa(html: string, id: string): string | undefined {
  const match = new RegExp(`\\sid="${regexSigurno(id)}"[^>]*>([^<]*)<`).exec(html);
  return match ? unesc(match[1]) : undefined;
}

/** The sentences the switch is described by. */
const opisiPrekidaca = (html: string, p: Prekidac) =>
  p.opisan.map((id) => tekstElementa(html, id)).filter((opis): opis is string => opis !== undefined);

const SPREMNO = (): Promise<SacuvajIshod> => Promise.resolve({ ok: true });
const SLOT = <section data-rezervacije-proba="" />;

const STANDARD: Record<FunkcijaKljuc, boolean> = {
  callWaiter: true,
  billRequest: true,
  ordering: false,
  occupancy: false,
  roomService: false,
};

function ekran(
  preko: {
    mode?: MenuMode;
    features?: Partial<Record<FunkcijaKljuc, boolean>>;
    roomServiceDostupan?: boolean;
    moze?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <Funkcionalnosti
      mode={preko.mode ?? "hospitality"}
      features={{ ...STANDARD, ...preko.features }}
      roomServiceDostupan={preko.roomServiceDostupan ?? false}
      moze={preko.moze ?? true}
      onPrebaci={SPREMNO}
      rezervacije={SLOT}
    />,
  );
}

function izlog(preko: Partial<Parameters<typeof FunkcionalnostiIzlog>[0]> = {}): string {
  return renderToStaticMarkup(
    <FunkcionalnostiIzlog
      plan="standard"
      actor="owner"
      rezervacije={null}
      bezRadnogVremena={false}
      radnoVremeHref={HREF_RADNO_VREME}
      {...preko}
    />,
  );
}

describe("Funkcionalnosti: the screen", () => {
  const html = ekran();

  test("one h1 with the section's name and its sentence", () => {
    expect(count(html, "<h1")).toBe(1);
    expect(html).toContain(`>${esc(menuPanelSr.sekcije.funkcionalnosti)}</h1>`);
    expect(tekst(html)).toContain(t.opis);
  });

  test("the calm line that changes are live is there once, right below the title and above every switch", () => {
    expect(count(html, esc(t.vaziOdmah))).toBe(1);
    expect(html.indexOf("</h1>")).toBeLessThan(html.indexOf(esc(t.vaziOdmah)));
    expect(html.indexOf(esc(t.vaziOdmah))).toBeLessThan(html.indexOf('role="switch"'));
  });

  test("three groups with their own headings, the reservations slot between the guest group and the staff group", () => {
    expect(count(html, "<h2")).toBe(3);
    const mesta = [t.grupe.gost, "data-rezervacije-proba", t.grupe.osoblje, t.grupe.posebne].map((trag) =>
      html.indexOf(esc(trag)),
    );
    expect(mesta.every((mesto) => mesto > 0)).toBe(true);
    expect([...mesta].sort((a, b) => a - b)).toEqual(mesta);
    // The slot brings its own heading; the screen adds none around it.
    expect(html).toContain('<section data-rezervacije-proba=""></section>');
  });

  test("every feature is a card with a switch, its name and the one sentence of what the guest sees", () => {
    expect(prekidaci(html)).toHaveLength(5);
    for (const kljuc of KLJUCEVI) {
      const polje = kartica(html, kljuc);
      expect(polje).toContain(`>${esc(t.stavke[kljuc].naziv)}</span>`);
      expect(opisiPrekidaca(polje, prekidac(html, kljuc))).toContain(
        kljuc === "roomService" ? t.premium.zakljucano : t.stavke[kljuc].opis,
      );
    }
  });

  test("the switches show the saved state, and the guest actions are never locked by the plan", () => {
    expect(KLJUCEVI.slice(0, 4).map((kljuc) => prekidac(html, kljuc).ukljucen)).toEqual([true, true, false, false]);
    for (const kljuc of KLJUCEVI.slice(0, 4)) expect(prekidac(html, kljuc).onemogucen).toBe(false);
    const sve = ekran({ features: { callWaiter: false, billRequest: false, ordering: true, occupancy: true } });
    expect(KLJUCEVI.slice(0, 4).map((kljuc) => prekidac(sve, kljuc).ukljucen)).toEqual([false, false, true, true]);
  });

  test("each card has a polite live region for its own save and no save button", () => {
    expect(count(html, 'role="status" aria-live="polite"')).toBe(5);
    expect(html).not.toContain('type="submit"');
  });

  test("the section has no sound setting and never says the word", () => {
    const stanja = [
      ekran(),
      ekran({ features: { ordering: true, occupancy: true, roomService: true }, roomServiceDostupan: true }),
      ekran({ moze: false }),
      izlog(),
      izlog({ plan: "premium" }),
    ];
    for (const stranica of stanja) expect(tekst(stranica)).not.toMatch(/zvuk/i);
    expect(JSON.stringify(t)).not.toMatch(/zvuk/i);
  });

  test("a switch is a real checkbox, and every icon is hidden from assistive technology", () => {
    for (const p of prekidaci(html)) expect(p.tag).toContain('type="checkbox"');
    for (const svg of html.match(/<svg\b[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
  });
});

describe("Funkcionalnosti: Room service and Premium", () => {
  const razlog = (stranica: string, kljuc: FunkcijaKljuc = "roomService") =>
    opisiPrekidaca(stranica, prekidac(stranica, kljuc));

  test("Standard, off: the switch is off and disabled, its reason is its description, and Premium is written with a lock", () => {
    const stranica = ekran({ roomServiceDostupan: false, features: { roomService: false } });
    const p = prekidac(stranica, "roomService");
    expect(p.ukljucen).toBe(false);
    expect(p.onemogucen).toBe(true);
    expect(razlog(stranica)).toEqual([t.premium.zakljucano]);
    const polje = kartica(stranica, "roomService");
    expect(polje).toContain('data-status-ton="neutralno"');
    expect(tekst(polje)).toContain(t.premium.oznaka);
    expect(polje).toContain("lucide-lock");
    expect(polje).not.toContain("lucide-circle-check");
  });

  test("Standard, still on: it can be turned off, with the sentence that it can only be turned off", () => {
    const stranica = ekran({ roomServiceDostupan: false, features: { roomService: true } });
    const p = prekidac(stranica, "roomService");
    expect(p.ukljucen).toBe(true);
    expect(p.onemogucen).toBe(false);
    expect(razlog(stranica)).toEqual([t.premium.samoIskljucivanje]);
    expect(stranica).not.toContain(esc(t.premium.zakljucano));
    expect(kartica(stranica, "roomService")).toContain("lucide-lock");
  });

  test("Premium: the switch works, says what it does and carries the check mark instead of the lock", () => {
    for (const roomService of [false, true]) {
      const stranica = ekran({ roomServiceDostupan: true, features: { roomService } });
      const p = prekidac(stranica, "roomService");
      expect(p.ukljucen).toBe(roomService);
      expect(p.onemogucen).toBe(false);
      expect(razlog(stranica)).toEqual([t.stavke.roomService.opis]);
      const polje = kartica(stranica, "roomService");
      expect(tekst(polje)).toContain(t.premium.oznaka);
      expect(polje).toContain("lucide-circle-check");
      expect(polje).not.toContain("lucide-lock");
      expect(stranica).not.toContain(esc(t.premium.zakljucano));
      expect(stranica).not.toContain(esc(t.premium.samoIskljucivanje));
    }
  });

  test("only Room service is a Premium card", () => {
    const stranica = ekran();
    for (const kljuc of KLJUCEVI.slice(0, 4)) expect(kartica(stranica, kljuc)).not.toContain("data-status-ton");
  });
});

describe("Funkcionalnosti: a role that cannot edit", () => {
  const html = ekran({ moze: false, roomServiceDostupan: true });

  test("every switch is off and the one line says who changes them", () => {
    const sve = prekidaci(html);
    expect(sve).toHaveLength(5);
    expect(sve.every((p) => p.onemogucen)).toBe(true);
    expect(count(html, esc(t.nemaPrava))).toBe(1);
  });

  test("every switch names that line as its reason", () => {
    const linijaId = /<div id="([^"]*)"><p\b/.exec(html)?.[1];
    expect(linijaId).toBeTruthy();
    expect(tekst(/<div id="[^"]*"><p\b[\s\S]*?<\/p><\/div>/.exec(html)?.[0] ?? "")).toBe(t.nemaPrava);
    for (const p of prekidaci(html)) expect(p.opisan).toContain(linijaId);
  });

  test("with the right to edit there is no such line", () => {
    const moze = ekran({ moze: true });
    expect(moze).not.toContain(esc(t.nemaPrava));
    expect(prekidaci(moze).filter((p) => p.onemogucen)).toHaveLength(1);
  });
});

describe("Funkcionalnosti: the mode decides what is shown", () => {
  test("hospitality shows all five switches and the reservations slot", () => {
    const html = ekran({ mode: "hospitality" });
    expect(prekidaci(html)).toHaveLength(5);
    expect(html).toContain("data-rezervacije-proba");
  });

  test("services keeps only reservations: no switch, no empty group heading", () => {
    const html = ekran({ mode: "services" });
    expect(prekidaci(html)).toHaveLength(0);
    expect(html).toContain("data-rezervacije-proba");
    expect(count(html, "<h2")).toBe(0);
    for (const grupa of Object.values(t.grupe)) expect(html).not.toContain(esc(grupa));
  });

  test("retail has nothing to switch: neither the cards nor the slot", () => {
    const html = ekran({ mode: "retail" });
    expect(prekidaci(html)).toHaveLength(0);
    expect(html).not.toContain("data-rezervacije-proba");
    expect(count(html, "<h1")).toBe(1);
  });
});

describe("FunkcionalnostiIzlog", () => {
  test("starts like a small venue: calling a waiter and the bill on, ordering and occupancy off", () => {
    const html = izlog();
    expect(KLJUCEVI.slice(0, 4).map((kljuc) => prekidac(html, kljuc).ukljucen)).toEqual([true, true, false, false]);
    expect(count(html, "<h1")).toBe(1);
  });

  test("Standard: Room service is off and locked with its reason", () => {
    const html = izlog({ plan: "standard" });
    const p = prekidac(html, "roomService");
    expect(p).toMatchObject({ ukljucen: false, onemogucen: true });
    expect(opisiPrekidaca(html, p)).toEqual([t.premium.zakljucano]);
  });

  test("Premium: Room service is on and can be switched", () => {
    const html = izlog({ plan: "premium" });
    expect(prekidac(html, "roomService")).toMatchObject({ ukljucen: true, onemogucen: false });
  });

  test("an Urednik cannot edit features: every switch is off, with the line", () => {
    const html = izlog({ actor: "editor" });
    expect(prekidaci(html).every((p) => p.onemogucen)).toBe(true);
    expect(html).toContain(esc(t.nemaPrava));
    // A Menadžer can: only the locked Room service is off on Standard.
    const menadzer = izlog({ actor: "manager" });
    expect(prekidaci(menadzer).filter((p) => p.onemogucen)).toHaveLength(1);
    expect(menadzer).not.toContain(esc(t.nemaPrava));
  });

  test("the reservation block stands in the section: the ScanMe form asks for a contact", () => {
    const html = izlog({ rezervacije: "forma" });
    expect(html).toContain("data-rezervacije-izlog");
    expect(html).toContain(`>${esc(rez.kontakt)}</legend>`);
    expect(count(html, "<h1")).toBe(1);
  });

  test("the venue's own system shows the link field and no contact choice of the form", () => {
    const html = izlog({ rezervacije: "eksterni" });
    const polje = [...html.matchAll(/<input\b[^>]*type="url"[^>]*>/g)].map((match) => match[0]);
    expect(polje).toHaveLength(1);
    expect(attr(polje[0], "value")).toBe(IZLOG_EKSTERNI_LINK);
    expect(html).not.toContain(esc(rez.kontakt));
    expect(html).toContain(`>${esc(rez.link)}</label>`);
  });
});

describe("PodaciLokala", () => {
  const LINK = "https://scanme.example/demo-restoran/meni";
  const html = renderToStaticMarkup(<PodaciLokala naziv="Demo restoran" javniLink={LINK} />);

  test("a titled card with the name and the public link as text, and a button to copy it", () => {
    expect(html).toContain(`>${esc(lp.naslov)}</h2>`);
    expect(html).toMatch(new RegExp(`<dt\\b[^>]*>${esc(lp.naziv)}</dt><dd\\b[^>]*>Demo restoran</dd>`));
    expect(html).toMatch(new RegExp(`<dt\\b[^>]*>${esc(lp.link)}</dt>`));
    expect(html).toContain(`>${esc(LINK)}</span>`);
    const dugme = /<button\b[^>]*>[\s\S]*?<\/button>/.exec(html)?.[0] ?? "";
    expect(dugme).toContain('type="button"');
    expect(tekst(dugme)).toBe(lp.kopiraj);
    expect(count(html, "<button")).toBe(1);
  });

  test("a long link breaks anywhere instead of widening the page", () => {
    const veza = /<span\b[^>]*class="([^"]*)"[^>]*>https:\/\/scanme\.example/.exec(html)?.[1] ?? "";
    expect(veza).toContain("break-all");
    expect(veza).toContain("min-w-0");
  });

  test("a polite status is in the page from the start, empty until something is copied", () => {
    expect(html).toMatch(/<div role="status" aria-live="polite"[^>]*><\/div>/);
    expect(tekst(html)).not.toContain(lp.kopirano);
    expect(tekst(html)).not.toContain(lp.kopiranjeNeuspelo);
  });

  test("it does not repeat the screen's count of positions and cards", () => {
    expect(tekst(html)).not.toMatch(/mest|QR kartic|zon/i);
  });

  test("the relative link of the server render is shown as it is", () => {
    const relativno = renderToStaticMarkup(<PodaciLokala naziv="Demo restoran" javniLink="/demo-restoran/meni" />);
    expect(relativno).toContain(">/demo-restoran/meni</span>");
  });
});

describe("LokalEkran with the card of the venue", () => {
  const ok = async (): Promise<LokalIshod> => ({ ok: true });
  const RADNJE: LokalRadnje = {
    createPosition: ok,
    createPositions: ok,
    updatePosition: ok,
    archivePosition: ok,
    setLayout: ok,
    setLayouts: ok,
    createZone: ok,
    renameZone: ok,
    moveZone: ok,
    archiveZone: ok,
    mintForPositions: ok,
    mintForPage: ok,
    linkCard: ok,
    setCardActive: ok,
  };
  const mesto = (id: string, label: string, order: number): LokalPozicija => ({
    id,
    key: id,
    kind: "table",
    label,
    seats: 4,
    zoneId: null,
    layout: null,
    order,
  });
  const PODACI: LokalPodaci = {
    zones: [],
    positions: [mesto("p-sto-1", "Sto 1", 1), mesto("p-sto-2", "Sto 2", 2)],
    cards: [],
    pages: [{ key: "p-meni", name: "Kompletan meni", slug: "meni", isDefault: true }],
    cardsTruncated: false,
  };

  function lokal(podaciLokala?: ReactNode): string {
    return renderToStaticMarkup(
      <LokalEkran
        podaci={PODACI}
        radnje={RADNJE}
        pogled="lista"
        onPogled={() => {}}
        qrOrigin="https://scanme.example"
        meniHref="/demo-restoran/meni"
        podaciLokala={podaciLokala}
      />,
    );
  }

  test("the card stands right after the header and before the views", () => {
    const html = lokal(<PodaciLokala naziv="Demo restoran" javniLink="/demo-restoran/meni" />);
    const kartica = html.indexOf("data-podaci-lokala");
    expect(count(html, "<h1")).toBe(1);
    expect(html.indexOf("</h1>")).toBeLessThan(kartica);
    expect(kartica).toBeLessThan(html.indexOf('role="tablist"'));
  });

  test("the card adds no second count of positions and cards: the screen's summary appears as often as without it", () => {
    const sazetak = sazetakLokala(PODACI);
    const sa = tekst(lokal(<PodaciLokala naziv="Demo restoran" javniLink="/demo-restoran/meni" />));
    const bez = tekst(lokal());
    expect(count(bez, sazetak)).toBeGreaterThan(0);
    expect(count(sa, sazetak)).toBe(count(bez, sazetak));
  });

  test("without the slot the screen is what K20 made it", () => {
    const html = lokal();
    expect(html).not.toContain("data-podaci-lokala");
    expect(html).toContain('role="tablist"');
    expect(html).toContain(">Lokal i QR</h1>");
  });
});
