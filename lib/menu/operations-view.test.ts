// ScanMe Menu V1 (K27) — Operativa of the client panel (lib/menu/operations-view.ts;
// master §13.5, plan K24 §4.3): the filters by kind, waiter and zone, the order
// (late first, then the longest waiting), the quiet reminder's state
// (`pingStanje`), today's open reservations and the staff on shift. Pure: the
// clock is a parameter. Invented data only.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import { MENU_PING_COOLDOWN_MS } from "./limits";
import {
  BEZ_FILTERA,
  FILTER_NEPREUZETI,
  operacijeView,
  pingStanje,
  type OperacijeFilteri,
  type OperacijePodaci,
  type OperacijeRezervacija,
  type OperacijeZahtev,
} from "./operations-view";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/** Wednesday 21 Oct 2026, 14:00 in Belgrade (CEST). */
const SADA = belgradeLocalToEpoch("2026-10-21T14:00")!;
const pre = (minuta: number, sekundi = 0) => SADA - minuta * MINUTE - sekundi * SECOND;
const lokalno = (local: string) => belgradeLocalToEpoch(local)!;

let brojac = 0;
function zahtev(preko: Partial<OperacijeZahtev> = {}): OperacijeZahtev {
  brojac += 1;
  return {
    id: `rq_${String(brojac).padStart(3, "0")}`,
    kind: "call",
    status: "new",
    channel: "standard",
    positionLabel: "Sto 1",
    zoneId: null,
    zoneName: null,
    createdAt: pre(3),
    acceptedAt: null,
    paymentPreference: null,
    itemCount: null,
    totalRsd: null,
    acceptedBy: null,
    lastPing: null,
    ...preko,
  };
}

/** An accepted request held by a PIN waiter. */
const preuzeo = (staffId: string, name: string, preko: Partial<OperacijeZahtev> = {}) =>
  zahtev({ status: "accepted", acceptedAt: pre(1), acceptedBy: { kind: "staff", staffId, name }, ...preko });

function rez(preko: Partial<OperacijeRezervacija> = {}): OperacijeRezervacija {
  brojac += 1;
  return { id: `rv_${String(brojac).padStart(3, "0")}`, status: "accepted", requestedAt: lokalno("2026-10-21T20:00"), partySize: 4, positionLabel: null, ...preko };
}

function podaci(preko: Partial<OperacijePodaci> = {}): OperacijePodaci {
  return {
    lateThresholdMin: 15,
    holdMinutes: 15,
    requests: [],
    truncated: false,
    reservations: [],
    reservationsTruncated: false,
    onShift: [],
    zones: [],
    ...preko,
  };
}

const smena = (staffId: string, name: string, preko: Partial<OperacijePodaci["onShift"][number]> = {}) => ({
  staffId,
  name,
  zoneName: null,
  since: pre(120),
  expiresAt: SADA + 6 * HOUR,
  ...preko,
});

const ids = (redovi: readonly { id: string }[]) => redovi.map((red) => red.id);
const filteri = (preko: Partial<OperacijeFilteri>): OperacijeFilteri => ({ ...BEZ_FILTERA, ...preko });

describe("constants", () => {
  test("the reminder cooldown is five minutes and the empty filter set is all null", () => {
    expect(MENU_PING_COOLDOWN_MS).toBe(5 * 60_000);
    expect(BEZ_FILTERA).toEqual({ vrsta: null, konobar: null, zona: null });
    expect(FILTER_NEPREUZETI).toBe("nepreuzeti");
  });
});

