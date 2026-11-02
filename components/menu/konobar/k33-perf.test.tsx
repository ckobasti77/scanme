// K33 hardening tests: what the waiter panel redraws when its clock ticks every second (audit C8),
// and the keyboard fixes (focus after an action, the skip link, the scroll margin of the actions).
// Server markup only (renderToStaticMarkup, no DOM): effects do not run and useSyncExternalStore
// answers with its server snapshot. What is proven here is (1) the memoised pieces really are memo
// components and their comparisons answer "same" for the clock alone, (2) the leaves read the clock
// from SatKontekst, which every container sets itself, (3) the markup of the skip link, its target
// and the scroll margins. The focus after an action, Escape and the focus after the sign-in live in
// effects and handlers: they are confirmed in the browser, not here; only the pure part of the
// focus (the next card) is tested. Invented data only.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureKonobar, fixtureKonobarRezervacije, fixtureSale } from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { formatElapsed } from "@/lib/menu/elapsed-time";
import { parseKonobarPreview, type IzlogSearchParams } from "@/lib/menu/izlog-params";
import { activeKinds, type TableKind } from "@/lib/menu/table-summary";
import { sledeciFokus } from "./fokus-posle-radnje";
import type { KonobarZahtev } from "./model";
import { KarticaZahteva, jeSvez, karticaZahtevaJednaka, type KarticaZahtevaProps } from "./radni-red/kartica-zahteva";
import { RadniRed } from "./radni-red/radni-red";
import {
  KarticaRezervacije,
  izgledKartice,
  karticaRezervacijeJednaka,
  type KarticaRezervacijeProps,
} from "./rezervacije/kartica-rezervacije";
import { mestaSale, potpisVremena, type SalaMesto } from "./sala/pogled";
import { StoNaRasporedu, stoJednako } from "./sala/raspored";
import { Sala, type SalaPrikaz } from "./sala/sala";
import { RedListe, RedTabele, redSaleJednak } from "./sala/tabela";
import { SatKontekst } from "./use-sat";
import { VremePar } from "./vreme";

const t = menuKonobarSr;
const NISTA = () => undefined;
const SEKUNDA = 1000;
const MINUT = 60_000;
const SAT = 60 * MINUT;

// --- Helpers (markup is read back with small regexes, as in konobar.test.tsx) -------------

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

/** What a person could read: no tags, no styles, one line (sr-only text included). */
const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

function attr(otvor: string, ime: string): string | undefined {
  const value = new RegExp(`\\s${ime}="([^"]*)"`).exec(otvor)?.[1];
  return value === undefined ? undefined : unesc(value);
}

function izdvoji(html: string, re: RegExp): string {
  const unutra = re.exec(html)?.[1];
  if (unutra === undefined) throw new Error(`markup part not found: ${re}`);
  return unutra;
}

type DugmeMarkup = { klase: string; ime: string | undefined };

const dugmad = (html: string): DugmeMarkup[] =>
  [...html.matchAll(/<button\b([^>]*)>/g)].map(([, otvor]) => ({ klase: attr(otvor, "class") ?? "", ime: attr(otvor, "aria-label") }));

const izlog = (upit: IzlogSearchParams = {}) => renderToStaticMarkup(<KonobarIzlog params={parseKonobarPreview(upit)} />);

const jeMemo = (komponenta: unknown) => (komponenta as { $$typeof?: symbol }).$$typeof === Symbol.for("react.memo");
const poredjenje = (komponenta: unknown) => (komponenta as { compare?: unknown }).compare;

/** Is `trajanje` (`17:00`) in the text as a timer of its own, not as the end of `1:17:00`? */
const imaTajmer = (html: string, sekunde: number) => new RegExp(`(^|\\s)${formatElapsed(sekunde)}(\\s|$)`).test(tekst(html));

// --- Data -------------------------------------------------------------------------------

const FX = fixtureKonobar();
const SALA = fixtureSale().sala;
const REZ = fixtureKonobarRezervacije().rezervacije;

const NOV = FX.zahtevi.find((zahtev) => zahtev.status === "new")!;
const PRIHVACEN = FX.zahtevi.find((zahtev) => zahtev.status === "accepted")!;
const MESTA = mestaSale({ sala: SALA, zahtevi: FX.zahtevi });
const MIRNO = MESTA.find((mesto) => activeKinds(mesto.summary).length === 0)!;
const SA_JEDNIM = MESTA.find((mesto) => activeKinds(mesto.summary).length === 1)!;
const OD = SA_JEDNIM.summary.kinds[activeKinds(SA_JEDNIM.summary)[0]]!.oldestAt;
const LAYOUT = { x: 0, y: 0, w: 2, h: 2, shape: "rect" } as const;
const VRSTE: readonly TableKind[] = ["call", "order", "bill"];

