// K22 render tests: the waiter panel (components/menu/konobar) over the izlog
// fixture "Demo restoran" (fixtureKonobar, 18:27 in Belgrade) and over
// hand-made objects for what the fixture does not cover (Room service). Server
// markup only (renderToStaticMarkup, no DOM): effects do not run and
// useSyncExternalStore answers with its server snapshot, so the clock stands at
// IZLOG_SADA. Texts are read from the dictionaries; the Serbian literals are
// the sentences the owner's brief names (kept literal so a dictionary edit that
// changes them fails loudly). Invented data only.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureKonobar, KONOBAR_IZLOG_PIN, type KonobarFixture } from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
import { formatRsd } from "@/components/menu/menu-view";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { clockTime } from "@/lib/menu/elapsed-time";
import { parseKonobarPreview } from "@/lib/menu/izlog-params";
import type { KonobarDetalj, KonobarRadnje, KonobarRed, KonobarZahtev, PinStanje } from "./model";
import { KonobarPanel, type KonobarPanelProps } from "./panel";
import { PinEkran, type PinEkranProps } from "./pin/pin-ekran";
import { RadniRed } from "./radni-red/radni-red";

const t = menuKonobarSr;
const d = menuDomenSr;
const z = menuZajednickoSr.stanja;

// --- Helpers (markup is read back with small regexes, as in gost.test.tsx) ----------

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

/** What a person could read: no tags, no styles, one line (sr-only text included). */
const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

function attr(otvor: string, ime: string): string | undefined {
  const value = new RegExp(`\\s${ime}="([^"]*)"`).exec(otvor)?.[1];
  return value === undefined ? undefined : unesc(value);
}

/** The text of every <h{nivo}>. */
const naslovi = (html: string, nivo: 1 | 2 | 3): string[] =>
  [...html.matchAll(new RegExp(`<h${nivo}\\b[^>]*>([\\s\\S]*?)</h${nivo}>`, "g"))].map((m) => tekst(m[1]));

/** The first capture group of `re`, or a loud failure when the markup lacks the part. */
function izdvoji(html: string, re: RegExp): string {
  const unutra = re.exec(html)?.[1];
  if (unutra === undefined) throw new Error(`markup part not found: ${re}`);
  return unutra;
}

type DugmeMarkup = { tekst: string; ime: string | undefined; pritisnuto: string | undefined; iskljuceno: boolean; klase: string };

const dugmad = (html: string): DugmeMarkup[] =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, otvor, unutra]) => ({
    tekst: tekst(unutra),
    ime: attr(otvor, "aria-label"),
    pritisnuto: attr(otvor, "aria-pressed"),
    iskljuceno: /\sdisabled=""/.test(otvor),
    klase: attr(otvor, "class") ?? "",
  }));