describe("only active requests", () => {
  test("new and accepted are listed, done and cancelled are not, and `ukupno` counts the active ones", () => {
    const a = zahtev();
    const b = preuzeo("s1", "Milan");
    const gotov = zahtev({ status: "done" });
    const otkazan = zahtev({ status: "cancelled" });
    const pogled = operacijeView(podaci({ requests: [a, b, gotov, otkazan], onShift: [smena("s1", "Milan")] }), BEZ_FILTERA, SADA);
    expect(ids(pogled.redovi).sort()).toEqual([a.id, b.id].sort());
    expect(pogled.ukupno).toBe(2);
    expect(pogled.aktivnihFiltera).toBe(0);
    expect(pogled.filteri).toEqual(BEZ_FILTERA);
  });

  test("an empty venue gives empty lists and `skraceno` follows the server", () => {
    const prazno = operacijeView(podaci(), BEZ_FILTERA, SADA);
    expect(prazno).toMatchObject({ redovi: [], ukupno: 0, kasni: 0, skraceno: false, uSmeni: [], rezervacijeDanas: [] });
    expect(prazno.opcije).toEqual({ konobari: [], zone: [] });
    expect(operacijeView(podaci({ truncated: true }), BEZ_FILTERA, SADA).skraceno).toBe(true);
  });

  test("the input is not changed and the rows keep the server's fields", () => {
    const ulaz = podaci({ requests: [zahtev({ totalRsd: 1200 })] });
    const kopija = structuredClone(ulaz);
    const pogled = operacijeView(ulaz, BEZ_FILTERA, SADA);
    expect(ulaz).toEqual(kopija);
    expect(pogled.redovi[0]).toMatchObject({ id: ulaz.requests[0].id, totalRsd: 1200, kind: "call", positionLabel: "Sto 1" });
  });
});

describe("filter by kind", () => {
  const poziv = zahtev({ kind: "call" });
  const racun = zahtev({ kind: "bill" });
  const porudzbina = preuzeo("s1", "Milan", { kind: "order" });
  const ulaz = podaci({ requests: [poziv, racun, porudzbina], onShift: [smena("s1", "Milan")] });

  test("each kind keeps only its own requests", () => {
    expect(ids(operacijeView(ulaz, filteri({ vrsta: "call" }), SADA).redovi)).toEqual([poziv.id]);
    expect(ids(operacijeView(ulaz, filteri({ vrsta: "bill" }), SADA).redovi)).toEqual([racun.id]);
    expect(ids(operacijeView(ulaz, filteri({ vrsta: "order" }), SADA).redovi)).toEqual([porudzbina.id]);
  });

  test("the filter narrows the rows, not the totals, and counts as one active filter", () => {
    const pogled = operacijeView(ulaz, filteri({ vrsta: "bill" }), SADA);
    expect(pogled.ukupno).toBe(3);
    expect(pogled.aktivnihFiltera).toBe(1);
    expect(pogled.filteri.vrsta).toBe("bill");
  });
});

describe("filter by waiter", () => {
  const milan = preuzeo("s1", "Milan", { createdAt: pre(9) });
  const jelena = preuzeo("s2", "Jelena", { createdAt: pre(8) });
  const nalog = zahtev({ status: "accepted", acceptedBy: { kind: "account", name: "Sanja M." }, createdAt: pre(7) });
  const nov = zahtev({ createdAt: pre(6) });
  const ulaz = podaci({ requests: [milan, jelena, nalog, nov], onShift: [smena("s1", "Milan"), smena("s2", "Jelena")] });

  test("a staff id keeps only what that person took (an account's requests belong to nobody)", () => {
    expect(ids(operacijeView(ulaz, filteri({ konobar: "s1" }), SADA).redovi)).toEqual([milan.id]);
    expect(ids(operacijeView(ulaz, filteri({ konobar: "s2" }), SADA).redovi)).toEqual([jelena.id]);
  });

  test("`Nepreuzeti` keeps the requests nobody took yet", () => {
    const pogled = operacijeView(ulaz, filteri({ konobar: FILTER_NEPREUZETI }), SADA);
    expect(ids(pogled.redovi)).toEqual([nov.id]);
    expect(pogled.filteri.konobar).toBe(FILTER_NEPREUZETI);
    expect(pogled.aktivnihFiltera).toBe(1);
  });

  test("a waiter on shift with nothing taken is a valid filter with an empty list", () => {
    const pogled = operacijeView(podaci({ requests: [nov], onShift: [smena("s9", "Stefan")] }), filteri({ konobar: "s9" }), SADA);
    expect(pogled.redovi).toEqual([]);
    expect(pogled.filteri.konobar).toBe("s9");
  });

  test("the options: those on shift and those holding a request, once each, by name", () => {
    const sef = preuzeo("s3", "Aleksa", { createdAt: pre(5) });
    const pogled = operacijeView(
      podaci({ requests: [sef, milan], onShift: [smena("s2", "Jelena"), smena("s1", "Milan")] }),
      BEZ_FILTERA,
      SADA,
    );
    expect(pogled.opcije.konobari).toEqual([
      { id: "s3", ime: "Aleksa" },
      { id: "s2", ime: "Jelena" },
      { id: "s1", ime: "Milan" },
    ]);
  });

  test("someone whose sign-in ended still appears while holding an active request, and not otherwise", () => {
    const istekao = smena("s4", "Stefan", { expiresAt: pre(1) });
    const drzi = preuzeo("s4", "Stefan");
    expect(operacijeView(podaci({ requests: [drzi], onShift: [istekao] }), BEZ_FILTERA, SADA).opcije.konobari).toEqual([{ id: "s4", ime: "Stefan" }]);
    expect(operacijeView(podaci({ requests: [], onShift: [istekao] }), BEZ_FILTERA, SADA).opcije.konobari).toEqual([]);
  });
});

