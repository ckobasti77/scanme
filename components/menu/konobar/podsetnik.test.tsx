// K27 render tests: the quiet reminder strip of the waiter panel
// (components/menu/konobar/obavestenja.tsx; master §13.5, plan K24-20): the
// reminder Operativa sends to the PIN waiter who took a request. Server markup
// only (renderToStaticMarkup), as in konobar.test.tsx: the clock stands at
// IZLOG_SADA (18:27). The strip is calm: INFO tone, no sound, no pulse, a
// polite live region per row. Invented data only.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { fixtureKonobar } from "@/components/menu/fixtures/konobar";
import { IZLOG_SADA } from "@/components/menu/fixtures/lokal";
import { KonobarIzlog } from "@/components/menu/izlog/konobar-izlog";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { parseKonobarPreview } from "@/lib/menu/izlog-params";
import { MENU_STAFF_NOTICE_VISIBLE_MS } from "@/lib/menu/limits";
import type { KonobarPodsetnik, KonobarRadnje } from "./model";
import { Podsetnici, vidljiviPodsetnici } from "./obavestenja";
import { KonobarPanel, type KonobarPanelProps } from "./panel";

const t = menuKonobarSr.podsetnik;
const d = menuDomenSr;

// --- Helpers (as in konobar.test.tsx) ------------------------------------------------

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

