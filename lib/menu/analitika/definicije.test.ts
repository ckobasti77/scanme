// @vitest-environment node
//
// ScanMe Menu V1 (K29) — the analytics definitions as code
// (docs/menu/ANALITIKA-DEFINICIJE.md is the text the panel explains from).
// Node environment: the doc-consistency tests read the markdown and the test
// files from disk.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  DEFINICIJE,
  DIMENZIJE,
  KLIJENTSKE_VRSTE,
  KORACI,
  KORAK_METRIKA,
  MAX_DANA_PERIODA,
  MAX_DOGADJAJA_PO_POZIVU,
  MAX_VREDNOSTI_PO_DIMENZIJI,
  MENU_ANALYTICS_DAILY_MONTHS,
  MENU_ANALYTICS_RAW_DAYS,
  MENU_ANALYTICS_SESSION_GAP_MS,
  MENU_ANALYTICS_SESSION_KEEP_MS,
  METRIKE,
  MIN_IMENILAC,
  MIN_POKRIVENOST_SESIJA,
  SERVERSKE_VRSTE,
  UREDJAJI,
  doprinosi,
  koraciSesije,
  pokrivenostSesija,
  procenat,
  sesijePouzdane,
  type Metrika,
  type SiroviDogadjaj,
} from "./definicije";

const PG = "pg_5k2m9q0x7c1d";
const AR = "ar_5k2m9q0x7c1d";
const KARTICA = "k123456789ab";
const SESIJA = "abcdefghjkmnpqrs";

function dogadjaj(dopuna: Partial<SiroviDogadjaj> & Pick<SiroviDogadjaj, "vrsta">): SiroviDogadjaj {
  return { occurredAt: Date.UTC(2026, 9, 21, 12, 0, 0), dayKey: "2026-10-21", sat: 14, ...dopuna };
}

// -----------------------------------------------------------------------------
// The rule of 20
// -----------------------------------------------------------------------------

describe("procenat", () => {
  test("[pravilo-20] a denominator below 20 gives null, whatever the numerator", () => {
    expect(procenat(5, 19)).toBeNull();
    expect(procenat(19, 19)).toBeNull();
    expect(procenat(0, 19)).toBeNull();
    expect(procenat(1, 1)).toBeNull();
  });

  test("[pravilo-20] a denominator of exactly 20 is enough", () => {
    expect(procenat(10, 20)).toBe(50);
    expect(typeof procenat(1, 20)).toBe("number");
  });

  test("[pravilo-20] a zero or invalid denominator gives null, never a division by zero", () => {
    expect(procenat(0, 0)).toBeNull();
    expect(procenat(5, 0)).toBeNull();
    expect(procenat(5, Number.NaN)).toBeNull();
    expect(procenat(5, Number.POSITIVE_INFINITY)).toBeNull();
    expect(procenat(5, -30)).toBeNull();
  });

  test("[pravilo-20] a numerator of 0 is 0 percent (not null) with enough in the denominator", () => {
    expect(procenat(0, 20)).toBe(0);
    expect(procenat(0, 1000)).toBe(0);
  });

  test("[pravilo-20] rounds to one decimal", () => {
    expect(procenat(1, 30)).toBe(3.3);
    expect(procenat(2, 30)).toBe(6.7);
    expect(procenat(1, 21)).toBe(4.8);
    expect(procenat(1, 40)).toBe(2.5);
    expect(procenat(1, 200)).toBe(0.5);
    expect(procenat(7, 20)).toBe(35);
  });

  test("[pravilo-20] never above 100, even when the outcome count exceeds the sent count", () => {
    expect(procenat(20, 20)).toBe(100);
    expect(procenat(25, 20)).toBe(100);
    expect(procenat(1_000_000, 20)).toBe(100);
  });

  test("[pravilo-20] a negative numerator counts as 0", () => {
    expect(procenat(-5, 20)).toBe(0);
  });

  test("[pravilo-20] the minimum denominator is 20", () => {
    expect(MIN_IMENILAC).toBe(20);
  });
});

// -----------------------------------------------------------------------------
// Reliable sessions
// -----------------------------------------------------------------------------