describe("filter by zone", () => {
  const glavna = zahtev({ zoneId: "z1", zoneName: "Glavna sala", createdAt: pre(5) });
  const terasa = zahtev({ zoneId: "z2", zoneName: "Terasa", createdAt: pre(4) });
  const bezZone = zahtev({ zoneId: null, createdAt: pre(3) });
  const zone = [
    { id: "z1", name: "Glavna sala" },
    { id: "z2", name: "Terasa" },
  ];

  test("a zone keeps only its requests (those without a zone are in no zone)", () => {
    const ulaz = podaci({ requests: [glavna, terasa, bezZone], zones: zone });
    expect(ids(operacijeView(ulaz, filteri({ zona: "z1" }), SADA).redovi)).toEqual([glavna.id]);
    expect(ids(operacijeView(ulaz, filteri({ zona: "z2" }), SADA).redovi)).toEqual([terasa.id]);
  });

  test("the zone options are the venue's zones in the server's order, empty when it has none", () => {
    expect(operacijeView(podaci({ requests: [glavna], zones: zone }), BEZ_FILTERA, SADA).opcije.zone).toEqual([
      { id: "z1", ime: "Glavna sala" },
      { id: "z2", ime: "Terasa" },
    ]);
    expect(operacijeView(podaci({ requests: [glavna] }), BEZ_FILTERA, SADA).opcije.zone).toEqual([]);
  });

  test("a venue without zones ignores a zone filter (no zone filter exists there)", () => {
    const ulaz = podaci({ requests: [glavna, terasa, bezZone], zones: [] });
    const pogled = operacijeView(ulaz, filteri({ zona: "z1" }), SADA);
    expect(pogled.redovi).toHaveLength(3);
    expect(pogled.filteri.zona).toBeNull();
    expect(pogled.aktivnihFiltera).toBe(0);
  });
});

describe("stale filters fall back to all", () => {
  const milan = preuzeo("s1", "Milan");
  const ulaz = podaci({ requests: [milan, zahtev()], onShift: [smena("s1", "Milan")], zones: [{ id: "z1", name: "Glavna sala" }] });

  test("a waiter who is gone, and a zone that is gone, become `all` and do not count as active", () => {
    const pogled = operacijeView(ulaz, filteri({ konobar: "s_nema", zona: "z_nema" }), SADA);
    expect(pogled.redovi).toHaveLength(2);
    expect(pogled.filteri).toEqual(BEZ_FILTERA);
    expect(pogled.aktivnihFiltera).toBe(0);
  });

  test("one stale filter does not disturb a valid one", () => {
    const pogled = operacijeView(ulaz, filteri({ vrsta: "call", konobar: "s_nema" }), SADA);
    expect(pogled.filteri).toEqual({ vrsta: "call", konobar: null, zona: null });
    expect(pogled.aktivnihFiltera).toBe(1);
    expect(pogled.redovi).toHaveLength(2);
  });

  test("a waiter whose sign-in ended and who holds nothing is stale", () => {
    const pogled = operacijeView(
      podaci({ requests: [zahtev()], onShift: [smena("s7", "Stefan", { expiresAt: pre(10) })] }),
      filteri({ konobar: "s7" }),
      SADA,
    );
    expect(pogled.filteri.konobar).toBeNull();
    expect(pogled.redovi).toHaveLength(1);
  });

  test("`Nepreuzeti` and all three filters at once count as three", () => {
    const pogled = operacijeView(ulaz, { vrsta: "call", konobar: FILTER_NEPREUZETI, zona: "z1" }, SADA);
    expect(pogled.aktivnihFiltera).toBe(3);
  });
});