const tekst = (html: string) =>
  unesc(html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const count = (html: string, needle: string) => html.split(needle).length - 1;

function attr(otvor: string, ime: string): string | undefined {
  const value = new RegExp(`\\s${ime}="([^"]*)"`).exec(otvor)?.[1];
  return value === undefined ? undefined : unesc(value);
}

type DugmeMarkup = { tekst: string; ime: string | undefined; iskljuceno: boolean; klase: string };

const dugmad = (html: string): DugmeMarkup[] =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(([, otvor, unutra]) => ({
    tekst: tekst(unutra),
    ime: attr(otvor, "aria-label"),
    iskljuceno: /\sdisabled=""/.test(otvor),
    klase: attr(otvor, "class") ?? "",
  }));

const imaMin48 = (b: DugmeMarkup | undefined) => /\bmin-h-(12|14|16)\b/.test(b?.klase ?? "");

/** The strip itself: the list with its rows. */
function traka(html: string): string {
  const unutra = /(<ul\b[^>]*data-podsetnici[^>]*>[\s\S]*?<\/ul>)/.exec(html)?.[1];
  if (unutra === undefined) throw new Error("the reminder strip is not in the markup");
  return unutra;
}

const pre = (min: number) => IZLOG_SADA - min * 60_000;
const NISTA = () => undefined;

const PODSETNIK: KonobarPodsetnik = {
  id: "nt_01",
  requestId: "rq_03",
  kind: "order",
  positionLabel: "Sto 7",
  requestCreatedAt: pre(15),
  createdAt: pre(2),
  from: "Jelena",
};

function prikazi(stavke: readonly KonobarPodsetnik[], preko: Partial<Parameters<typeof Podsetnici>[0]> = {}): string {
  return renderToStaticMarkup(<Podsetnici stavke={stavke} sadaMs={IZLOG_SADA} onOtvori={NISTA} onURedu={NISTA} {...preko} />);
}

// --- The strip ------------------------------------------------------------------------

describe("Podsetnici: the strip", () => {
  test("a reminder with a name says who reminds, which request, where and since when", () => {
    const html = prikazi([PODSETNIK]);
    const rec = fmt(t.tekst, { ko: "Jelena", vrsta: d.requestKinds.order, mesto: "Sto 7", vreme: clockTime(PODSETNIK.requestCreatedAt) });
    expect(tekst(traka(html))).toContain(rec);
    // K27 review (intentional): was the literal "Jelena podseća: Porudžbina · Sto 7 · čeka od 18:12"; the sentence now names
    // Operativa first and the sender in brackets. The test follows the dictionary and checks the four facts are in it.
    for (const deo of ["Jelena", "Porudžbina", "Sto 7", "18:12"]) expect(rec, deo).toContain(deo);
  });

  test("a reminder without a name says only that it came from Operativa", () => {
    for (const from of ["", "   "]) {
      const html = prikazi([{ ...PODSETNIK, from }]);
      const rec = fmt(t.tekstBezImena, { vrsta: d.requestKinds.order, mesto: "Sto 7", vreme: "18:12" });
      expect(tekst(traka(html)), JSON.stringify(from)).toContain(rec);
      expect(rec).toBe("Podsetnik iz Operative: Porudžbina · Sto 7 · čeka od 18:12");
      expect(tekst(traka(html))).not.toContain("podseća");
    }
  });

  test("every kind of request is named by the dictionary", () => {
    for (const kind of ["call", "bill", "order"] as const) {
      expect(tekst(prikazi([{ ...PODSETNIK, kind }]))).toContain(d.requestKinds[kind]);
    }
  });

  test("the time is the request's own, in Belgrade (not the reminder's)", () => {
    const html = prikazi([{ ...PODSETNIK, requestCreatedAt: pre(47), createdAt: pre(1) }]);
    expect(tekst(html)).toContain("čeka od 17:40");
  });

  test("buttons: `Otvori` and `U redu`, each with a reader name that says which request, 48 px high", () => {
    const [otvori, uRedu, ...ostalo] = dugmad(prikazi([PODSETNIK]));
    expect(ostalo).toEqual([]);
    expect(otvori.tekst).toBe(t.otvori);
    expect(otvori.ime).toBe(fmt(t.otvoriCitac, { vrsta: "Porudžbina", mesto: "Sto 7" }));
    expect(otvori.ime).toBe("Otvori zahtev: Porudžbina, Sto 7");
    expect(uRedu.tekst).toBe(t.uRedu);
    expect(uRedu.ime).toBe(fmt(t.uReduCitac, { vrsta: "Porudžbina", mesto: "Sto 7" }));
    expect(uRedu.ime).toBe("U redu, podsetnik za Porudžbina, Sto 7");
    expect(imaMin48(otvori)).toBe(true);
    expect(imaMin48(uRedu)).toBe(true);
    expect(otvori.iskljuceno).toBe(false);
    expect(uRedu.iskljuceno).toBe(false);
  });

  test("`U redu` looks like a button: the secondary style with a visible border, like `Otvori` (not the borderless quiet style)", () => {
    const [otvori, uRedu] = dugmad(prikazi([PODSETNIK]));
    for (const dugme of [otvori, uRedu]) {
      expect(dugme.klase, dugme.tekst).toContain("[--border:var(--mp-ivica-kontrole)]");
      expect(dugme.klase, dugme.tekst).not.toContain("[--border:transparent]");
    }
  });

  test("offline: closing needs the connection and is disabled; opening the request still works", () => {
    const [otvori, uRedu] = dugmad(prikazi([PODSETNIK], { iskljuceno: true }));
    expect(uRedu.iskljuceno).toBe(true);
    expect(otvori.iskljuceno).toBe(false);
  });

  test("each row is a polite status, the list is named, the icon is decorative", () => {
    const html = traka(prikazi([PODSETNIK, { ...PODSETNIK, id: "nt_02", requestId: "rq_05", positionLabel: "Sto 3", kind: "call" }]));
    expect(count(html, 'role="status"')).toBe(2);
    expect(count(html, "<li ")).toBe(2);
    expect(attr(html.slice(0, html.indexOf(">")), "aria-label")).toBe(t.oznaka);
    expect(t.oznaka).toBe("Podsetnici");
    const ikonice = [...html.matchAll(/<svg\b([^>]*)>/g)].map((m) => m[1]);
    expect(ikonice).toHaveLength(2);
    for (const ikonica of ikonice) expect(attr(ikonica, "aria-hidden")).toBe("true");
    // Two rows, two pairs of buttons, each pair naming its own request.
    expect(dugmad(html).map((b) => b.ime)).toEqual([
      "Otvori zahtev: Porudžbina, Sto 7",
      "U redu, podsetnik za Porudžbina, Sto 7",
      "Otvori zahtev: Poziv konobara, Sto 3",
      "U redu, podsetnik za Poziv konobara, Sto 3",
    ]);
  });

  test("calm: INFO tone, no sound element, no pulse or blink", () => {
    const html = prikazi([PODSETNIK]);
    expect(html).toContain("--mp-info-meko");
    expect(html).not.toMatch(/<audio\b/);
    expect(html).not.toMatch(/animate-|pulse|blink/i);
    expect(html).not.toContain("aria-live=\"assertive\"");
    expect(html).not.toContain('role="alert"');
  });

  test("the module has no sound at all (no sound hook, no Audio, no animation library)", () => {
    const izvor = readFileSync(join(process.cwd(), "components/menu/konobar/obavestenja.tsx"), "utf8");
    for (const zabranjeno of ["zvuk", "zvoni", "Audio", "audio", "framer-motion", "gsap", "animate-"]) {
      expect(izvor, zabranjeno).not.toContain(zabranjeno);
    }
  });

  test("nothing to show renders nothing at all", () => {
    expect(prikazi([])).toBe("");
    expect(prikazi([{ ...PODSETNIK, createdAt: IZLOG_SADA - MENU_STAFF_NOTICE_VISIBLE_MS - 1 }])).toBe("");
  });

  test("a reminder older than 30 minutes is not shown, a newer one next to it is", () => {
    const stara = { ...PODSETNIK, id: "nt_old", createdAt: pre(31), positionLabel: "Sto 9" };
    const html = prikazi([PODSETNIK, stara]);
    expect(count(html, 'role="status"')).toBe(1);
    expect(tekst(html)).toContain("Sto 7");
    expect(tekst(html)).not.toContain("Sto 9");
  });
});

// --- vidljiviPodsetnici -----------------------------------------------------------------

describe("vidljiviPodsetnici", () => {
  const NIJEDAN: ReadonlySet<string> = new Set();
  const stavka = (id: string, minuta: number): KonobarPodsetnik => ({ ...PODSETNIK, id, createdAt: pre(minuta) });

  test("drops what was sent more than 30 minutes ago", () => {
    const sve = [stavka("a", 0), stavka("b", 10), stavka("c", 29), stavka("d", 31), stavka("e", 120)];
    expect(vidljiviPodsetnici(sve, IZLOG_SADA, NIJEDAN).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("the limit is the server's constant: exactly 30 minutes is still shown, one millisecond more is not", () => {
    expect(MENU_STAFF_NOTICE_VISIBLE_MS).toBe(30 * 60_000);
    const tacno = { ...PODSETNIK, id: "tacno", createdAt: IZLOG_SADA - MENU_STAFF_NOTICE_VISIBLE_MS };
    const preko = { ...PODSETNIK, id: "preko", createdAt: IZLOG_SADA - MENU_STAFF_NOTICE_VISIBLE_MS - 1 };
    expect(vidljiviPodsetnici([tacno, preko], IZLOG_SADA, NIJEDAN).map((s) => s.id)).toEqual(["tacno"]);
  });

  test("it ages with the device clock: the same reminder is shown now and gone half an hour later", () => {
    const jedna = [stavka("a", 2)];
    expect(vidljiviPodsetnici(jedna, IZLOG_SADA, NIJEDAN)).toHaveLength(1);
    expect(vidljiviPodsetnici(jedna, IZLOG_SADA + 28 * 60_000, NIJEDAN)).toHaveLength(1);
    expect(vidljiviPodsetnici(jedna, IZLOG_SADA + 29 * 60_000, NIJEDAN)).toHaveLength(0);
  });

  test("drops the ones closed on this device, keeps the rest in the server's order", () => {
    const sve = [stavka("a", 1), stavka("b", 2), stavka("c", 3)];
    expect(vidljiviPodsetnici(sve, IZLOG_SADA, new Set(["b"])).map((s) => s.id)).toEqual(["a", "c"]);
    expect(vidljiviPodsetnici(sve, IZLOG_SADA, new Set(["a", "b", "c"]))).toEqual([]);
    expect(vidljiviPodsetnici(sve, IZLOG_SADA, new Set(["zzz"])).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  test("a reminder from a clock slightly ahead of the device is not hidden", () => {
    const izBuducnosti = { ...PODSETNIK, createdAt: IZLOG_SADA + 5_000 };
    expect(vidljiviPodsetnici([izBuducnosti], IZLOG_SADA, NIJEDAN)).toHaveLength(1);
  });

  test("an empty list stays empty and the input is not changed", () => {
    expect(vidljiviPodsetnici([], IZLOG_SADA, NIJEDAN)).toEqual([]);
    const ulaz = [stavka("a", 40), stavka("b", 1)];
    const kopija = structuredClone(ulaz);
    vidljiviPodsetnici(ulaz, IZLOG_SADA, new Set(["b"]));
    expect(ulaz).toEqual(kopija);
  });
});

// --- In the panel -------------------------------------------------------------------------

const FX = fixtureKonobar();
const ishod = (status: "accepted" | "done" | "cancelled") => async () => ({ ok: true as const, status, changed: true });
const salaIshod = async () => ({ ok: true as const, changed: true });
const rezIshod = async () => ({ ok: true as const, status: "accepted" as const, changed: true });
const RADNJE: KonobarRadnje = {
  preuzmi: ishod("accepted"),
  zavrsi: ishod("done"),
  otkazi: ishod("cancelled"),
  odjava: NISTA,
  postaviZauzetost: salaIshod,
  postaviMojuZonu: salaIshod,
  postaviZonuOsoblja: salaIshod,
  prihvatiRezervaciju: rezIshod,
  odbijRezervaciju: rezIshod,
  predloziIzmenu: rezIshod,
  gostPrihvataPredlog: rezIshod,
  otkaziRezervaciju: rezIshod,
  poveziSto: rezIshod,
  gostiStigli: rezIshod,
};

function panel(podsetnici: KonobarPodsetnik[] | undefined, preko: Partial<KonobarPanelProps> = {}): string {
  return renderToStaticMarkup(
    <KonobarPanel
      lokal={FX.lokal}
      korisnik={FX.korisnik}
      red={{ zahtevi: FX.zahtevi, skraceno: false, otkazani: FX.otkazani, podsetnici }}
      izabranId={null}
      detalj={undefined}
      onIzaberi={NISTA}
      radnje={RADNJE}
      veza="online"
      pocetnoMs={IZLOG_SADA}
      izlogOd={IZLOG_SADA}
      {...preko}
    />,
  );
}

describe("the waiter panel with reminders", () => {
  test("the strip stands in the queue; without reminders (or without the field) there is none", () => {
    expect(panel([PODSETNIK])).toContain("data-podsetnici");
    // K27 review (intentional): was the literal "Jelena podseća: Porudžbina · Sto 7"; now the dictionary's sentence.
    expect(tekst(traka(panel([PODSETNIK])))).toContain(
      fmt(t.tekst, { ko: "Jelena", vrsta: d.requestKinds.order, mesto: "Sto 7", vreme: clockTime(PODSETNIK.requestCreatedAt) }),
    );
    expect(panel([])).not.toContain("data-podsetnici");
    expect(panel(undefined)).not.toContain("data-podsetnici");
  });

  test("an old reminder is not shown in the panel either", () => {
    expect(panel([{ ...PODSETNIK, createdAt: pre(45) }])).not.toContain("data-podsetnici");
  });

  test("it stands above the offline strip, and offline only closing is disabled", () => {
    const html = panel([PODSETNIK], { veza: "offline" });
    const odPodsetnika = html.indexOf("data-podsetnici");
    expect(odPodsetnika).toBeGreaterThan(-1);
    // The offline strip of the queue follows the reminders in the same stack.
    expect(html.indexOf('data-stanje="offline"', odPodsetnika)).toBeGreaterThan(odPodsetnika);
    const [otvori, uRedu] = dugmad(traka(html));
    expect(otvori.iskljuceno).toBe(false);
    expect(uRedu.iskljuceno).toBe(true);
    // Online both are active.
    expect(dugmad(traka(panel([PODSETNIK]))).every((b) => !b.iskljuceno)).toBe(true);
  });

  test("a request detail does not carry the strip (it belongs to the queue)", () => {
    const rq = FX.detalji["rq_03"];
    const html = panel([PODSETNIK], { izabranId: "rq_03", detalj: { ...rq, others: [] } });
    expect(html).not.toContain("data-podsetnici");
  });

  test("the panel itself adds no sound element for a reminder", () => {
    expect(panel([PODSETNIK])).not.toMatch(/<audio\b/);
  });
});

// --- The izlog (`ping=1`) --------------------------------------------------------------------

const izlog = (upit: Parameters<typeof parseKonobarPreview>[0]) => renderToStaticMarkup(<KonobarIzlog params={parseKonobarPreview(upit)} />);

describe("the waiter izlog with ping=1", () => {
  test("ping=1 shows one reminder for an order Milan has accepted, sent by Jelena", () => {
    const html = izlog({ ping: "1" });
    const rec = tekst(traka(html));
    // rq_05: the order at Sto 3, accepted by Milan, waiting since 18:13 (14 minutes before 18:27).
    // K27 review (intentional): was the literal "Jelena podseća: Porudžbina · Sto 3 · čeka od 18:13"; now the dictionary's sentence.
    expect(rec).toContain(fmt(t.tekst, { ko: "Jelena", vrsta: d.requestKinds.order, mesto: "Sto 3", vreme: "18:13" }));
    expect(count(traka(html), 'role="status"')).toBe(1);
    expect(dugmad(traka(html)).map((b) => b.ime)).toEqual([
      "Otvori zahtev: Porudžbina, Sto 3",
      "U redu, podsetnik za Porudžbina, Sto 3",
    ]);
  });

  test("without ping=1 there is no strip, and the queue is the same as before", () => {
    for (const upit of [{}, { ping: "0" }, { ping: "poslat" }]) {
      const html = izlog(upit);
      expect(html, JSON.stringify(upit)).not.toContain("data-podsetnici");
      expect(tekst(html), JSON.stringify(upit)).not.toContain("podseća");
      expect(tekst(html), JSON.stringify(upit)).not.toContain("Podsetnik iz Operative");
    }
  });

  test("the izlog stays silent: no sound element", () => {
    expect(izlog({ ping: "1" })).not.toMatch(/<audio\b/);
  });

  test("no reminder when the waiter holds nothing (empty venue) or signs in as an account", () => {
    expect(izlog({ ping: "1", stanje: "prazno" })).not.toContain("data-podsetnici");
    expect(izlog({ ping: "1", uloga: "menadzer" })).not.toContain("data-podsetnici");
  });
});