// --- C8: what a tick redraws -----------------------------------------------------------

describe("C8: the card, the tile and the row are memo components", () => {
  const MEMO: [string, unknown, unknown][] = [
    ["KarticaZahteva", KarticaZahteva, karticaZahtevaJednaka],
    ["KarticaRezervacije", KarticaRezervacije, karticaRezervacijeJednaka],
    ["StoNaRasporedu", StoNaRasporedu, stoJednako],
    ["RedTabele", RedTabele, redSaleJednak],
    ["RedListe", RedListe, redSaleJednak],
  ];

  test.each(MEMO)("%s is React.memo with its own comparison", (_ime, komponenta, uporedi) => {
    expect(jeMemo(komponenta)).toBe(true);
    expect(poredjenje(komponenta)).toBe(uporedi);
  });
});

describe("C8: the request card ignores the clock except for its Novo mark", () => {
  const osnova = (zahtev: KonobarZahtev, sadaMs: number): KarticaZahtevaProps => ({
    zahtev,
    sadaMs,
    radi: false,
    onOtvori: NISTA,
    onRadnja: NISTA,
    radnjeIskljucene: false,
  });

  test("a new request is Novo for 15 s and not after", () => {
    expect(jeSvez(NOV, NOV.createdAt + 14 * SEKUNDA)).toBe(true);
    expect(jeSvez(NOV, NOV.createdAt + 15 * SEKUNDA)).toBe(false);
    expect(jeSvez(PRIHVACEN, PRIHVACEN.createdAt + SEKUNDA)).toBe(false);
  });

  test("ticks that do not turn the mark over are the same card", () => {
    const stara = NOV.createdAt + 30 * SEKUNDA;
    for (const pomak of [SEKUNDA, 10 * SEKUNDA, 5 * MINUT, SAT]) {
      expect(karticaZahtevaJednaka(osnova(NOV, stara), osnova(NOV, stara + pomak)), `+${pomak} ms`).toBe(true);
    }
    // Inside the first 15 s the card is Novo on both sides.
    expect(karticaZahtevaJednaka(osnova(NOV, NOV.createdAt + 2 * SEKUNDA), osnova(NOV, NOV.createdAt + 3 * SEKUNDA))).toBe(true);
    // An accepted request never is.
    expect(karticaZahtevaJednaka(osnova(PRIHVACEN, PRIHVACEN.createdAt), osnova(PRIHVACEN, PRIHVACEN.createdAt + 20 * MINUT))).toBe(true);
  });

  test("the tick that turns Novo off redraws the card", () => {
    expect(karticaZahtevaJednaka(osnova(NOV, NOV.createdAt + 14 * SEKUNDA), osnova(NOV, NOV.createdAt + 15 * SEKUNDA))).toBe(false);
  });

  test("anything else that changes redraws it: the data, the action in flight, offline, the reminder, a callback", () => {
    const a = osnova(NOV, NOV.createdAt + 30 * SEKUNDA);
    expect(karticaZahtevaJednaka(a, { ...a, zahtev: { ...NOV } })).toBe(false);
    expect(karticaZahtevaJednaka(a, { ...a, radi: true })).toBe(false);
    expect(karticaZahtevaJednaka(a, { ...a, radnjeIskljucene: true })).toBe(false);
    expect(karticaZahtevaJednaka(a, { ...a, podsetnik: true })).toBe(false);
    expect(karticaZahtevaJednaka(a, { ...a, onOtvori: () => undefined })).toBe(false);
    expect(karticaZahtevaJednaka(a, { ...a, onRadnja: () => undefined })).toBe(false);
    // No reminder given is the same as "false".
    expect(karticaZahtevaJednaka(a, { ...a, podsetnik: false })).toBe(true);
  });
});