describe("filters combine (and)", () => {
  test("kind, waiter and zone must all match", () => {
    const tacan = preuzeo("s1", "Milan", { kind: "order", zoneId: "z1" });
    const drugaVrsta = preuzeo("s1", "Milan", { kind: "call", zoneId: "z1" });
    const drugiKonobar = preuzeo("s2", "Jelena", { kind: "order", zoneId: "z1" });
    const drugaZona = preuzeo("s1", "Milan", { kind: "order", zoneId: "z2" });
    const ulaz = podaci({
      requests: [tacan, drugaVrsta, drugiKonobar, drugaZona],
      onShift: [smena("s1", "Milan"), smena("s2", "Jelena")],
      zones: [
        { id: "z1", name: "Glavna sala" },
        { id: "z2", name: "Terasa" },
      ],
    });
    const pogled = operacijeView(ulaz, { vrsta: "order", konobar: "s1", zona: "z1" }, SADA);
    expect(ids(pogled.redovi)).toEqual([tacan.id]);
    expect(pogled.aktivnihFiltera).toBe(3);
    expect(pogled.ukupno).toBe(4);
  });
});

describe("order and lateness", () => {
  test("late first (the longest first), then the rest, the longest waiting first", () => {
    const pet = zahtev({ createdAt: pre(5) });
    const dva = zahtev({ createdAt: pre(2) });
    const dvadeset = zahtev({ createdAt: pre(20) });
    const cetrnaest = zahtev({ createdAt: pre(14) });
    const trideset = zahtev({ createdAt: pre(30) });
    const pogled = operacijeView(podaci({ requests: [dva, trideset, pet, cetrnaest, dvadeset] }), BEZ_FILTERA, SADA);
    expect(ids(pogled.redovi)).toEqual([trideset.id, dvadeset.id, cetrnaest.id, pet.id, dva.id]);
    expect(pogled.redovi.map((red) => red.kasni)).toEqual([true, true, false, false, false]);
    expect(pogled.kasni).toBe(2);
  });

  test("a late request that was accepted still sorts among the late ones, by its own age", () => {
    const kasniNov = zahtev({ createdAt: pre(16) });
    const kasniPreuzet = preuzeo("s1", "Milan", { createdAt: pre(40) });
    const svez = zahtev({ createdAt: pre(1) });
    const pogled = operacijeView(podaci({ requests: [svez, kasniNov, kasniPreuzet], onShift: [smena("s1", "Milan")] }), BEZ_FILTERA, SADA);
    expect(ids(pogled.redovi)).toEqual([kasniPreuzet.id, kasniNov.id, svez.id]);
  });

  test("the threshold is the venue's, and exactly at it the request is already late", () => {
    const naPragu = zahtev({ createdAt: pre(15) });
    const milisekundPre = zahtev({ createdAt: SADA - 15 * MINUTE + 1 });
    const pogled = operacijeView(podaci({ requests: [milisekundPre, naPragu] }), BEZ_FILTERA, SADA);
    const poId = new Map(pogled.redovi.map((red) => [red.id, red.kasni]));
    expect(poId.get(naPragu.id)).toBe(true);
    expect(poId.get(milisekundPre.id)).toBe(false);

    const kratkiPrag = operacijeView(podaci({ requests: [zahtev({ createdAt: pre(6) })], lateThresholdMin: 5 }), BEZ_FILTERA, SADA);
    expect(kratkiPrag.redovi[0].kasni).toBe(true);
    expect(kratkiPrag.kasni).toBe(1);
  });

  test("`kasni` counts every late active request, whatever the filter shows", () => {
    const kasniPoziv = zahtev({ kind: "call", createdAt: pre(30) });
    const kasniRacun = zahtev({ kind: "bill", createdAt: pre(31) });
    const svezPoziv = zahtev({ kind: "call", createdAt: pre(1) });
    const gotov = zahtev({ kind: "call", status: "done", createdAt: pre(90) });
    const pogled = operacijeView(podaci({ requests: [kasniPoziv, kasniRacun, svezPoziv, gotov] }), filteri({ vrsta: "call" }), SADA);
    expect(ids(pogled.redovi)).toEqual([kasniPoziv.id, svezPoziv.id]);
    expect(pogled.kasni).toBe(2);
    expect(pogled.ukupno).toBe(3);
  });
});