const dugme = (html: string, naziv: string) => dugmad(html).find((b) => b.tekst === naziv);
const upozorenja = (html: string) => [...html.matchAll(/<div role="alert"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => tekst(m[1]));
const kartica = (html: string, id: string) => izdvoji(html, new RegExp(`(<article\\b[^>]*data-zahtev="${id}"[^>]*>[\\s\\S]*?</article>)`));
const redosled = (html: string) => [...html.matchAll(/<article data-zahtev="([^"]+)"/g)].map((m) => m[1]);
const imaMin48 = (b: DugmeMarkup | undefined) => /\bmin-h-(12|14|16)\b/.test(b?.klase ?? "");
const recenica = (b: DugmeMarkup | undefined, naziv: string) => b?.tekst === naziv;
const tasteriCifre = (html: string) => tastatura(html).filter((b) => /^\d$/.test(b.tekst));

/** The status label of a card or detail: an icon right before a word. */
function statusKartice(html: string): string | null {
  const m = /<span data-status-ton="[a-z]+"[^>]*><svg[^>]*>[\s\S]*?<\/svg><span class="min-w-0">([\s\S]*?)<\/span><\/span>/.exec(html);
  return m ? tekst(m[1]) : null;
}

const pre = (min: number, sek = 0) => IZLOG_SADA - (min * 60 + sek) * 1000;
const mesto = (r: Pick<KonobarZahtev, "positionLabel" | "zoneName">) => (r.zoneName ? `${r.positionLabel} · ${r.zoneName}` : r.positionLabel);
const aktivni = (n: number) => fmt(t.zaglavlje.aktivni[srPluralCategory(n)], { n });

// --- Fixtures and renderers ---------------------------------------------------------

const FX = fixtureKonobar();
const zahtevPo = (id: string) => FX.zahtevi.find((r) => r.id === id)!;
const NISTA = () => undefined;
const ishod = (status: "accepted" | "done" | "cancelled") => async () => ({ ok: true as const, status, changed: true });
const salaIshod = async () => ({ ok: true as const, changed: true });
const rezIshod = async () => ({ ok: true as const, status: "accepted" as const, changed: true });
const RADNJE: KonobarRadnje = {
  preuzmi: ishod("accepted"),
  zavrsi: ishod("done"),
  otkazi: ishod("cancelled"),
  odjava: NISTA,
  // K23: the floor's actions (the floor itself is covered in sala.test.tsx).
  postaviZauzetost: salaIshod,
  postaviMojuZonu: salaIshod,
  postaviZonuOsoblja: salaIshod,
  // K25: the reservations' actions (covered in rezervacije.test.tsx; these panels never press them).
  prihvatiRezervaciju: rezIshod,
  odbijRezervaciju: rezIshod,
  predloziIzmenu: rezIshod,
  gostPrihvataPredlog: rezIshod,
  otkaziRezervaciju: rezIshod,
  poveziSto: rezIshod,
  gostiStigli: rezIshod,
};

const crveniRed = (fx: KonobarFixture = FX, preko: Partial<KonobarRed> = {}): KonobarRed => ({ zahtevi: fx.zahtevi, skraceno: false, otkazani: fx.otkazani, ...preko });

function panel(preko: Partial<KonobarPanelProps> = {}, fx: KonobarFixture = FX): string {
  return renderToStaticMarkup(
    <KonobarPanel lokal={fx.lokal} korisnik={fx.korisnik} red={crveniRed(fx)} izabranId={null} detalj={undefined} onIzaberi={NISTA} radnje={RADNJE} veza="online" pocetnoMs={IZLOG_SADA} izlogOd={IZLOG_SADA} {...preko} />,
  );
}

/** The detail of a fixture request with "the rest of the table" computed as the izlog does. */
function podaci(id: string): KonobarDetalj {
  const osnova = FX.detalji[id];
  return { ...osnova, others: FX.zahtevi.filter((r) => r.positionLabel === osnova.request.positionLabel && r.id !== id) };
}

const prikazDetalja = (id: string, preko: Partial<KonobarPanelProps> = {}) => panel({ izabranId: id, detalj: podaci(id), ...preko });

const pin = (preko: Partial<PinEkranProps> = {}) =>
  renderToStaticMarkup(<PinEkran lokal={FX.lokal} pinDostupan onPrijava={async () => ({ ok: true })} pocetnoMs={IZLOG_SADA} {...preko} />);

const tastatura = (html: string) => dugmad(izdvoji(html, new RegExp(`<div role="group" aria-label="${t.pin.tastatura}"[^>]*>([\\s\\S]*?)</div>`)));

function kutije(html: string): { ukupno: number; puno: number } {
  const polja = izdvoji(html, /<div[^>]*\sdata-pin-polja[^>]*>([\s\S]*?)<\/div>/);
  const sve = [...polja.matchAll(/<span\b([^>]*)class="grid h-16/g)];
  return { ukupno: sve.length, puno: sve.filter((m) => m[1].includes("data-puno")).length };
}

const izlog = (upit: Parameters<typeof parseKonobarPreview>[0]) => renderToStaticMarkup(<KonobarIzlog params={parseKonobarPreview(upit)} />);

// Room service has no fixture in the restaurant: the order at Sto 7 moved to a room with one delivery fee.
const DOSTAVA = 300;
const SOBA: KonobarDetalj = (() => {
  const { request, items } = podaci("rq_03");
  const zbir = items.reduce((suma, stavka) => suma + stavka.lineTotalRsd, 0);
  const soba = { channel: "room_service", positionKind: "room", positionLabel: "Soba 108", zoneName: null, sourceLabel: "Soba 108" } as const;
  return { items, others: [], request: { ...request, ...soba, subtotalRsd: zbir, deliveryFeeRsd: DOSTAVA, totalRsd: zbir + DOSTAVA } };
})();

// --- 1. The PIN screen --------------------------------------------------------------

describe("PIN screen", () => {
  test("three boxes, the keypad 0-9, a named delete key, a disabled submit, the title and the help line", () => {
    const html = pin();
    expect(naslovi(html, 1)).toEqual([t.pin.naslov]);
    expect(kutije(html)).toEqual({ ukupno: 3, puno: 0 });

    const tasteri = tastatura(html);
    const cifre = tasteriCifre(html);
    expect(cifre.map((b) => b.tekst).sort()).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(cifre.every((b) => !b.iskljuceno)).toBe(true);
    expect(tasteri).toHaveLength(12);
    expect(tasteri.every((b) => /\bmin-h-16\b/.test(b.klase))).toBe(true);

    const brisanje = tasteri.find((b) => b.ime === t.pin.obrisi);
    expect(brisanje?.ime).toBe("Obriši poslednju cifru");
    expect(brisanje?.tekst).toBe("");
    expect(brisanje?.iskljuceno).toBe(true);
    const prijava = tasteri.find((b) => b.tekst === t.pin.prijava);
    expect(prijava?.tekst).toBe("Prijavi se");
    expect(prijava?.iskljuceno).toBe(true);

    const sav = tekst(html);
    for (const rec of [t.pin.pomoc, t.pin.uputstvo, FX.lokal, t.pin.podnaslov]) expect(sav).toContain(rec);
  });

  test("typed digits fill the boxes and the reader line counts them", () => {
    for (const n of [0, 1, 2, 3]) {
      const html = pin({ pocetniPin: "123".slice(0, n) });
      expect(kutije(html)).toEqual({ ukupno: 3, puno: n });
      expect(tekst(html)).toContain(fmt(t.pin.uneto[srPluralCategory(n)], { n }));
    }
    const dve = pin({ pocetniPin: "12" });
    expect(kutije(dve).puno).toBe(2);
    expect(tekst(dve)).toContain("Unete su 2 cifre od 3.");
    expect(tekst(pin({ pocetniPin: "1" }))).toContain("Uneta je 1 cifra od 3.");
    expect(tekst(pin({ pocetniPin: "12ab" }))).toContain("Unete su 2 cifre od 3.");
  });

  test("Prijavi se opens only with all three digits; delete only with at least one", () => {
    const prijava = (html: string) => tastatura(html).find((b) => b.tekst === t.pin.prijava);
    const brisanje = (html: string) => tastatura(html).find((b) => b.ime === t.pin.obrisi);
    expect(prijava(pin({ pocetniPin: "12" }))?.iskljuceno).toBe(true);
    expect(prijava(pin({ pocetniPin: KONOBAR_IZLOG_PIN }))?.iskljuceno).toBe(false);
    expect(brisanje(pin({ pocetniPin: "" }))?.iskljuceno).toBe(true);
    expect(brisanje(pin({ pocetniPin: "1" }))?.iskljuceno).toBe(false);
  });

  test("the wrong PIN says how many attempts are left, in an alert", () => {
    const stanje = (attemptsLeft: number): PinStanje => ({ kind: "pogresan", attemptsLeft });
    expect(upozorenja(pin({ pocetnoStanje: stanje(3) }))).toEqual(["Pogrešan PIN · još 3 pokušaja"]);
    expect(upozorenja(pin({ pocetnoStanje: stanje(1) }))).toEqual(["Pogrešan PIN · još 1 pokušaj"]);
    expect(upozorenja(pin({ pocetnoStanje: stanje(4) }))).toEqual([fmt(t.pin.pogresan.few, { n: 4 })]);
    expect(upozorenja(pin())).toEqual([]);
  });

  test("the lock names the time it ends and disables every key; an ended lock is not shown", () => {
    const lockedUntil = IZLOG_SADA + 14 * 60_000;
    const html = pin({ pocetnoStanje: { kind: "blokada", lockedUntil }, izlogOd: IZLOG_SADA });
    expect(clockTime(lockedUntil)).toBe("18:41");
    const [poruka] = upozorenja(html);
    expect(poruka).toContain("Pokušajte ponovo u 18:41");
    expect(poruka).toContain(fmt(t.pin.blokada, { vreme: "18:41" }));
    expect(poruka).toContain(t.pin.blokadaOpis);
    expect(tastatura(html)).toHaveLength(12);
    expect(tastatura(html).every((b) => b.iskljuceno)).toBe(true);

    const istekla = pin({ pocetnoStanje: { kind: "blokada", lockedUntil: IZLOG_SADA - 1000 }, izlogOd: IZLOG_SADA });
    expect(upozorenja(istekla)).toEqual([]);
    expect(tasteriCifre(istekla).every((b) => !b.iskljuceno)).toBe(true);
  });

  test("no connection, too many tries from the network and checking each have their own line", () => {
    expect(upozorenja(pin({ pocetnoStanje: { kind: "veza" } }))).toEqual([t.pin.greska]);
    expect(upozorenja(pin({ pocetnoStanje: { kind: "previse" } }))).toEqual([t.pin.mreza]);
    const provera = pin({ pocetnoStanje: { kind: "proverava" } });
    expect(tekst(provera)).toContain(t.pin.proverava);
    expect(provera).toContain('aria-busy="true"');
    expect(tasteriCifre(provera).every((b) => b.iskljuceno)).toBe(true);
  });

  test("PINs switched off: no keypad, no boxes, the honest sentence", () => {
    for (const html of [pin({ pinDostupan: false }), pin({ pocetnoStanje: { kind: "nedostupno" } })]) {
      expect(html).not.toContain(`aria-label="${t.pin.tastatura}"`);
      expect(html).not.toContain("data-pin-polja");
      expect(tekst(html)).toContain(t.pin.bezPeppera);
      expect(tekst(html)).toContain(t.pin.bezPepperaOpis);
      expect(tekst(html)).not.toContain(t.pin.uputstvo);
      expect(naslovi(html, 1)).toEqual([t.pin.naslov]);
    }
  });

  test("the account entrance: Uđi kao <ime> only with a name and a handler", () => {
    const sa = pin({ nalog: { ime: "Sanja M." }, onNalog: NISTA });
    expect(dugme(sa, "Uđi kao Sanja M.")?.tekst).toBe(fmt(t.pin.nalog, { ime: "Sanja M." }));
    expect(tekst(sa)).toContain(t.pin.nalogOpis);
    for (const bez of [pin({ nalog: { ime: "Sanja M." } }), pin({ nalog: null, onNalog: NISTA }), pin()]) expect(tekst(bez)).not.toContain("Uđi kao");
  });

  test("a sign-in that ended says so in the reserved message slot, until another message replaces it", () => {
    expect(tekst(pin({ istekla: true }))).toContain(t.pin.istekla);
    expect(tekst(pin({ istekla: true, pocetniPin: "1" }))).toContain(t.pin.istekla);
    expect(tekst(pin({ istekla: true, pocetnoStanje: { kind: "pogresan", attemptsLeft: 2 } }))).not.toContain(t.pin.istekla);
    expect(tekst(pin())).not.toContain(t.pin.istekla);
    // The slot is always there, so the keypad never moves when a message comes or goes.
    expect(pin()).toContain("data-pin-poruka");
  });
});

// --- 2. The work queue --------------------------------------------------------------

describe("work queue", () => {
  const html = panel();
  const ID = FX.zahtevi.map((r) => r.id);

  test("the h1 and the three filters, Sve pressed", () => {
    expect(naslovi(html, 1)).toEqual([t.red.naslov]);
    const filteri = dugmad(izdvoji(html, new RegExp(`<div role="group" aria-label="${t.red.filteri}"[^>]*>([\\s\\S]*?)</div>`)));
    expect(filteri.map((f) => f.tekst)).toEqual([`${t.red.filter.sve} 7`, `${t.red.filter.zahtevi} 7`, t.red.filter.rezervacije]);
    expect(filteri.map((f) => f.pritisnuto)).toEqual(["true", "false", "false"]);
    expect(filteri.every((f) => imaMin48(f))).toBe(true);
  });

  test("the summary under the h1: how many are open and since when the oldest new one waits", () => {
    expect(tekst(html)).toContain(fmt(t.red.sazetak, { aktivni: aktivni(7), ceka: "17:00" }));
    const samoPreuzeti = panel({ red: crveniRed(FX, { zahtevi: FX.zahtevi.filter((r) => r.status === "accepted") }) });
    expect(tekst(samoPreuzeti)).toContain(fmt(t.red.sazetakSviPreuzeti, { aktivni: aktivni(3) }));
  });

  test.each([
    { id: "rq_01", vrsta: "call", boja: "text-[var(--mp-vrsta-poziv)]", tudje: ["racun", "porudzbina"], naslov: d.requestKinds.call },
    { id: "rq_02", vrsta: "bill", boja: "text-[var(--mp-vrsta-racun)]", tudje: ["poziv", "porudzbina"], naslov: "Račun · Kartica" },
    { id: "rq_03", vrsta: "order", boja: "text-[var(--mp-vrsta-porudzbina)]", tudje: ["poziv", "racun"], naslov: "Porudžbina · 3 stavke" },
  ])("$id ($vrsta): an icon, its own colour and the word", ({ id, vrsta, boja, tudje, naslov }) => {
    const k = kartica(html, id);
    expect(k).toMatch(new RegExp(`<span aria-hidden="true" data-vrsta="${vrsta}"[^>]*><svg`));
    expect(k).toContain(boja);
    for (const druga of tudje) expect(k).not.toContain(`--mp-vrsta-${druga}`);
    expect(tekst(k)).toContain(naslov);
    expect(tekst(k)).toContain(mesto(zahtevPo(id)));
  });

  test("the words come from the dictionaries: payment wish of a bill, line count of an order, table and zone", () => {
    expect(tekst(kartica(html, "rq_02"))).toContain(`${d.requestKinds.bill} · ${d.paymentPreferences.card}`);
    expect(tekst(kartica(html, "rq_12"))).toContain(`${d.requestKinds.bill} · ${d.paymentPreferences.cash}`);
    const stavki = zahtevPo("rq_03").itemCount!;
    expect(tekst(kartica(html, "rq_03"))).toContain(`${d.requestKinds.order} · ${fmt(t.red.stavke[srPluralCategory(stavki)], { n: stavki })}`);
    expect(zahtevPo("rq_01").zoneName).toBeTruthy();
    expect(tekst(kartica(html, "rq_01"))).toContain(`Sto 3 · ${zahtevPo("rq_01").zoneName}`);
  });

  test("every status is an icon AND a word, a taken request also says who has it", () => {
    for (const id of ID) expect(statusKartice(kartica(html, id)), id).toBeTruthy();
    expect(statusKartice(kartica(html, "rq_01"))).toBe(d.requestStatuses.new);
    expect(statusKartice(kartica(html, "rq_01"))).toBe("Novi");
    expect(statusKartice(kartica(html, "rq_05"))).toBe("Prihvaćen · Vi");
    expect(statusKartice(kartica(html, "rq_06"))).toBe("Prihvaćen · Jelena");
    expect(statusKartice(kartica(html, "rq_12"))).toBe(`${d.requestStatuses.accepted} · Stefan`);
  });

  test("the timer pair: the exact time and 'čeka mm:ss', with a reader sentence in minutes", () => {
    const stiglo = clockTime(pre(8, 12));
    expect(stiglo).toBe("18:18");
    expect(zahtevPo("rq_01").createdAt).toBe(pre(8, 12));
    const k = tekst(kartica(html, "rq_01"));
    expect(k).toContain(stiglo);
    expect(k).toContain("čeka 08:12");
    expect(k).toContain(fmt(t.vreme.citac, { vreme: stiglo, trajanje: fmt(t.vreme.minuti, { n: 8 }) }));
    expect(kartica(html, "rq_01")).not.toContain("data-kasni");
  });

  test("only the request past 15 minutes is late: danger marker, the word 'kasni' and an extra icon", () => {
    expect(ID.filter((id) => kartica(html, id).includes('data-kasni="true"'))).toEqual(["rq_04"]);
    const k = kartica(html, "rq_04");
    expect(tekst(k)).toContain(`čeka 17:00 ${t.vreme.kasni}`);
    expect(tekst(k)).toContain(`, ${t.vreme.kasni}`);
    expect(count(k, "<svg")).toBe(count(kartica(html, "rq_01"), "<svg") + 1);
    expect(k).toContain("--mp-opasnost");
  });

  test.each([
    { id: "rq_01", rec: "Preuzmi", iz: t.red.radnja.accept },
    { id: "rq_02", rec: "Preuzmi", iz: t.red.radnja.accept },
    { id: "rq_04", rec: "Preuzmi", iz: t.red.radnja.accept },
    { id: "rq_03", rec: "Pregledaj", iz: t.red.radnja.review },
    { id: "rq_05", rec: "Završi", iz: t.red.radnja.complete },
    { id: "rq_06", rec: "Pregledaj", iz: t.red.radnja.review },
    { id: "rq_12", rec: "Pregledaj", iz: t.red.radnja.review },
  ])("$id: two tab stops, the main action is $rec", ({ id, rec, iz }) => {
    const dugmici = dugmad(kartica(html, id));
    expect(dugmici).toHaveLength(2);
    const [naslov, radnja] = dugmici;
    expect(iz).toBe(rec);
    expect(naslov.ime).toContain(mesto(zahtevPo(id)));
    expect(recenica(radnja, rec)).toBe(true);
    expect(radnja.ime).toMatch(new RegExp(`^${rec}: .+, Sto \\d`));
    expect(radnja.iskljuceno).toBe(false);
    expect(imaMin48(radnja)).toBe(true);
  });

  test("the order: new oldest first, then mine, then the colleagues'", () => {
    const poVremenu = (a: KonobarZahtev, b: KonobarZahtev) => a.createdAt - b.createdAt;
    const nov = FX.zahtevi.filter((r) => r.status === "new").sort(poVremenu);
    const moji = FX.zahtevi.filter((r) => r.status === "accepted" && r.acceptedBy?.isMe).sort(poVremenu);
    const tudji = FX.zahtevi.filter((r) => r.status === "accepted" && !r.acceptedBy?.isMe).sort(poVremenu);
    expect([nov.length, moji.length, tudji.length]).toEqual([4, 1, 2]);
    expect(redosled(html)).toEqual([...nov, ...moji, ...tudji].map((r) => r.id));
    expect(redosled(html)).toEqual(["rq_04", "rq_01", "rq_03", "rq_02", "rq_05", "rq_06", "rq_12"]);
    const statusi = [...html.matchAll(/<article data-zahtev="[^"]+" data-status="([^"]+)"/g)].map((m) => m[1]);
    expect(statusi).toEqual(["new", "new", "new", "new", "accepted", "accepted", "accepted"]);
  });

  test("the bottom navigation: Radni red pressed, Sala not; the other view swaps them", () => {
    const nav = (h: string) => dugmad(izdvoji(h, new RegExp(`<nav aria-label="${t.nav.oznaka}"[^>]*>([\\s\\S]*?)</nav>`)));
    const novih = FX.zahtevi.filter((r) => r.status === "new").length;
    const radniRed = `${novih} Radni red , ${fmt(t.red.noviBroj[srPluralCategory(novih)], { n: novih })}`;
    expect(nav(html).map((b) => [b.tekst, b.pritisnuto])).toEqual([[radniRed, "true"], ["Sala", "false"]]);
    expect(nav(html).every((b) => imaMin48(b))).toBe(true);
    expect(nav(panel({ pocetniPrikaz: "sala" })).map((b) => [b.tekst, b.pritisnuto])).toEqual([[radniRed, "false"], ["Sala", "true"]]);
  });

  test("the header: the venue, the count of active requests with the right plural, and Milan", () => {
    const zaglavlje = tekst(izdvoji(html, /(<header class="sticky[\s\S]*?<\/header>)/));
    for (const rec of [FX.lokal, "Milan", fmt(t.zaglavlje.aktivni.many, { n: 7 }), "7 aktivnih zahteva", clockTime(IZLOG_SADA)]) expect(zaglavlje).toContain(rec);
    expect(dugmad(html).some((b) => b.ime === fmt(t.zaglavlje.meniKorisnika, { ime: "Milan" }))).toBe(true);
    const brojevi = (n: number) => tekst(panel({ red: crveniRed(FX, { zahtevi: FX.zahtevi.slice(0, n) }) }));
    expect(brojevi(1)).toContain("1 aktivan zahtev");
    expect(brojevi(2)).toContain("2 aktivna zahteva");
    expect(brojevi(5)).toContain("5 aktivnih zahteva");
  });

  // K23 replaced the K22 placeholder ("Prikaz sale je u pripremi") with the real floor (sala.test.tsx);
  // without the floor's data yet, the section is an honest loading state, never a fake floor.
  test("the floor is the Sala section; until its data arrives it is a loading state, never a fake floor", () => {
    const sala = izdvoji(html, /(<section aria-labelledby="sala-naslov"[\s\S]*?<\/section>)/);
    expect(sala).toContain('data-sala="raspored"');
    expect(naslovi(html, 2)).toContain(t.sala.naslov);
    expect(sala).toContain('data-stanje="ucitavanje"');
    expect(sala).not.toContain("data-mesto");
    const bocni = (h: string) => izdvoji(h, /<div class="([^"]*)" data-bocni-pano/).split(" ");
    expect(bocni(html)).toContain("block");
    expect(bocni(panel({ pocetniPrikaz: "sala" }))).toContain("hidden");
  });

  test("the guest's cancellation is a strip with a close button; the staff's own is not", () => {
    const otkazan = FX.otkazani.find((o) => o.cancelledBy === "guest")!;
    expect(otkazan.positionLabel).toBe("Sto 8");
    const trake = [...html.matchAll(/<li role="status"[^>]*>([\s\S]*?)<\/li>/g)];
    expect(trake).toHaveLength(1);
    expect(tekst(trake[0][1])).toContain(fmt(t.red.otkazaoGost, { vrsta: d.requestKinds.order, mesto: "Sto 8", vreme: clockTime(pre(26)) }));
    expect(tekst(trake[0][1])).toContain("Otkazao gost: Porudžbina · Sto 8 · 18:01");
    expect(trake[0][0]).toContain("--mp-info-meko");
    expect(dugmad(trake[0][1])[0].ime).toBe(t.red.zatvoriObavestenje);
    expect(tekst(html)).not.toContain(`Otkazao gost: ${d.requestKinds.call}`);
    // Older than half an hour, or none at all: no strip.
    expect(panel({ red: crveniRed(FX, { otkazani: [{ ...otkazan, cancelledAt: pre(31) }] }) })).not.toContain('<li role="status"');
    expect(panel({ red: crveniRed(FX, { otkazani: [] }) })).not.toContain('<li role="status"');
  });

  test("RadniRed alone: the Rezervacije filter is honestly empty; a request in flight shows the spinner", () => {
    const rad = (extra: { radiId?: string; pocetniFilter?: "rezervacije" }) =>
      renderToStaticMarkup(
        <RadniRed red={crveniRed()} sadaMs={IZLOG_SADA} radiId={extra.radiId ?? null} onOtvori={NISTA} onRadnja={NISTA} radnjeIskljucene={false} obavestenja={[]} onZatvoriObavestenje={NISTA} pocetniFilter={extra.pocetniFilter} />,
      );
    // K25: still true while no reservation data is wired (`rezervacije` undefined = the K22 queue);
    // the wired Rezervacije filter (groups, cards, badge) is covered in rezervacije.test.tsx.
    const rezervacije = rad({ pocetniFilter: "rezervacije" });
    expect(naslovi(rezervacije, 2)).toEqual([t.red.praznoRezervacije.naslov]);
    expect(rezervacije).not.toContain("<article");
    expect(dugmad(rezervacije).map((b) => b.pritisnuto)).toEqual(["false", "false", "true"]);
    const uToku = rad({ radiId: "rq_01" });
    expect(kartica(uToku, "rq_01")).toContain('aria-busy="true"');
    expect(kartica(uToku, "rq_02")).not.toContain("aria-busy");
  });
});

// --- 3. Loading, empty, truncated and offline ---------------------------------------

describe("queue states", () => {
  test("loading: a skeleton in the shape of cards, announced as a status, no count yet", () => {
    const html = panel({ red: undefined });
    for (const dio of ['role="status"', 'data-stanje="ucitavanje"', 'data-oblik="kartice"']) expect(html).toContain(dio);
    expect(tekst(html)).toContain(z.ucitavanje);
    expect(html).not.toContain("<article");
    expect(tekst(html)).not.toContain(t.zaglavlje.bezAktivnih);
    expect(naslovi(html, 1)).toEqual([t.red.naslov]);
  });

  test("empty: says what is empty and what comes next, the header says no active requests", () => {
    const prazno = fixtureKonobar({ stanje: "prazno" });
    const html = panel({ red: crveniRed(prazno) }, prazno);
    expect(html).toContain('data-stanje="prazno"');
    expect(naslovi(html, 2)).toContain(t.red.prazno.naslov);
    expect(tekst(html)).toContain(t.red.prazno.opis);
    expect(tekst(html)).toContain(t.zaglavlje.bezAktivnih);
    expect(html).not.toContain("<article");
    expect(tekst(html)).not.toContain("najstariji novi");
  });

  test("many: 300 cards and the sentence that older ones are shown first", () => {
    const mnogo = fixtureKonobar({ stanje: "mnogo" });
    expect(mnogo.skraceno).toBe(true);
    const html = panel({ red: crveniRed(mnogo, { skraceno: true }) }, mnogo);
    expect(count(html, '<article data-zahtev="')).toBe(300);
    expect(tekst(html)).toContain(t.red.skraceno);
    expect(tekst(html)).toContain("300 aktivnih zahteva");
    expect(panel()).not.toContain(t.red.skraceno);
  });

  test("offline: the strip, every main action disabled, the titles still open", () => {
    const html = panel({ veza: "offline", poslednjaVezaMs: pre(2) });
    expect(html).toContain('data-stanje="offline"');
    expect(tekst(html)).toContain(z.offlineNaslov);
    expect(tekst(html)).toContain(fmt(z.offlineOpis, { vreme: "18:25" }));
    for (const r of FX.zahtevi) {
      const [naslov, radnja] = dugmad(kartica(html, r.id));
      expect(radnja.iskljuceno, r.id).toBe(true);
      expect(naslov.iskljuceno, r.id).toBe(false);
    }
    expect(tekst(panel({ veza: "offline" }))).toContain(z.offlineBezVremena);
    expect(panel()).not.toContain('data-stanje="offline"');
  });
});

// --- 4. The request detail ----------------------------------------------------------

describe("request detail: a new order (Sto 7)", () => {
  const podatak = podaci("rq_03");
  const html = prikazDetalja("rq_03");
  const sav = tekst(html);

  test("the title, the table and zone, the status, the two time cells and the source card", () => {
    expect(naslovi(html, 1)).toEqual(["Porudžbina · 3 stavke"]);
    expect(naslovi(html, 1)).toEqual([`${d.requestKinds.order} · ${fmt(t.red.stavke.few, { n: 3 })}`]);
    expect(podatak.request.zoneName).toBeTruthy();
    expect(sav).toContain(`Sto 7 · ${podatak.request.zoneName}`);
    expect(statusKartice(html)).toBe("Novi");
    expect(html).toContain('data-detalj="rq_03"');

    const celije = tekst(izdvoji(html, /(<dl class="grid grid-cols-2[\s\S]*?<\/dl>)/));
    expect(celije).toContain(`${t.detalj.stiglo} ${clockTime(pre(6, 10))}`);
    expect(celije).toContain("Vreme zahteva 18:20");
    expect(celije).toContain(`${t.detalj.ceka} 06:10`);

    expect(sav).toContain(`${t.detalj.izvor} QR kartica „7-A”`);
    expect(sav).toContain(fmt(t.detalj.kartica, { naziv: "7-A" }));
  });

  test("every line as it was sent: quantity, name, variant, add-ons, note, line price", () => {
    expect(naslovi(html, 2)).toContain(t.detalj.porudzbina);
    for (const stavka of podatak.items) {
      expect(sav).toContain(`${stavka.quantity} × ${stavka.name}`);
      if (stavka.variantName) expect(sav).toContain(`${stavka.name} · ${stavka.variantName}`);
      for (const dodatak of stavka.addons) expect(sav).toContain(`+ ${dodatak.optionName}`);
      if (stavka.note) expect(sav).toContain(fmt(t.detalj.napomena, { tekst: stavka.note }));
      expect(sav).toContain(fmt(t.detalj.iznos, { iznos: formatRsd(stavka.lineTotalRsd) }));
    }
    for (const red of ["1 × Mešano meso (za dvoje)", "+ Pomfrit", "+ Grilovano povrće", "Napomena: Bez ljutog, molimo.", "1 × Ćevapi · 10 komada", "2 × Točeno pivo · 0,5 l"]) {
      expect(sav).toContain(red);
    }
  });

  test("the informative total, with the thousands dot", () => {
    const ukupno = podatak.request.totalRsd!;
    expect(ukupno).toBe(podatak.items.reduce((suma, s) => suma + s.lineTotalRsd, 0));
    expect(formatRsd(ukupno)).toMatch(/^\d{1,3}(\.\d{3})+$/);
    expect(sav).toContain(`Ukupno (informativno) ${formatRsd(ukupno)} RSD`);
    expect(sav).not.toContain(t.detalj.dostava);
    expect(sav).not.toContain(t.detalj.medjuzbir);
  });

  test("a new request offers Preuzmi, Završi and Otkaži, all 48 px or more", () => {
    const radnje = [dugme(html, "Preuzmi zahtev"), dugme(html, "Završi zahtev"), dugme(html, "Otkaži zahtev")];
    expect(radnje.map((b) => b?.iskljuceno)).toEqual([false, false, false]);
    expect(radnje.every(imaMin48)).toBe(true);
    expect(dugme(html, t.detalj.nazad)?.ime).toBe(t.detalj.nazadCitac);
    expect(sav).not.toContain(t.detalj.otkaziPitanje);
  });

  test("the rest of the table lists the other open request of Sto 7", () => {
    expect(podatak.others.map((r) => r.id)).toEqual(["rq_12"]);
    const ostalo = izdvoji(html, /(<section aria-labelledby="detalj-ostalo"[\s\S]*?<\/section>)/);
    expect(naslovi(ostalo, 2)).toEqual([t.detalj.ostalo.table]);
    expect(naslovi(ostalo, 2)).toEqual(["Ostalo na ovom stolu"]);
    expect(dugmad(ostalo)).toHaveLength(1);
    expect(tekst(ostalo)).toContain("Račun · Gotovina");
    expect(tekst(ostalo)).toContain("Prihvaćen · Stefan");
    expect(tekst(ostalo)).toContain(fmt(t.vreme.par, { vreme: clockTime(pre(5)), ceka: "05:00" }));
    expect(tekst(prikazDetalja("rq_03", { detalj: { ...podatak, others: [] } }))).toContain(t.detalj.nemaOstalog);
  });
});

describe("request detail: other kinds and states", () => {
  test("the request is gone or not for this venue", () => {
    const html = prikazDetalja("rq_03", { detalj: null });
    expect(html).toContain('data-stanje="prazno"');
    expect(naslovi(html, 2)).toContain(t.detalj.nestao.naslov);
    expect(tekst(html)).toContain(t.detalj.nestao.opis);
    expect(dugme(html, t.detalj.nazad)?.ime).toBe(t.detalj.nazadCitac);
  });

  test("loading the request: a form skeleton, busy", () => {
    const html = prikazDetalja("rq_03", { detalj: undefined });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('data-oblik="forma"');
    expect(tekst(html)).toContain(t.detalj.ucitava);
    expect(html).not.toContain("data-detalj=");
  });

  test("a finished request: no actions, 'Završen u HH:MM', no waiting cell", () => {
    const html = prikazDetalja("rq_07");
    expect(FX.detalji.rq_07.request.status).toBe("done");
    expect(tekst(html)).toContain(fmt(t.detalj.zavrsen, { vreme: clockTime(pre(38)) }));
    expect(tekst(html)).toContain("Završen u 17:49");
    expect(statusKartice(html)).toBe(d.requestStatuses.done);
    for (const radnja of [t.detalj.preuzmi, t.detalj.zavrsi, t.detalj.otkazi, t.detalj.otkaziDa]) expect(dugme(html, radnja)).toBeUndefined();
    expect(tekst(izdvoji(html, /(<dl class="grid grid-cols-2[\s\S]*?<\/dl>)/))).not.toContain(t.detalj.ceka);
  });

  test("a request the guest cancelled says so; one the staff cancelled says that", () => {
    const gost = prikazDetalja("rq_10");
    expect(tekst(gost)).toContain(fmt(t.detalj.otkazanGost, { vreme: clockTime(pre(26)) }));
    expect(tekst(gost)).toContain("Gost je otkazao u 18:01");
    expect(statusKartice(gost)).toBe(d.requestStatuses.cancelled);
    expect(dugme(gost, t.detalj.zavrsi)).toBeUndefined();
    const osoblje = prikazDetalja("rq_11");
    expect(tekst(osoblje)).toContain("Otkazan u 18:07");
    expect(tekst(osoblje)).not.toContain("Gost je otkazao u");
    expect(dugme(osoblje, t.detalj.otkazi)).toBeUndefined();
  });

  test.each([
    { id: "rq_06", status: "Prihvaćen · Jelena", ime: "Jelena", pre: 4 },
    { id: "rq_05", status: "Prihvaćen · Vi", ime: "Vi", pre: 12 },
  ])("$id taken by $ime: no Preuzmi, but Završi; the page names who and since when", ({ id, status, ime, pre: minuta }) => {
    const html = prikazDetalja(id);
    expect(dugme(html, t.detalj.preuzmi)).toBeUndefined();
    expect(dugme(html, t.detalj.zavrsi)).toBeDefined();
    expect(dugme(html, t.detalj.otkazi)).toBeDefined();
    expect(statusKartice(html)).toBe(status);
    expect(tekst(html)).toContain(fmt(t.detalj.prihvacen, { ime, vreme: clockTime(pre(minuta)) }));
  });

  test("the cancel confirmation: the question, 'Da, otkaži' and 'Ne'; the opener is gone", () => {
    const html = prikazDetalja("rq_03", { pocetnaPotvrdaOtkaza: true });
    expect(tekst(html)).toContain("Otkazati ovaj zahtev?");
    expect(tekst(html)).toContain(t.detalj.otkaziOpis);
    for (const odgovor of [dugme(html, "Da, otkaži"), dugme(html, "Ne")]) {
      expect(odgovor?.iskljuceno).toBe(false);
      expect(imaMin48(odgovor)).toBe(true);
    }
    expect(dugme(html, t.detalj.otkazi)).toBeUndefined();
  });

  test("a bill shows the payment wish, no order lines", () => {
    const html = prikazDetalja("rq_02");
    expect(naslovi(html, 1)).toEqual(["Račun · Kartica"]);
    expect(tekst(html)).toContain(`${t.detalj.placanje} ${d.paymentPreferences.card}`);
    expect(tekst(html)).toContain("Plaćanje Kartica");
    expect(tekst(prikazDetalja("rq_12"))).toContain("Plaćanje Gotovina");
    expect(tekst(html)).not.toContain(t.detalj.ukupno);
    expect(naslovi(html, 2)).not.toContain(t.detalj.porudzbina);
  });

  test("a Room service order: the Room service heading, the items, the delivery fee and the total", () => {
    const html = prikazDetalja("rq_03", { detalj: SOBA });
    const zbir = SOBA.request.subtotalRsd!;
    expect(naslovi(html, 1)).toEqual([`${t.detalj.roomService} · ${fmt(t.red.stavke.few, { n: 3 })}`]);
    expect(naslovi(html, 2)).toContain("Room service");
    expect(naslovi(html, 2)).not.toContain(t.detalj.porudzbina);
    expect(naslovi(html, 2)).toContain(t.detalj.ostalo.room);
    expect(tekst(html)).toContain(`Dostava do sobe ${DOSTAVA} RSD`);
    expect(tekst(html)).toContain(`${t.detalj.medjuzbir} ${formatRsd(zbir)} RSD`);
    expect(tekst(html)).toContain(`Ukupno (informativno) ${formatRsd(zbir + DOSTAVA)} RSD`);
    expect(tekst(html)).toContain("Soba 108");
  });

  test("offline: the three actions wait, the reason stays next to them", () => {
    const html = prikazDetalja("rq_03", { veza: "offline" });
    for (const radnja of [t.detalj.preuzmi, t.detalj.zavrsi, t.detalj.otkazi]) expect(dugme(html, radnja)?.iskljuceno, radnja).toBe(true);
    expect(tekst(html)).toContain(t.detalj.offline);
    expect(html).toContain('aria-describedby="detalj-razlog"');
    expect(tekst(izdvoji(html, /(<header class="sticky[\s\S]*?<\/header>)/))).toContain(t.zaglavlje.bezVeze);
    expect(html).not.toContain('data-stanje="offline"');
  });
});

// --- 5. Words the panel never uses --------------------------------------------------

const ZABRANJENO = ["konobar je krenuo", "krenuo", "slobodan", "kuhinj", "preuzimanja"];

let ekraniKes: [string, string][] | undefined;
/** Every kind of screen once: PIN, queue, detail, the empty/loading/offline/many states, the izlog. */
function sviEkrani(): [string, string][] {
  const prazno = fixtureKonobar({ stanje: "prazno" });
  const mnogo = fixtureKonobar({ stanje: "mnogo" });
  ekraniKes ??= [
    ["pin", pin()],
    ["pin: pogresan", pin({ pocetnoStanje: { kind: "pogresan", attemptsLeft: 2 } })],
    ["pin: blokada", pin({ pocetnoStanje: { kind: "blokada", lockedUntil: pre(-14) }, izlogOd: IZLOG_SADA })],
    ["pin: bez peppera", pin({ pinDostupan: false, nalog: { ime: "Sanja M." }, onNalog: NISTA })],
    ["red", panel()],
    ["red: prazno", panel({ red: crveniRed(prazno) }, prazno)],
    ["red: ucitava", panel({ red: undefined })],
    ["red: offline", panel({ veza: "offline", poslednjaVezaMs: pre(2) })],
    ["red: mnogo", panel({ red: crveniRed(mnogo, { skraceno: true }) }, mnogo)],
    ["detalj: porudzbina", prikazDetalja("rq_03")],
    ["detalj: racun", prikazDetalja("rq_02")],
    ["detalj: zavrsen", prikazDetalja("rq_07")],
    ["detalj: potvrda", prikazDetalja("rq_03", { pocetnaPotvrdaOtkaza: true })],
    ["detalj: room service", prikazDetalja("rq_03", { detalj: SOBA })],
    ["izlog: pin", izlog({ ekran: "pin" })],
    ["izlog: red", izlog({})],
    ["izlog: detalj", izlog({ ekran: "detalj" })],
    ["izlog: menadzer", izlog({ uloga: "menadzer" })],
  ];
  return ekraniKes;
}

describe("words that must never appear", () => {
  test.each(ZABRANJENO)("no screen says '%s'", (rec) => {
    for (const [ime, html] of sviEkrani()) expect(html.toLowerCase().includes(rec), `${ime}: ${rec}`).toBe(false);
  });
});

// --- 6. The izlog -------------------------------------------------------------------

describe("izlog of the waiter panel", () => {
  test("the default is the work queue of Milan over the fixture", () => {
    const html = izlog({});
    expect(naslovi(html, 1)).toEqual([t.red.naslov]);
    expect(redosled(html)).toEqual(["rq_04", "rq_01", "rq_03", "rq_02", "rq_05", "rq_06", "rq_12"]);
    expect(tekst(html)).toContain("Milan");
    expect(statusKartice(kartica(html, "rq_05"))).toBe("Prihvaćen · Vi");
  });

  test("ekran=detalj opens the order at Sto 7; zahtev=rq_01 opens the call at Sto 3", () => {
    expect(naslovi(izlog({ ekran: "detalj" }), 1)).toEqual(["Porudžbina · 3 stavke"]);
    expect(tekst(izlog({ ekran: "detalj" }))).toContain("Sto 7");
    const poziv = izlog({ ekran: "detalj", zahtev: "rq_01" });
    expect(naslovi(poziv, 1)).toEqual([d.requestKinds.call]);
    expect(tekst(poziv)).toContain("Sto 3");
    expect(naslovi(izlog({ ekran: "detalj", zahtev: "rq_zz" }), 1)).toEqual(["Porudžbina · 3 stavke"]);
  });

  test("ekran=pin shows the PIN screen; stanje=bez-peppera the same without a keypad and with the account entrance", () => {
    const pinIzlog = izlog({ ekran: "pin" });
    expect(naslovi(pinIzlog, 1)).toEqual([t.pin.naslov]);
    expect(tastatura(pinIzlog)).toHaveLength(12);
    expect(tekst(pinIzlog)).not.toContain("Uđi kao");
    const html = izlog({ stanje: "bez-peppera" });
    expect(naslovi(html, 1)).toEqual([t.pin.naslov]);
    expect(tekst(html)).toContain(t.pin.bezPeppera);
    expect(html).not.toContain(`aria-label="${t.pin.tastatura}"`);
    expect(html).not.toContain("data-pin-polja");
    expect(dugme(html, "Uđi kao Sanja M.")).toBeDefined();
  });

  test("uloga=menadzer enters with the account: Sanja M. in the header, nobody's request is 'Vi'", () => {
    const html = izlog({ uloga: "menadzer" });
    expect(naslovi(html, 1)).toEqual([t.red.naslov]);
    expect(dugmad(html).some((b) => b.ime === fmt(t.zaglavlje.meniKorisnika, { ime: "Sanja M." }))).toBe(true);
    expect(tekst(html)).toContain("Sanja M.");
    expect(statusKartice(kartica(html, "rq_05"))).toBe("Prihvaćen · Milan");
    expect(dugmad(kartica(html, "rq_05"))[1].tekst).toBe(t.red.radnja.review);
    expect(dugme(izlog({ ekran: "pin", uloga: "menadzer" }), "Uđi kao Sanja M.")).toBeDefined();
  });

  test("the states of the izlog reach the real screens", () => {
    const blokada = izlog({ ekran: "pin", stanje: "blokada" });
    expect(upozorenja(blokada)[0]).toContain("Pokušajte ponovo u 18:41");
    expect(tastatura(blokada).every((b) => b.iskljuceno)).toBe(true);
    expect(upozorenja(izlog({ ekran: "pin", stanje: "pogresan-pin" }))).toEqual(["Pogrešan PIN · još 3 pokušaja"]);
    expect(izlog({ stanje: "offline" })).toContain('data-stanje="offline"');
    expect(izlog({ veza: "offline" })).toContain('data-stanje="offline"');
    expect(naslovi(izlog({ stanje: "prazno" }), 2)).toContain(t.red.prazno.naslov);
    expect(tekst(izlog({ stanje: "mnogo" }))).toContain(t.red.skraceno);
    expect(tekst(izlog({ ekran: "detalj", potvrda: "otkazi" }))).toContain(t.detalj.otkaziPitanje);
  });
});

// --- 7. Accessibility basics --------------------------------------------------------

describe("accessibility basics", () => {
  test("exactly one h1 on every screen", () => {
    for (const [ime, html] of sviEkrani()) expect(count(html, "<h1"), ime).toBe(1);
  });

  test("every button has visible text or an accessible name", () => {
    for (const [ime, html] of sviEkrani()) {
      for (const b of dugmad(html)) expect(b.tekst !== "" || (b.ime ?? "") !== "", `${ime}: ${JSON.stringify(b)}`).toBe(true);
    }
  });

  test("the queue card's two buttons are named for a screen reader: what, for which request", () => {
    const [naslov, radnja] = dugmad(kartica(panel(), "rq_01"));
    const mestoPoziva = mesto(zahtevPo("rq_01"));
    expect(naslov.ime).toBe(fmt(t.red.otvori, { vrsta: d.requestKinds.call, mesto: mestoPoziva }));
    expect(radnja.ime).toBe(fmt(t.red.radnjaCitac, { radnja: "Preuzmi", vrsta: d.requestKinds.call, mesto: mestoPoziva }));
  });

  test("the panel has a polite live region (empty on the first render: what is already there is not news)", () => {
    expect(panel()).toContain('<p aria-live="polite" aria-atomic="true" class="sr-only"></p>');
    expect(panel({ red: undefined })).toContain('aria-live="polite"');
    expect(pin()).toContain('aria-live="polite"');
  });
});