describe("C8: the reservation card is redrawn only when its clock-made parts turn over", () => {
  const prihvacena = REZ.rows.find((red) => red.id === "rv_02")!;
  const T = prihvacena.requestedAt;
  const HOLD = REZ.holdMinutes;
  const osnova = (sadaMs: number): KarticaRezervacijeProps => ({
    red: prihvacena,
    sadaMs,
    holdMin: HOLD,
    radi: false,
    onOtvori: NISTA,
    onStigli: NISTA,
    radnjeIskljucene: false,
  });

  test("the fixture reservation is an accepted one that is not yet due", () => {
    expect(prihvacena.status).toBe("accepted");
    expect(izgledKartice(prihvacena, IZLOG_SADA, HOLD).radnja).toBe("otvori");
  });

  test("ticks inside one phase are the same card", () => {
    expect(karticaRezervacijeJednaka(osnova(T - 90 * MINUT), osnova(T - 90 * MINUT + SEKUNDA))).toBe(true);
    expect(karticaRezervacijeJednaka(osnova(T + 2 * MINUT), osnova(T + 2 * MINUT + SEKUNDA))).toBe(true);
    expect(karticaRezervacijeJednaka(osnova(T + (HOLD + 5) * MINUT), osnova(T + (HOLD + 5) * MINUT + SEKUNDA))).toBe(true);
  });

  test("the term coming (Stigli su appears) and the hold passing (kasni) redraw the card", () => {
    expect(karticaRezervacijeJednaka(osnova(T - SEKUNDA), osnova(T + SEKUNDA))).toBe(false);
    expect(izgledKartice(prihvacena, T + SEKUNDA, HOLD).radnja).toBe("stigli");
    expect(karticaRezervacijeJednaka(osnova(T + HOLD * MINUT - SEKUNDA), osnova(T + HOLD * MINUT))).toBe(false);
    expect(izgledKartice(prihvacena, T + HOLD * MINUT, HOLD).kasni).toBe(true);
  });

  test("another day word of the term redraws it (Danas to Sutra)", () => {
    expect(karticaRezervacijeJednaka(osnova(T - 2 * 24 * SAT), osnova(T - 24 * SAT))).toBe(false);
  });

  test("the data, the action in flight, offline, the hold and a callback redraw it", () => {
    const a = osnova(IZLOG_SADA);
    expect(karticaRezervacijeJednaka(a, { ...a, red: { ...prihvacena } })).toBe(false);
    expect(karticaRezervacijeJednaka(a, { ...a, radi: true })).toBe(false);
    expect(karticaRezervacijeJednaka(a, { ...a, radnjeIskljucene: true })).toBe(false);
    expect(karticaRezervacijeJednaka(a, { ...a, holdMin: HOLD + 5 })).toBe(false);
    expect(karticaRezervacijeJednaka(a, { ...a, onOtvori: () => undefined })).toBe(false);
    expect(karticaRezervacijeJednaka(a, { ...a, onStigli: () => undefined })).toBe(false);
  });
});

describe("C8: the floor tile and the row follow the sentence of their button", () => {
  const tile = (mesto: SalaMesto, sadaMs: number) => ({
    mesto,
    layout: LAYOUT,
    kolona: 12,
    redova: 6,
    sadaMs,
    izabrano: false,
    podsetnik: false,
    onIzaberi: NISTA,
  });
  const red = (mesto: SalaMesto, sadaMs: number, prag = 15) => ({
    mesto,
    izabran: false,
    sadaMs,
    prag,
    onIzaberi: NISTA,
    prikaziZonu: true,
    zauzetost: false,
    vrste: VRSTE,
  });

  test("the fixture has a table with nothing active and a table with exactly one kind", () => {
    expect(MIRNO).toBeDefined();
    expect(SA_JEDNIM).toBeDefined();
  });

  test("a table with nothing active never depends on the clock", () => {
    for (const pomak of [SEKUNDA, MINUT, SAT]) {
      expect(stoJednako(tile(MIRNO, IZLOG_SADA), tile(MIRNO, IZLOG_SADA + pomak)), `tile +${pomak}`).toBe(true);
      expect(redSaleJednak(red(MIRNO, IZLOG_SADA), red(MIRNO, IZLOG_SADA + pomak)), `row +${pomak}`).toBe(true);
    }
  });

  test("an active table is redrawn each second in its first minute (the sentence says seconds), then once a minute", () => {
    expect(stoJednako(tile(SA_JEDNIM, OD + 5 * SEKUNDA), tile(SA_JEDNIM, OD + 6 * SEKUNDA))).toBe(false);
    expect(stoJednako(tile(SA_JEDNIM, OD + 2 * MINUT), tile(SA_JEDNIM, OD + 2 * MINUT + 30 * SEKUNDA))).toBe(true);
    expect(stoJednako(tile(SA_JEDNIM, OD + 2 * MINUT), tile(SA_JEDNIM, OD + 3 * MINUT))).toBe(false);
    expect(redSaleJednak(red(SA_JEDNIM, OD + 2 * MINUT), red(SA_JEDNIM, OD + 2 * MINUT + 30 * SEKUNDA))).toBe(true);
    expect(redSaleJednak(red(SA_JEDNIM, OD + 2 * MINUT), red(SA_JEDNIM, OD + 3 * MINUT))).toBe(false);
  });

  test("a row (not a tile) is also redrawn when a state turns late inside a minute", () => {
    // A 2.5 min threshold turns late at 150 s, between two minute marks of the sentence.
    const pre = OD + 149 * SEKUNDA;
    const posle = OD + 150 * SEKUNDA;
    expect(stoJednako(tile(SA_JEDNIM, pre), tile(SA_JEDNIM, posle))).toBe(true);
    expect(potpisVremena(SA_JEDNIM, pre, 2.5)).not.toBe(potpisVremena(SA_JEDNIM, posle, 2.5));
    expect(redSaleJednak(red(SA_JEDNIM, pre, 2.5), red(SA_JEDNIM, posle, 2.5))).toBe(false);
  });

  test("the data, the selection, the reminder, the columns and the callback redraw them", () => {
    const a = tile(MIRNO, IZLOG_SADA);
    expect(stoJednako(a, { ...a, mesto: { ...MIRNO } })).toBe(false);
    expect(stoJednako(a, { ...a, izabrano: true })).toBe(false);
    expect(stoJednako(a, { ...a, podsetnik: true })).toBe(false);
    expect(stoJednako(a, { ...a, onIzaberi: () => undefined })).toBe(false);
    const b = red(MIRNO, IZLOG_SADA);
    expect(redSaleJednak(b, { ...b, mesto: { ...MIRNO } })).toBe(false);
    expect(redSaleJednak(b, { ...b, izabran: true })).toBe(false);
    expect(redSaleJednak(b, { ...b, onIzaberi: () => undefined })).toBe(false);
    expect(redSaleJednak(b, { ...b, zauzetost: true })).toBe(false);
  });
});