describe("pingStanje", () => {
  const MILAN = { kind: "staff", staffId: "s1", name: "Milan" } as const;
  const stanje = (preko: Partial<Pick<OperacijeZahtev, "status" | "acceptedBy" | "lastPing">>) =>
    pingStanje({ status: "accepted", acceptedBy: MILAN, lastPing: null, ...preko }, SADA);

  test("a request nobody took has no one to remind", () => {
    expect(stanje({ status: "new", acceptedBy: null })).toEqual({ moze: false, razlog: "nepreuzet" });
  });

  test("status and holder must agree: only an accepted request with a holder can be reminded", () => {
    expect(stanje({ status: "accepted", acceptedBy: null })).toEqual({ moze: false, razlog: "nepreuzet" });
    expect(stanje({ status: "new", acceptedBy: MILAN })).toEqual({ moze: false, razlog: "nepreuzet" });
    expect(stanje({ status: "done", acceptedBy: MILAN })).toEqual({ moze: false, razlog: "nepreuzet" });
    expect(stanje({ status: "cancelled", acceptedBy: MILAN })).toEqual({ moze: false, razlog: "nepreuzet" });
  });

  test("an Owner's or Manager's account took it: there is no waiter to remind", () => {
    expect(stanje({ acceptedBy: { kind: "account", name: "Sanja M." } })).toEqual({ moze: false, razlog: "nalog" });
    // Even with a recent reminder the answer is the account, not the cooldown.
    expect(stanje({ acceptedBy: { kind: "account", name: "Sanja M." }, lastPing: { at: pre(1), seen: false } })).toEqual({
      moze: false,
      razlog: "nalog",
    });
  });

  test("a waiter holds it and nothing was sent: the reminder is possible", () => {
    expect(stanje({})).toEqual({ moze: true });
  });

  test("a reminder less than 5 minutes ago blocks a new one and says from when it is possible", () => {
    const at = pre(1);
    expect(stanje({ lastPing: { at, seen: false } })).toEqual({ moze: false, razlog: "poslat", ponovoOd: at + MENU_PING_COOLDOWN_MS });
    // Seen or not, the cooldown is the same.
    expect(stanje({ lastPing: { at, seen: true } })).toEqual({ moze: false, razlog: "poslat", ponovoOd: at + MENU_PING_COOLDOWN_MS });
    const upravoSad = SADA;
    expect(stanje({ lastPing: { at: upravoSad, seen: false } })).toEqual({ moze: false, razlog: "poslat", ponovoOd: upravoSad + 5 * MINUTE });
  });

  test("the 5-minute boundary: 1 ms short is still blocked, exactly 5 minutes is possible again", () => {
    expect(stanje({ lastPing: { at: SADA - MENU_PING_COOLDOWN_MS + 1, seen: true } })).toMatchObject({ moze: false, razlog: "poslat" });
    expect(stanje({ lastPing: { at: SADA - MENU_PING_COOLDOWN_MS, seen: true } })).toEqual({ moze: true });
    expect(stanje({ lastPing: { at: SADA - MENU_PING_COOLDOWN_MS - 1, seen: false } })).toEqual({ moze: true });
    expect(stanje({ lastPing: { at: pre(60), seen: true } })).toEqual({ moze: true });
  });

  test("the rows of the view carry the same state", () => {
    const moze = preuzeo("s1", "Milan");
    const poslat = preuzeo("s1", "Milan", { lastPing: { at: pre(2), seen: false } });
    const nov = zahtev();
    const nalog = zahtev({ status: "accepted", acceptedBy: { kind: "account", name: "Sanja M." } });
    const pogled = operacijeView(podaci({ requests: [moze, poslat, nov, nalog], onShift: [smena("s1", "Milan")] }), BEZ_FILTERA, SADA);
    const poId = new Map(pogled.redovi.map((red) => [red.id, red.ping]));
    expect(poId.get(moze.id)).toEqual({ moze: true });
    expect(poId.get(poslat.id)).toEqual({ moze: false, razlog: "poslat", ponovoOd: pre(2) + MENU_PING_COOLDOWN_MS });
    expect(poId.get(nov.id)).toEqual({ moze: false, razlog: "nepreuzet" });
    expect(poId.get(nalog.id)).toEqual({ moze: false, razlog: "nalog" });
  });
});