describe("pokrivenostSesija / sesijePouzdane", () => {
  test("[sesije-pouzdane] coverage is the share of opens with a session id", () => {
    expect(pokrivenostSesija(95, 100)).toBe(0.95);
    expect(pokrivenostSesija(50, 100)).toBe(0.5);
    expect(pokrivenostSesija(0, 10)).toBe(0);
    expect(pokrivenostSesija(10, 10)).toBe(1);
  });

  test("[sesije-pouzdane] coverage is null without opens (no division by zero)", () => {
    expect(pokrivenostSesija(0, 0)).toBeNull();
    expect(pokrivenostSesija(5, 0)).toBeNull();
    expect(pokrivenostSesija(5, -1)).toBeNull();
  });

  test("[sesije-pouzdane] coverage never exceeds 1", () => {
    expect(pokrivenostSesija(150, 100)).toBe(1);
  });

  test("[sesije-pouzdane] 95 of 100 is reliable, 94 of 100 is not", () => {
    expect(MIN_POKRIVENOST_SESIJA).toBe(0.95);
    expect(sesijePouzdane(95, 100)).toBe(true);
    expect(sesijePouzdane(94, 100)).toBe(false);
  });

  test("[sesije-pouzdane] the 95% boundary holds for other denominators", () => {
    expect(sesijePouzdane(19, 20)).toBe(true);
    expect(sesijePouzdane(18, 20)).toBe(false);
    expect(sesijePouzdane(190, 200)).toBe(true);
    expect(sesijePouzdane(189, 200)).toBe(false);
    expect(sesijePouzdane(950, 1000)).toBe(true);
    expect(sesijePouzdane(949, 1000)).toBe(false);
  });

  test("[sesije-pouzdane] every open with a session id is reliable; none is not", () => {
    expect(sesijePouzdane(100, 100)).toBe(true);
    expect(sesijePouzdane(0, 100)).toBe(false);
  });

  test("[sesije-pouzdane] no opens at all is not reliable (null coverage)", () => {
    expect(sesijePouzdane(0, 0)).toBe(false);
    expect(sesijePouzdane(3, 0)).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// What one raw event counts in
// -----------------------------------------------------------------------------

describe("doprinosi", () => {
  test("[otvaranja] a page open counts in otvaranja with page, card, language, device and hour (the hour as a string)", () => {
    const izlaz = doprinosi(
      dogadjaj({ vrsta: "stranica", stranica: PG, kartica: KARTICA, jezik: "sr", uredjaj: "telefon", sat: 14 }),
    );
    expect(izlaz).toStrictEqual([
      {
        metrika: "otvaranja",
        dimenzije: { stranica: PG, kartica: KARTICA, jezik: "sr", uredjaj: "telefon", sat: "14" },
      },
    ]);
  });

  test("[otvaranja] otvaranjaSaSesijom is added only when the event carries a session", () => {
    const bez = doprinosi(dogadjaj({ vrsta: "stranica", stranica: PG, jezik: "sr", uredjaj: "racunar" }));
    expect(bez.map((d) => d.metrika)).toEqual(["otvaranja"]);

    const sa = doprinosi(dogadjaj({ vrsta: "stranica", stranica: PG, jezik: "sr", uredjaj: "racunar", sesija: SESIJA }));
    expect(sa.map((d) => d.metrika)).toEqual(["otvaranja", "otvaranjaSaSesijom"]);
    expect(sa[1]).toStrictEqual({ metrika: "otvaranjaSaSesijom", dimenzije: {} });
  });

  test("[otvaranja] missing optional breakdowns are left out, not stored as undefined", () => {
    const [otvaranje] = doprinosi(dogadjaj({ vrsta: "stranica", stranica: PG }));
    expect(otvaranje.dimenzije).toStrictEqual({ stranica: PG, sat: "14" });
  });

  test("[otvaranja] an empty string is left out and the hour 0 (midnight) is kept as \"0\"", () => {
    const [otvaranje] = doprinosi(dogadjaj({ vrsta: "stranica", stranica: PG, kartica: "", jezik: "", sat: 0 }));
    expect(otvaranje.dimenzije).toStrictEqual({ stranica: PG, sat: "0" });
  });

  test("[otvaranja] fields that belong to other events (article, request kind, channel) never become breakdowns", () => {
    const [otvaranje] = doprinosi(
      dogadjaj({ vrsta: "stranica", stranica: PG, artikal: AR, zahtev: "order", kanal: "standard", ko: "guest", korak: "zahtev" }),
    );
    expect(Object.keys(otvaranje.dimenzije).sort()).toEqual(["sat", "stranica"]);
  });

  test("[detalji] an article detail counts in detalji with article, page, language, device and hour", () => {
    const izlaz = doprinosi(
      dogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR, jezik: "en", uredjaj: "tablet", sat: 9, kartica: KARTICA }),
    );
    expect(izlaz).toStrictEqual([
      {
        metrika: "detalji",
        dimenzije: { artikal: AR, stranica: PG, jezik: "en", uredjaj: "tablet", sat: "9" },
      },
    ]);
  });

  test("[detalji] a detail with a session does not count as a menu open", () => {
    const izlaz = doprinosi(dogadjaj({ vrsta: "detalj", stranica: PG, artikal: AR, sesija: SESIJA }));
    expect(izlaz.map((d) => d.metrika)).toEqual(["detalji"]);
  });

  test("[detalji] a step event counts in no daily metric (sessions are added by the rollup)", () => {
    expect(doprinosi(dogadjaj({ vrsta: "korak", korak: "zahtev", sesija: SESIJA }))).toEqual([]);
    expect(doprinosi(dogadjaj({ vrsta: "korak", korak: "porudzbina", sesija: SESIJA }))).toEqual([]);
    expect(doprinosi(dogadjaj({ vrsta: "korak" }))).toEqual([]);
  });

  test("[zahtevi] a sent order counts in zahtevi AND in porudzbine (by channel)", () => {
    const izlaz = doprinosi(
      dogadjaj({ vrsta: "zahtev_poslat", zahtev: "order", kanal: "standard", kartica: KARTICA, sat: 20 }),
    );
    expect(izlaz).toStrictEqual([
      { metrika: "zahtevi", dimenzije: { zahtev: "order", kanal: "standard", kartica: KARTICA, sat: "20" } },
      { metrika: "porudzbine", dimenzije: { kanal: "standard" } },
    ]);
  });

  test("[zahtevi] an order from Room service carries its channel into porudzbine", () => {
    const izlaz = doprinosi(dogadjaj({ vrsta: "zahtev_poslat", zahtev: "order", kanal: "room_service" }));
    expect(izlaz.map((d) => d.metrika)).toEqual(["zahtevi", "porudzbine"]);
    expect(izlaz[1].dimenzije).toStrictEqual({ kanal: "room_service" });
  });

  test.each(["call", "bill"] as const)("[zahtevi] a sent %s counts only in zahtevi", (zahtev) => {
    const izlaz = doprinosi(dogadjaj({ vrsta: "zahtev_poslat", zahtev, kanal: "standard", sat: 12 }));
    expect(izlaz).toStrictEqual([
      { metrika: "zahtevi", dimenzije: { zahtev, kanal: "standard", sat: "12" } },
    ]);
  });

  test("[zahtevi] the card is left out when the request did not come from a card", () => {
    const [zahtev] = doprinosi(dogadjaj({ vrsta: "zahtev_poslat", zahtev: "call", kanal: "standard" }));
    expect(zahtev.dimenzije).toStrictEqual({ zahtev: "call", kanal: "standard", sat: "14" });
  });

  test("[zahtevi] accepted and finished requests keep kind and channel only, and an order outcome is not a new order", () => {
    expect(doprinosi(dogadjaj({ vrsta: "zahtev_prihvacen", zahtev: "order", kanal: "standard", kartica: KARTICA, ko: "staff" }))).toStrictEqual([
      { metrika: "zahteviPrihvaceni", dimenzije: { zahtev: "order", kanal: "standard" } },
    ]);
    expect(doprinosi(dogadjaj({ vrsta: "zahtev_zavrsen", zahtev: "bill", kanal: "room_service" }))).toStrictEqual([
      { metrika: "zahteviZavrseni", dimenzije: { zahtev: "bill", kanal: "room_service" } },
    ]);
  });

  test("[zahtevi] a cancelled request carries who cancelled it (guest or staff)", () => {
    expect(doprinosi(dogadjaj({ vrsta: "zahtev_otkazan", zahtev: "call", kanal: "standard", ko: "guest" }))).toStrictEqual([
      { metrika: "zahteviOtkazani", dimenzije: { zahtev: "call", kanal: "standard", ko: "guest" } },
    ]);
    expect(doprinosi(dogadjaj({ vrsta: "zahtev_otkazan", zahtev: "order", kanal: "standard", ko: "staff" }))).toStrictEqual([
      { metrika: "zahteviOtkazani", dimenzije: { zahtev: "order", kanal: "standard", ko: "staff" } },
    ]);
  });

  test("[rezervacije] a submitted reservation request counts by hour", () => {
    expect(doprinosi(dogadjaj({ vrsta: "rezervacija_poslata", sat: 20 }))).toStrictEqual([
      { metrika: "rezervacije", dimenzije: { sat: "20" } },
    ]);
  });

  test.each([
    ["rezervacija_prihvacena", "rezervacijePrihvacene"],
    ["rezervacija_odbijena", "rezervacijeOdbijene"],
    ["rezervacija_predlog", "rezervacijePredlozi"],
    ["rezervacija_realizovana", "rezervacijeRealizovane"],
  ] as const)("[rezervacije] %s counts in %s with no breakdown", (vrsta, metrika) => {
    expect(doprinosi(dogadjaj({ vrsta, ko: "staff", sat: 21 }))).toStrictEqual([{ metrika, dimenzije: {} }]);
  });

  test("[rezervacije] a cancelled reservation carries who cancelled it", () => {
    expect(doprinosi(dogadjaj({ vrsta: "rezervacija_otkazana", ko: "guest" }))).toStrictEqual([
      { metrika: "rezervacijeOtkazane", dimenzije: { ko: "guest" } },
    ]);
    expect(doprinosi(dogadjaj({ vrsta: "rezervacija_otkazana", ko: "staff" }))[0].dimenzije).toStrictEqual({ ko: "staff" });
    expect(doprinosi(dogadjaj({ vrsta: "rezervacija_otkazana" }))[0].dimenzije).toStrictEqual({});
  });

  test.each([
    ["zahtev_poslat", "zahtevi"],
    ["zahtev_prihvacen", "zahteviPrihvaceni"],
    ["zahtev_zavrsen", "zahteviZavrseni"],
    ["zahtev_otkazan", "zahteviOtkazani"],
    ["rezervacija_poslata", "rezervacije"],
    ["rezervacija_prihvacena", "rezervacijePrihvacene"],
    ["rezervacija_odbijena", "rezervacijeOdbijene"],
    ["rezervacija_predlog", "rezervacijePredlozi"],
    ["rezervacija_realizovana", "rezervacijeRealizovane"],
    ["rezervacija_otkazana", "rezervacijeOtkazane"],
  ] as const)("[definicije] the server event %s feeds %s first", (vrsta, metrika) => {
    const izlaz = doprinosi(dogadjaj({ vrsta, zahtev: "call", kanal: "standard" }));
    expect(izlaz[0].metrika).toBe(metrika);
    expect(DEFINICIJE[metrika].dogadjaji).toContain(vrsta);
  });
});

// -----------------------------------------------------------------------------
// Session steps
// -----------------------------------------------------------------------------

describe("koraciSesije", () => {
  test("[definicije] a detail marks the detail step", () => {
    expect(koraciSesije({ vrsta: "detalj" })).toEqual(["detalj"]);
  });

  test("[definicije] a request step marks the request step; a reservation step the reservation step", () => {
    expect(koraciSesije({ vrsta: "korak", korak: "zahtev" })).toEqual(["zahtev"]);
    expect(koraciSesije({ vrsta: "korak", korak: "rezervacija" })).toEqual(["rezervacija"]);
  });

  test("[definicije] an order is also a request: porudzbina marks both steps", () => {
    expect(koraciSesije({ vrsta: "korak", korak: "porudzbina" })).toEqual(["zahtev", "porudzbina"]);
  });

  test("[definicije] a step event without a step, and every other event, mark nothing", () => {
    expect(koraciSesije({ vrsta: "korak" })).toEqual([]);
    expect(koraciSesije({ vrsta: "stranica" })).toEqual([]);
    expect(koraciSesije({ vrsta: "zahtev_poslat" })).toEqual([]);
    expect(koraciSesije({ vrsta: "rezervacija_poslata" })).toEqual([]);
  });

  test("[definicije] each session step has its own Premium session metric that needs a session", () => {
    expect(Object.keys(KORAK_METRIKA).sort()).toEqual(["detalj", "porudzbina", "rezervacija", "zahtev"]);
    for (const metrika of Object.values(KORAK_METRIKA)) {
      expect(METRIKE).toContain(metrika);
      expect(DEFINICIJE[metrika].plan).toBe("premium");
      expect(DEFINICIJE[metrika].izvor).toBe("sesija");
      expect(DEFINICIJE[metrika].trebaSesije).toBe(true);
    }
    expect(new Set(Object.values(KORAK_METRIKA)).size).toBe(4);
  });
});

// -----------------------------------------------------------------------------
// The table of metrics is consistent with itself
// -----------------------------------------------------------------------------

describe("DEFINICIJE", () => {
  test("[definicije] has exactly one definition per metric id", () => {
    expect(Object.keys(DEFINICIJE).sort()).toEqual([...METRIKE].sort());
    expect(new Set(METRIKE).size).toBe(METRIKE.length);
  });

  test("[definicije] only the session step metrics are Premium and only session metrics need a session", () => {
    const premium = METRIKE.filter((id) => DEFINICIJE[id].plan === "premium").sort();
    expect(premium).toEqual(Object.values(KORAK_METRIKA).sort());
    const trebaSesije = METRIKE.filter((id) => DEFINICIJE[id].trebaSesije).sort();
    expect(trebaSesije).toEqual(METRIKE.filter((id) => DEFINICIJE[id].izvor === "sesija").sort());
    expect(DEFINICIJE.sesije.plan).toBe("standard");
  });

  test("[definicije] every breakdown a metric keeps is a known dimension, every event a known kind", () => {
    const vrste: readonly string[] = [...KLIJENTSKE_VRSTE, ...SERVERSKE_VRSTE];
    for (const id of METRIKE) {
      for (const dimenzija of DEFINICIJE[id].dimenzije) expect(DIMENZIJE).toContain(dimenzija);
      for (const vrsta of DEFINICIJE[id].dogadjaji) expect(vrste).toContain(vrsta);
    }
  });

  test("[definicije] doprinosi only counts an event in metrics that list it, with breakdowns they keep", () => {
    for (const vrsta of [...KLIJENTSKE_VRSTE, ...SERVERSKE_VRSTE]) {
      const pun = dogadjaj({
        vrsta,
        stranica: PG,
        artikal: AR,
        kartica: KARTICA,
        jezik: "sr",
        uredjaj: "telefon",
        korak: "zahtev",
        sesija: SESIJA,
        zahtev: "order",
        kanal: "standard",
        ko: "guest",
      });
      for (const { metrika, dimenzije } of doprinosi(pun)) {
        expect(METRIKE).toContain(metrika);
        expect(DEFINICIJE[metrika].dogadjaji).toContain(vrsta);
        for (const kljuc of Object.keys(dimenzije)) {
          expect(DEFINICIJE[metrika].dimenzije).toContain(kljuc);
        }
      }
    }
  });

  test("[definicije] doprinosi covers every metric that comes from the browser or the server", () => {
    const dobijene = new Set<Metrika>();
    for (const vrsta of [...KLIJENTSKE_VRSTE, ...SERVERSKE_VRSTE]) {
      const pun = dogadjaj({ vrsta, stranica: PG, artikal: AR, sesija: SESIJA, zahtev: "order", kanal: "standard", ko: "guest" });
      for (const { metrika } of doprinosi(pun)) dobijene.add(metrika);
    }
    const ocekivane = METRIKE.filter((id) => ["browser", "server", "interno"].includes(DEFINICIJE[id].izvor));
    expect([...dobijene].sort()).toEqual([...ocekivane].sort());
  });

  test("[definicije] the hour breakdown (sat) is kept as a string like every other breakdown value", () => {
    const [otvaranje] = doprinosi(dogadjaj({ vrsta: "stranica", stranica: PG, sat: 23 }));
    expect(otvaranje.dimenzije.sat).toBe("23");
    expect(typeof otvaranje.dimenzije.sat).toBe("string");
  });
});

// -----------------------------------------------------------------------------
// The text of the definitions (docs/menu/ANALITIKA-DEFINICIJE.md) matches the code
// -----------------------------------------------------------------------------

const KOREN = path.resolve(__dirname, "../../..");
const DOC = readFileSync(path.join(KOREN, "docs/menu/ANALITIKA-DEFINICIJE.md"), "utf8");
const LINIJE_DOCA = DOC.split(/\r?\n/);

/** The cells of one markdown table row. */
function celije(linija: string): string[] {
  return linija.split("|").slice(1, -1).map((celija) => celija.trim());
}

/** The metrics table of section 5: its header cells and its rows. */
function tabelaMetrika(): { zaglavlje: string[]; redovi: string[][] } {
  const pocetak = LINIJE_DOCA.findIndex((linija) => linija.startsWith("| ID |"));
  expect(pocetak).toBeGreaterThan(-1);
  const redovi: string[][] = [];
  for (let index = pocetak + 2; index < LINIJE_DOCA.length && LINIJE_DOCA[index].startsWith("|"); index += 1) {
    redovi.push(celije(LINIJE_DOCA[index]));
  }
  return { zaglavlje: celije(LINIJE_DOCA[pocetak]), redovi };
}

/**
 * The row that documents a metric: its id in backticks, a `…Suffix` for the
 * reservation outcomes, or the `konverzije` row for the session step metrics.
 */
function redMetrike(id: Metrika, redovi: string[][]): string[] | undefined {
  const trazeno = id.startsWith("sesijeSa") ? "konverzije" : id;
  const nastavak = /^rezervacije[A-Z]/.test(id) ? `…${id.slice("rezervacije".length)}` : null;
  return redovi.find(
    (red) => red[0].includes(`\`${trazeno}\``) || (nastavak !== null && red[0].includes(`\`${nastavak}\``)),
  );
}

// otvaranjaSaSesijom is internal (only feeds the reliability rule of sessions).
const BEZ_REDA_U_DOKUMENTU: readonly Metrika[] = ["otvaranjaSaSesijom"];

describe("docs/menu/ANALITIKA-DEFINICIJE.md", () => {
  test("[definicije] every metric id has a row in the metrics table (the session steps share the konverzije row)", () => {
    const { redovi } = tabelaMetrika();
    const bezReda = METRIKE.filter((id) => !BEZ_REDA_U_DOKUMENTU.includes(id) && !redMetrike(id, redovi));
    expect(bezReda).toEqual([]);
    expect(redMetrike("sesijeSaPorudzbinom", redovi)?.[0]).toContain("`konverzije`");
  });

  test("[definicije] every metric id appears in backticks in the document", () => {
    const nedostaju = METRIKE.filter((id) => {
      if (BEZ_REDA_U_DOKUMENTU.includes(id)) return false;
      if (id.startsWith("sesijeSa")) return !DOC.includes("`konverzije`");
      if (DOC.includes(`\`${id}\``)) return false;
      return !(/^rezervacije[A-Z]/.test(id) && DOC.includes(`\`…${id.slice("rezervacije".length)}\``));
    });
    expect(nedostaju).toEqual([]);
  });

  test("[definicije] the plan column (S / P) matches the plan of each metric", () => {
    const { zaglavlje, redovi } = tabelaMetrika();
    const kolona = zaglavlje.indexOf("Plan");
    expect(kolona).toBeGreaterThan(-1);
    for (const id of METRIKE) {
      if (BEZ_REDA_U_DOKUMENTU.includes(id)) continue;
      const red = redMetrike(id, redovi);
      expect(red, id).toBeDefined();
      expect(red![kolona].startsWith(DEFINICIJE[id].plan === "premium" ? "P" : "S"), `${id}: ${red![kolona]}`).toBe(true);
    }
  });

  test("[definicije] the breakdowns column lists every dimension the metric keeps", () => {
    const { zaglavlje, redovi } = tabelaMetrika();
    const kolona = zaglavlje.findIndex((celija) => celija.startsWith("Raspodele"));
    expect(kolona).toBeGreaterThan(-1);
    for (const id of METRIKE) {
      if (BEZ_REDA_U_DOKUMENTU.includes(id)) continue;
      const red = redMetrike(id, redovi);
      expect(red, id).toBeDefined();
      for (const dimenzija of DEFINICIJE[id].dimenzije) {
        expect(red![kolona], `${id} -> ${dimenzija}`).toContain(`\`${dimenzija}\``);
      }
    }
  });

  test("[definicije] every event kind, step, device class and dimension is named in backticks", () => {
    const neposredno = (ime: string) => DOC.includes(`\`${ime}\``);
    // The reservation outcomes are written as `rezervacija_prihvacena`, `_odbijena`, ...
    const vrstaUDokumentu = (vrsta: string) =>
      neposredno(vrsta) || (vrsta.startsWith("rezervacija_") && neposredno(vrsta.slice("rezervacija".length)));
    expect([...KLIJENTSKE_VRSTE, ...SERVERSKE_VRSTE].filter((vrsta) => !vrstaUDokumentu(vrsta))).toEqual([]);
    expect(KORACI.filter((korak) => !neposredno(korak))).toEqual([]);
    expect(UREDJAJI.filter((uredjaj) => !neposredno(uredjaj))).toEqual([]);
    expect(DIMENZIJE.filter((dimenzija) => !neposredno(dimenzija))).toEqual([]);
  });

  test("[definicije] the documented numbers are the constants in the code", () => {
    expect(MENU_ANALYTICS_SESSION_GAP_MS).toBe(30 * 60 * 1000);
    expect(DOC).toMatch(/\*\*30 minuta ili duže\*\*/);
    expect(MENU_ANALYTICS_SESSION_KEEP_MS).toBe(24 * 60 * 60 * 1000);
    expect(DOC).toMatch(/24 h posle poslednje aktivnosti/);
    expect(MIN_IMENILAC).toBe(20);
    expect(DOC).toMatch(/imenilac najmanje 20/);
    expect(MIN_POKRIVENOST_SESIJA).toBe(0.95);
    expect(DOC).toMatch(/najmanje \*\*95%\*\*/);
    expect(MENU_ANALYTICS_RAW_DAYS).toBe(90);
    expect(DOC).toMatch(/\*\*90 dana\*\*/);
    expect(MENU_ANALYTICS_DAILY_MONTHS).toBe(24);
    expect(DOC).toMatch(/\*\*24 meseca\*\*/);
    expect(MAX_DANA_PERIODA).toBe(366);
    expect(DOC).toMatch(/najviše \*\*366\*\* dana/);
    expect(MAX_DOGADJAJA_PO_POZIVU).toBe(10);
    expect(DOC).toMatch(/Najviše 10 događaja po pozivu/);
    expect(MAX_VREDNOSTI_PO_DIMENZIJI).toBe(500);
    expect(DOC).toMatch(/najviše 500 različitih vrednosti/);
  });

  test("[definicije] every test tag named in the document is a test-name prefix in the analytics test files", () => {
    const tagoviIzDoca = new Set([...DOC.matchAll(/`\[([a-z0-9-]+)\]`/g)].map((podudaranje) => podudaranje[1]));
    // Sanity: the document names tags at all, and these particular ones.
    expect(tagoviIzDoca.size).toBeGreaterThan(10);
    for (const tag of ["pravilo-20", "sesija-30", "otvaranja", "izlog", "dan-beograd"]) {
      expect(tagoviIzDoca.has(tag), tag).toBe(true);
    }

    const datoteke: string[] = [];
    for (const ime of readdirSync(__dirname)) {
      if (ime.endsWith(".test.ts")) datoteke.push(path.join(__dirname, ime));
    }
    const convexDir = path.join(KOREN, "convex");
    for (const ime of readdirSync(convexDir)) {
      if (/^menuAnalytics.*\.test\.ts$/.test(ime)) datoteke.push(path.join(convexDir, ime));
    }

    // A test name starts with one or more tags: `test("[tag] ...`, `it("[a] [b] ...`, `describe("[tag] ...`
    // and `test.each(...)("[tag] ...`. The group captures the whole leading run of tags.
    const nazivTesta = /(?:\b(?:test|it|describe)(?:\.\w+)*|\))\(\s*["'`]((?:\[[a-z0-9-]+\]\s*)+)/g;
    const nadjeni = new Set<string>();
    for (const datoteka of datoteke) {
      for (const podudaranje of readFileSync(datoteka, "utf8").matchAll(nazivTesta)) {
        for (const tag of podudaranje[1].matchAll(/\[([a-z0-9-]+)\]/g)) nadjeni.add(tag[1]);
      }
    }

    const nedostaju = [...tagoviIzDoca].filter((tag) => !nadjeni.has(tag)).sort();
    expect(nedostaju).toEqual([]);
  });
});