describe("C8: the leaves that show time read the clock from SatKontekst", () => {
  const od = NOV.createdAt;

  test("a timer drawn alone shows the clock it was given", () => {
    const html = renderToStaticMarkup(<VremePar od={od} sadaMs={od + SEKUNDA} slozeno />);
    expect(imaTajmer(html, 1)).toBe(true);
  });

  test("under a provider the clock of the provider wins over the prop", () => {
    const html = renderToStaticMarkup(
      <SatKontekst.Provider value={od + 5 * MINUT}>
        <VremePar od={od} sadaMs={od + SEKUNDA} slozeno />
      </SatKontekst.Provider>,
    );
    expect(imaTajmer(html, 300)).toBe(true);
    expect(imaTajmer(html, 1)).toBe(false);
  });

  test("a memoised card with a stale clock prop still shows the live wait; only the Novo mark follows the prop", () => {
    const html = renderToStaticMarkup(
      <SatKontekst.Provider value={od + 7 * MINUT}>
        <KarticaZahteva
          zahtev={NOV}
          sadaMs={od + 2 * SEKUNDA}
          radi={false}
          onOtvori={NISTA}
          onRadnja={NISTA}
          radnjeIskljucene={false}
        />
      </SatKontekst.Provider>,
    );
    expect(imaTajmer(html, 7 * 60)).toBe(true);
    expect(html).toContain("data-svez");
  });

  // The containers set the clock for their leaves themselves: an outer provider an hour ahead must not win.
  const sat = IZLOG_SADA;
  const unaprijed = (deca: ReactNode) => <SatKontekst.Provider value={sat + SAT}>{deca}</SatKontekst.Provider>;

  test("RadniRed: the timer of a card is the queue's clock", () => {
    const html = renderToStaticMarkup(
      unaprijed(
        <RadniRed
          red={{ zahtevi: FX.zahtevi, skraceno: false, otkazani: [] }}
          sadaMs={sat}
          radiId={null}
          onOtvori={NISTA}
          onRadnja={NISTA}
          radnjeIskljucene={false}
          obavestenja={[]}
          onZatvoriObavestenje={NISTA}
        />,
      ),
    );
    const kartica = izdvoji(html, new RegExp(`(<article\\b[^>]*data-zahtev="${NOV.id}"[^>]*>[\\s\\S]*?</article>)`));
    const sekunde = Math.floor((sat - NOV.createdAt) / SEKUNDA);
    expect(imaTajmer(kartica, sekunde)).toBe(true);
    expect(imaTajmer(kartica, sekunde + 3600)).toBe(false);
  });

  const PRIKAZI: SalaPrikaz[] = ["raspored", "tabela"];

  test.each(PRIKAZI)("Sala (%s): the badges and the states are the floor's clock", (prikaz) => {
    const html = renderToStaticMarkup(
      unaprijed(
        <Sala
          sala={SALA}
          zahtevi={FX.zahtevi}
          zauzetost={undefined}
          filterZoneId={null}
          sadaMs={sat}
          izabranoId={null}
          onIzaberi={NISTA}
          prikaz={prikaz}
          onPrikaz={NISTA}
          podsetnik={new Set<string>()}
        />,
      ),
    );
    const sekunde = Math.floor((sat - OD) / SEKUNDA);
    expect(imaTajmer(html, sekunde)).toBe(true);
    expect(imaTajmer(html, sekunde + 3600)).toBe(false);
  });
});