describe("today's reservations", () => {
  test("only today (Belgrade) and only the open statuses: new, change proposed, accepted", () => {
    const nova = rez({ status: "new", requestedAt: lokalno("2026-10-21T19:00") });
    const predlog = rez({ status: "change_proposed", requestedAt: lokalno("2026-10-21T19:30") });
    const prihvacena = rez({ status: "accepted", requestedAt: lokalno("2026-10-21T20:00") });
    const stigli = rez({ status: "arrived", requestedAt: lokalno("2026-10-21T13:00") });
    const odbijena = rez({ status: "declined", requestedAt: lokalno("2026-10-21T18:00") });
    const otkazana = rez({ status: "cancelled", requestedAt: lokalno("2026-10-21T18:30") });
    const pogled = operacijeView(
      podaci({ reservations: [otkazana, prihvacena, stigli, odbijena, predlog, nova] }),
      BEZ_FILTERA,
      SADA,
    );
    expect(ids(pogled.rezervacijeDanas)).toEqual([nova.id, predlog.id, prihvacena.id]);
  });

  test("sorted by time, whatever the order they came in", () => {
    const kasno = rez({ requestedAt: lokalno("2026-10-21T22:15") });
    const rano = rez({ requestedAt: lokalno("2026-10-21T12:00") });
    const sredina = rez({ requestedAt: lokalno("2026-10-21T18:45") });
    const pogled = operacijeView(podaci({ reservations: [kasno, rano, sredina] }), BEZ_FILTERA, SADA);
    expect(ids(pogled.rezervacijeDanas)).toEqual([rano.id, sredina.id, kasno.id]);
  });

  test("yesterday and tomorrow are not today: the day is the Belgrade calendar day, from 00:00 to 23:59", () => {
    const juceKasno = rez({ requestedAt: lokalno("2026-10-20T23:59") });
    const ponoc = rez({ requestedAt: lokalno("2026-10-21T00:00") });
    const veceDanas = rez({ requestedAt: lokalno("2026-10-21T23:59") });
    const sutraPonoc = rez({ requestedAt: lokalno("2026-10-22T00:00") });
    const pogled = operacijeView(podaci({ reservations: [juceKasno, ponoc, veceDanas, sutraPonoc] }), BEZ_FILTERA, SADA);
    expect(ids(pogled.rezervacijeDanas)).toEqual([ponoc.id, veceDanas.id]);
  });

  test("the day follows the Belgrade clock, not UTC: 00:30 Belgrade is still the previous day in UTC", () => {
    const kasnoUvece = lokalno("2026-10-21T00:30");
    expect(new Date(kasnoUvece).toISOString().slice(0, 10)).toBe("2026-10-20");
    const pogled = operacijeView(podaci({ reservations: [rez({ requestedAt: kasnoUvece })] }), BEZ_FILTERA, SADA);
    expect(pogled.rezervacijeDanas).toHaveLength(1);
  });

  test("the day of the clock change (25 Oct 2026, 25 hours long) still holds exactly its own reservations", () => {
    const sada = lokalno("2026-10-25T12:00");
    const juce = rez({ requestedAt: lokalno("2026-10-24T23:59") });
    const prviMinut = rez({ requestedAt: lokalno("2026-10-25T00:00") });
    const uPodne = rez({ requestedAt: lokalno("2026-10-25T13:00") });
    const poslednjiMinut = rez({ requestedAt: lokalno("2026-10-25T23:59") });
    const sutra = rez({ requestedAt: lokalno("2026-10-26T00:00") });
    const pogled = operacijeView(podaci({ reservations: [sutra, poslednjiMinut, uPodne, prviMinut, juce] }), BEZ_FILTERA, sada);
    expect(ids(pogled.rezervacijeDanas)).toEqual([prviMinut.id, uPodne.id, poslednjiMinut.id]);
  });

  test("each row carries its phase by the venue's hold (soon, in time, late)", () => {
    const sati = (h: number, m = 0) => lokalno(`2026-10-21T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const kasnije = rez({ requestedAt: sati(16, 1) });
    const uskoro = rez({ requestedAt: sati(16, 0) });
    const uTerminu = rez({ requestedAt: sati(13, 50) });
    const kasni = rez({ requestedAt: sati(13, 45) });
    const pogled = operacijeView(podaci({ reservations: [kasnije, uskoro, uTerminu, kasni], holdMinutes: 15 }), BEZ_FILTERA, SADA);
    const faze = new Map(pogled.rezervacijeDanas.map((red) => [red.id, red.faza]));
    expect(faze.get(kasnije.id)).toBe("kasnije");
    expect(faze.get(uskoro.id)).toBe("uskoro");
    expect(faze.get(uTerminu.id)).toBe("u-terminu");
    expect(faze.get(kasni.id)).toBe("kasni");
    // A longer hold keeps the same reservation "in time".
    const duzi = operacijeView(podaci({ reservations: [kasni], holdMinutes: 30 }), BEZ_FILTERA, SADA);
    expect(duzi.rezervacijeDanas[0].faza).toBe("u-terminu");
  });

  test("reservations are not touched by the request filters", () => {
    const r = rez({ requestedAt: lokalno("2026-10-21T18:00") });
    const pogled = operacijeView(podaci({ reservations: [r], requests: [zahtev({ kind: "call" })] }), filteri({ vrsta: "order" }), SADA);
    expect(pogled.redovi).toEqual([]);
    expect(ids(pogled.rezervacijeDanas)).toEqual([r.id]);
  });
});

describe("staff on shift", () => {
  test("a shift whose sign-in ended is hidden, one that ends in the future is shown (exactly now is over)", () => {
    const traje = smena("s1", "Milan", { expiresAt: SADA + 1 });
    const istekla = smena("s2", "Jelena", { expiresAt: SADA - 1 });
    const naSekundu = smena("s3", "Stefan", { expiresAt: SADA });
    const pogled = operacijeView(podaci({ onShift: [istekla, traje, naSekundu] }), BEZ_FILTERA, SADA);
    expect(pogled.uSmeni.map((s) => s.staffId)).toEqual(["s1"]);
  });

  test("a shift is shown with the name, the zone and since when", () => {
    const pogled = operacijeView(
      podaci({ onShift: [smena("s1", "Milan", { zoneName: "Terasa", since: pre(95) })] }),
      BEZ_FILTERA,
      SADA,
    );
    expect(pogled.uSmeni).toEqual([{ staffId: "s1", ime: "Milan", zona: "Terasa", od: pre(95) }]);
  });

  test("the list keeps the server's order (the server sends the earliest first)", () => {
    const ranije = smena("s1", "Milan", { since: pre(300) });
    const kasnije = smena("s2", "Jelena", { since: pre(30) });
    const pogled = operacijeView(podaci({ onShift: [ranije, kasnije] }), BEZ_FILTERA, SADA);
    expect(pogled.uSmeni.map((s) => s.staffId)).toEqual(["s1", "s2"]);
  });

  test("the staff list is not narrowed by the request filters", () => {
    const pogled = operacijeView(
      podaci({ onShift: [smena("s1", "Milan"), smena("s2", "Jelena")], requests: [preuzeo("s1", "Milan")] }),
      filteri({ konobar: "s1" }),
      SADA,
    );
    expect(pogled.uSmeni).toHaveLength(2);
  });
});