// --- K33: the keyboard ------------------------------------------------------------------

describe("the focus after an action follows the card", () => {
  const redosled = ["a", "b", "c", "d"];

  test("the next card that is still there takes it", () => {
    expect(sledeciFokus(redosled, "b", new Set(["a", "c", "d"]))).toBe("c");
    expect(sledeciFokus(redosled, "b", new Set(["a", "d"]))).toBe("d");
  });

  test("the last card hands it to the one before, skipping what is gone", () => {
    expect(sledeciFokus(redosled, "d", new Set(["a", "b", "c"]))).toBe("c");
    expect(sledeciFokus(redosled, "d", new Set(["a"]))).toBe("a");
  });

  test("no card left, or a card that was never listed: the heading (null)", () => {
    expect(sledeciFokus(["a"], "a", new Set())).toBeNull();
    expect(sledeciFokus(redosled, "x", new Set(redosled))).toBeNull();
  });
});

describe("the skip link and its target", () => {
  const html = izlog();

  test("the queue's heading is a focus target (tabindex -1, id radni-red-naslov)", () => {
    const h1 = izdvoji(html, /<h1\b([^>]*\sid="radni-red-naslov"[^>]*)>/);
    expect(attr(h1, "tabindex")).toBe("-1");
    expect(attr(h1, "class")).toContain("outline-none");
  });

  test("the first element of the panel is the link 'Pređi na radni red', shown only on focus, to that heading", () => {
    const pocetak = html.indexOf("<a ");
    expect(pocetak).toBeGreaterThanOrEqual(0);
    // Nothing focusable stands before it, and it comes before the header.
    expect(html.slice(0, pocetak)).not.toMatch(/<(a|button|input|select|textarea)\b/);
    expect(pocetak).toBeLessThan(html.indexOf("<header"));
    const veza = html.slice(pocetak, html.indexOf("</a>", pocetak) + 4);
    expect(attr(izdvoji(veza, /^<a\b([^>]*)>/), "href")).toBe("#radni-red-naslov");
    const klase = attr(izdvoji(veza, /^<a\b([^>]*)>/), "class")!.split(/\s+/);
    expect(klase).toContain("sr-only");
    expect(klase).toContain("focus:not-sr-only");
    expect(tekst(veza)).toBe(t.zaglavlje.preskociNaRed);
  });

  test("it is not offered where its target is not on screen (a detail, the floor of a phone)", () => {
    for (const upit of [{ ekran: "detalj" }, { ekran: "sto" }, { ekran: "sala-raspored" }] as const) {
      expect(izlog(upit), upit.ekran).not.toContain('href="#radni-red-naslov"');
    }
  });
});

describe("the action buttons of the cards keep clear of the bottom navigation when Tab scrolls them", () => {
  const imaMargina = (klase: string) => klase.split(/\s+/).includes("scroll-mb-28");

  test("every request card: the title and the action", () => {
    const kartice = [...izlog().matchAll(/<article\b[^>]*data-zahtev="[^"]+"[^>]*>[\s\S]*?<\/article>/g)].map((m) => m[0]);
    expect(kartice.length).toBeGreaterThan(0);
    for (const kartica of kartice) {
      const dugmici = dugmad(kartica);
      expect(dugmici.length, kartica.slice(0, 80)).toBe(2);
      for (const d of dugmici) expect(imaMargina(d.klase), d.ime).toBe(true);
    }
  });

  test("every reservation card: the title and the action", () => {
    const kartice = [...izlog({ ekran: "rezervacije" }).matchAll(/<article\b[^>]*data-rezervacija="[^"]+"[^>]*>[\s\S]*?<\/article>/g)].map(
      (m) => m[0],
    );
    expect(kartice.length).toBeGreaterThan(0);
    for (const kartica of kartice) {
      const dugmici = dugmad(kartica);
      expect(dugmici.length, kartica.slice(0, 80)).toBe(2);
      for (const d of dugmici) expect(imaMargina(d.klase), d.ime).toBe(true);
    }
  });
});
