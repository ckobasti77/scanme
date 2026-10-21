// ScanMe Menu V1 (K27) — Početna of the client panel (lib/menu/home-summary.ts;
// master §13.2–§13.3, plan K24 §4.2): "Pažnja" first, then "Sada u lokalu" and
// the menu, and the rule that the same number is never shown in two blocks.
// Pure: the clock is a parameter. Invented data only. The property test at the
// end generates many states with a small seeded generator (the same run every
// time) and checks the rule on each of them.

import { describe, expect, test } from "vitest";
import { belgradeLocalToEpoch } from "../belgrade-time";
import {
  HOME_REQUEST_KINDS,
  HOME_UNPUBLISHED_STALE_MS,
  brojkeBloka,
  homeSummary,
  type HomeInput,
  type HomeMetric,
  type HomeSummary,
  type PaznjaVrsta,
} from "./home-summary";
import type { MenuRequestKind, MenuRequestStatus } from "./request-status";
import type { MenuReservationStatus } from "./reservation-status";
import { addDays, belgradeDateKey } from "./working-hours";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const lokalno = (local: string) => belgradeLocalToEpoch(local)!;
/** Wednesday 21 Oct 2026, 14:00 in Belgrade (CEST). */
const SADA = lokalno("2026-10-21T14:00");

type Operacije = NonNullable<HomeInput["operations"]>;
type ZahtevUlaz = Operacije["requests"][number];
type RezervacijaUlaz = Operacije["reservations"][number];

const zahtev = (kind: MenuRequestKind, status: MenuRequestStatus, createdAt: number): ZahtevUlaz => ({ kind, status, createdAt });
const rezervacija = (status: MenuReservationStatus, requestedAt: number, preko: Partial<RezervacijaUlaz> = {}): RezervacijaUlaz => ({
  status,
  requestedAt,
  partySize: 4,
  positionLabel: null,
  ...preko,
});

/** A calm venue: one waiter signed in, nothing waiting, mailbox fine, menu published and unchanged. */
function ulaz(
  preko: {
    nowMs?: number;
    menu?: Partial<HomeInput["menu"]>;
    roomServicePriceWarnings?: number | null;
    operations?: Partial<Operacije> | null;
    mail?: HomeInput["mail"];
  } = {},
): HomeInput {
  const nowMs = preko.nowMs ?? SADA;
  return {
    nowMs,
    menu: { state: "clean", liveVersionNumber: 3, livePublishedAt: nowMs - 30 * HOUR, lastEditAt: nowMs - 30 * HOUR, ...preko.menu },
    roomServicePriceWarnings: preko.roomServicePriceWarnings ?? null,
    operations:
      preko.operations === null
        ? null
        : {
            lateThresholdMin: 15,
            holdMinutes: 15,
            requests: [],
            requestsTruncated: false,
            reservations: [],
            staffSessions: [{ expiresAt: nowMs + 6 * HOUR }],
            ...preko.operations,
          },
    mail: preko.mail === undefined ? { status: "active" } : preko.mail,
  };
}

const vrste = (summary: HomeSummary): PaznjaVrsta[] => summary.paznja.map((stavka) => stavka.vrsta);
const pre = (minuta: number, nowMs = SADA) => nowMs - minuta * MINUTE;

// -----------------------------------------------------------------------------
// Examples
// -----------------------------------------------------------------------------

describe("a calm venue", () => {
  test("nothing needs attention: `mirno`, the numbers of Sada, the menu status", () => {
    const summary = homeSummary(ulaz());
    expect(summary.stanje).toBe("mirno");
    expect(summary.paznja).toEqual([]);
    expect(summary.sada).toEqual({
      zahtevi: [
        { kind: "call", broj: 0 },
        { kind: "bill", broj: 0 },
        { kind: "order", broj: 0 },
      ],
      bezKasnih: false,
      skraceno: false,
      rezervacije: { preostalo: 0, sledeca: null },
      osoblje: 1,
    });
    expect(summary.meni).toEqual({ stanje: "clean", objavljeno: { broj: 3, kada: SADA - 30 * HOUR } });
  });

  test("Sada lists every kind of request, zeros included, in the fixed order", () => {
    expect(HOME_REQUEST_KINDS).toEqual(["call", "bill", "order"]);
    const summary = homeSummary(ulaz({ operations: { requests: [zahtev("order", "new", pre(2)), zahtev("call", "accepted", pre(1)), zahtev("call", "new", pre(3))] } }));
    expect(summary.sada?.zahtevi).toEqual([
      { kind: "call", broj: 2 },
      { kind: "bill", broj: 0 },
      { kind: "order", broj: 1 },
    ]);
  });
});

describe("Pažnja: every line, in the right conditions and order", () => {
  test("all seven lines at once come in the order of importance, with their numbers", () => {
    const poslednjaIzmena = pre(25 * 60);
    const summary = homeSummary(
      ulaz({
        operations: {
          lateThresholdMin: 15,
          holdMinutes: 15,
          requests: [zahtev("call", "new", pre(20)), zahtev("bill", "accepted", pre(1))],
          reservations: [
            rezervacija("accepted", pre(20)),
            rezervacija("accepted", pre(16)),
            rezervacija("new", SADA + 3 * HOUR),
            rezervacija("new", SADA + 4 * HOUR),
            rezervacija("new", SADA + 5 * HOUR),
          ],
          staffSessions: [],
        },
        mail: { status: "error" },
        roomServicePriceWarnings: 2,
        menu: { state: "dirty", lastEditAt: poslednjaIzmena },
      }),
    );
    expect(summary.stanje).toBe("paznja");
    expect(summary.paznja).toEqual([
      { vrsta: "zahtevi-kasne", broj: 1, pragMin: 15 },
      { vrsta: "bez-osoblja" },
      { vrsta: "rezervacije-kasne", broj: 2 },
      { vrsta: "rezervacije-cekaju", broj: 3 },
      { vrsta: "posta" },
      { vrsta: "room-service", broj: 2 },
      { vrsta: "neobjavljeno", od: poslednjaIzmena },
    ]);
    // Pažnja has the late call: Sada says these are "the rest", and does not repeat it.
    expect(summary.sada?.bezKasnih).toBe(true);
    expect(summary.sada?.zahtevi).toEqual([
      { kind: "call", broj: 0 },
      { kind: "bill", broj: 1 },
      { kind: "order", broj: 0 },
    ]);
    expect(summary.sada?.osoblje).toBeNull();
  });

  describe("requests over the threshold (`zahtevi-kasne`)", () => {
    test("new or accepted, past the venue's threshold; the line carries the threshold", () => {
      const summary = homeSummary(
        ulaz({
          operations: {
            lateThresholdMin: 10,
            requests: [zahtev("call", "new", pre(11)), zahtev("order", "accepted", pre(60)), zahtev("bill", "new", pre(9))],
          },
        }),
      );
      expect(summary.paznja).toEqual([{ vrsta: "zahtevi-kasne", broj: 2, pragMin: 10 }]);
    });

    test("exactly at the threshold the request is late (as `isLate`), a millisecond short it is not", () => {
      const naPragu = homeSummary(ulaz({ operations: { requests: [zahtev("call", "new", SADA - 15 * MINUTE)] } }));
      expect(vrste(naPragu)).toEqual(["zahtevi-kasne"]);
      const kratko = homeSummary(ulaz({ operations: { requests: [zahtev("call", "new", SADA - 15 * MINUTE + 1)] } }));
      expect(kratko.paznja).toEqual([]);
      expect(kratko.sada?.zahtevi[0]).toEqual({ kind: "call", broj: 1 });
    });

    test("done and cancelled requests are not active, however old", () => {
      const summary = homeSummary(
        ulaz({ operations: { requests: [zahtev("call", "done", pre(300)), zahtev("bill", "cancelled", pre(500)), zahtev("order", "done", pre(40))] } }),
      );
      expect(summary.paznja).toEqual([]);
      expect(summary.sada?.zahtevi.map((z) => z.broj)).toEqual([0, 0, 0]);
    });
  });

  describe("guests wait and nobody is signed in (`bez-osoblja`)", () => {
    const cekaGost = [zahtev("call", "new", pre(1))];

    test("a new request and no live sign-in: the line has no number and Sada does not count staff", () => {
      const summary = homeSummary(ulaz({ operations: { requests: cekaGost, staffSessions: [] } }));
      expect(summary.paznja).toEqual([{ vrsta: "bez-osoblja" }]);
      expect(summary.sada?.osoblje).toBeNull();
    });

    test("with someone signed in there is no such line and Sada counts them", () => {
      const summary = homeSummary(ulaz({ operations: { requests: cekaGost, staffSessions: [{ expiresAt: SADA + 1 }, { expiresAt: SADA + HOUR }] } }));
      expect(summary.paznja).toEqual([]);
      expect(summary.sada?.osoblje).toBe(2);
    });

    test("a sign-in that ended does not count, and one that ends exactly now is over", () => {
      const summary = homeSummary(
        ulaz({ operations: { requests: cekaGost, staffSessions: [{ expiresAt: SADA }, { expiresAt: SADA - 1 }, { expiresAt: SADA - 5 * HOUR }] } }),
      );
      expect(vrste(summary)).toEqual(["bez-osoblja"]);
      expect(summary.sada?.osoblje).toBeNull();
    });

    test("nobody signed in but nobody waiting either: no warning, Sada says zero", () => {
      const prazno = homeSummary(ulaz({ operations: { requests: [], staffSessions: [] } }));
      expect(prazno.paznja).toEqual([]);
      expect(prazno.sada?.osoblje).toBe(0);
      // Only done/cancelled requests: nobody is waiting.
      const gotovi = homeSummary(ulaz({ operations: { requests: [zahtev("call", "done", pre(5))], staffSessions: [] } }));
      expect(gotovi.paznja).toEqual([]);
      expect(gotovi.sada?.osoblje).toBe(0);
    });

    test("only accepted requests (someone took them) are not waiting guests", () => {
      const summary = homeSummary(ulaz({ operations: { requests: [zahtev("call", "accepted", pre(2))], staffSessions: [] } }));
      expect(summary.paznja).toEqual([]);
      expect(summary.sada?.osoblje).toBe(0);
    });

    test("a late new request with nobody signed in gives both lines, the late one first", () => {
      const summary = homeSummary(ulaz({ operations: { requests: [zahtev("bill", "new", pre(30))], staffSessions: [] } }));
      expect(vrste(summary)).toEqual(["zahtevi-kasne", "bez-osoblja"]);
    });
  });

  describe("reservations (`rezervacije-kasne`, `rezervacije-cekaju`)", () => {
    test("waiting for an answer: every new one, whatever its day, and only new ones", () => {
      const summary = homeSummary(
        ulaz({
          operations: {
            reservations: [
              rezervacija("new", pre(3 * 60)),
              rezervacija("new", SADA + 2 * HOUR),
              rezervacija("new", lokalno("2026-10-30T20:00")),
              rezervacija("change_proposed", SADA + HOUR),
              rezervacija("declined", SADA + HOUR),
            ],
          },
        }),
      );
      expect(summary.paznja).toEqual([{ vrsta: "rezervacije-cekaju", broj: 3 }]);
    });

    test("late = an accepted reservation past the hold; a new one past its time is waiting, not late", () => {
      const summary = homeSummary(
        ulaz({ operations: { holdMinutes: 20, reservations: [rezervacija("accepted", pre(25)), rezervacija("accepted", pre(10)), rezervacija("new", pre(90))] } }),
      );
      expect(summary.paznja).toEqual([
        { vrsta: "rezervacije-kasne", broj: 1 },
        { vrsta: "rezervacije-cekaju", broj: 1 },
      ]);
    });

    test("the hold boundary: exactly at the hold it is late, a millisecond short it is still in time (and in Sada)", () => {
      const naGranici = homeSummary(ulaz({ operations: { holdMinutes: 15, reservations: [rezervacija("accepted", SADA - 15 * MINUTE)] } }));
      expect(naGranici.paznja).toEqual([{ vrsta: "rezervacije-kasne", broj: 1 }]);
      expect(naGranici.sada?.rezervacije.preostalo).toBe(0);

      const kratko = homeSummary(ulaz({ operations: { holdMinutes: 15, reservations: [rezervacija("accepted", SADA - 15 * MINUTE + 1)] } }));
      expect(kratko.paznja).toEqual([]);
      expect(kratko.sada?.rezervacije.preostalo).toBe(1);

      // The venue's own hold decides.
      const duzi = homeSummary(ulaz({ operations: { holdMinutes: 30, reservations: [rezervacija("accepted", SADA - 15 * MINUTE)] } }));
      expect(duzi.paznja).toEqual([]);
    });

    test("a reservation whose time has not come is never late, even one millisecond before", () => {
      const summary = homeSummary(ulaz({ operations: { reservations: [rezervacija("accepted", SADA + 1)] } }));
      expect(summary.paznja).toEqual([]);
      expect(summary.sada?.rezervacije.preostalo).toBe(1);
    });

    test("arrived, declined, cancelled and proposed reservations raise nothing", () => {
      const summary = homeSummary(
        ulaz({
          operations: {
            reservations: (["arrived", "declined", "cancelled", "change_proposed"] as const).map((status) => rezervacija(status, pre(120))),
          },
        }),
      );
      expect(summary.paznja).toEqual([]);
      expect(summary.sada?.rezervacije).toEqual({ preostalo: 0, sledeca: null });
    });

    test("across the clock change the hold is counted in real time, not on the wall clock", () => {
      // 02:50 CEST, then the clocks go back: at 01:05 UTC the wall clock reads 02:05 CET, 15 real minutes later.
      const termin = Date.UTC(2026, 9, 25, 0, 50);
      const sada = Date.UTC(2026, 9, 25, 1, 5);
      expect(sada - termin).toBe(15 * MINUTE);
      const summary = homeSummary(ulaz({ nowMs: sada, operations: { holdMinutes: 15, reservations: [rezervacija("accepted", termin)] } }));
      expect(summary.paznja).toEqual([{ vrsta: "rezervacije-kasne", broj: 1 }]);
    });
  });

  describe("mailbox, Room service, unpublished changes", () => {
    test("`posta` only for a mailbox in error", () => {
      expect(vrste(homeSummary(ulaz({ mail: { status: "error" } })))).toEqual(["posta"]);
      for (const mail of [{ status: "active" }, { status: "none" }, null] as const) {
        expect(homeSummary(ulaz({ mail })).paznja, JSON.stringify(mail)).toEqual([]);
      }
    });

    test("`room-service` only when there are price warnings, with their number", () => {
      expect(homeSummary(ulaz({ roomServicePriceWarnings: 4 })).paznja).toEqual([{ vrsta: "room-service", broj: 4 }]);
      expect(homeSummary(ulaz({ roomServicePriceWarnings: 1 })).paznja).toEqual([{ vrsta: "room-service", broj: 1 }]);
      expect(homeSummary(ulaz({ roomServicePriceWarnings: 0 })).paznja).toEqual([]);
      expect(homeSummary(ulaz({ roomServicePriceWarnings: null })).paznja).toEqual([]);
    });

    test("`neobjavljeno`: unpublished changes younger than 24 h are not in Pažnja, 24 h and older are", () => {
      expect(HOME_UNPUBLISHED_STALE_MS).toBe(24 * HOUR);
      const mlado = homeSummary(ulaz({ menu: { state: "dirty", lastEditAt: SADA - 23 * HOUR - 59 * MINUTE } }));
      expect(mlado.paznja).toEqual([]);
      expect(mlado.meni.stanje).toBe("dirty");
      const kratko = homeSummary(ulaz({ menu: { state: "dirty", lastEditAt: SADA - HOUR * 24 + 1 } }));
      expect(kratko.paznja).toEqual([]);
      const tacno = homeSummary(ulaz({ menu: { state: "dirty", lastEditAt: SADA - 24 * HOUR } }));
      expect(tacno.paznja).toEqual([{ vrsta: "neobjavljeno", od: SADA - 24 * HOUR }]);
      const staro = homeSummary(ulaz({ menu: { state: "dirty", lastEditAt: SADA - 5 * 24 * HOUR } }));
      expect(vrste(staro)).toEqual(["neobjavljeno"]);
    });

    test("only a published menu with changes counts: a clean or never-published menu is not flagged for its edit date", () => {
      for (const state of ["clean", "never_published"] as const) {
        const summary = homeSummary(ulaz({ menu: { state, lastEditAt: SADA - 10 * 24 * HOUR } }));
        expect(summary.paznja, state).toEqual([]);
        expect(summary.meni.stanje).toBe(state);
      }
    });
  });
});

describe("Sada u lokalu", () => {
  test("late requests are left to Pažnja; the rest are counted by kind and Sada says so", () => {
    const summary = homeSummary(
      ulaz({
        operations: {
          requests: [
            zahtev("call", "new", pre(40)),
            zahtev("call", "new", pre(14)),
            zahtev("bill", "accepted", pre(15)),
            zahtev("bill", "accepted", pre(2)),
            zahtev("order", "new", pre(0)),
          ],
        },
      }),
    );
    expect(summary.paznja).toEqual([{ vrsta: "zahtevi-kasne", broj: 2, pragMin: 15 }]);
    expect(summary.sada?.bezKasnih).toBe(true);
    expect(summary.sada?.zahtevi).toEqual([
      { kind: "call", broj: 1 },
      { kind: "bill", broj: 1 },
      { kind: "order", broj: 1 },
    ]);
  });

  test("`bezKasnih` is false when nothing is late, and `skraceno` follows the server", () => {
    const summary = homeSummary(ulaz({ operations: { requests: [zahtev("call", "new", pre(1))], requestsTruncated: true } }));
    expect(summary.sada?.bezKasnih).toBe(false);
    expect(summary.sada?.skraceno).toBe(true);
    expect(homeSummary(ulaz()).sada?.skraceno).toBe(false);
  });

  describe("reservations today", () => {
    test("only accepted ones of TODAY (Belgrade) that are still to come count; the next one is the earliest", () => {
      const prva = rezervacija("accepted", lokalno("2026-10-21T15:00"), { partySize: 2, positionLabel: "Sto 4" });
      const summary = homeSummary(
        ulaz({
          operations: {
            holdMinutes: 15,
            reservations: [
              rezervacija("accepted", lokalno("2026-10-21T21:30")),
              prva,
              rezervacija("accepted", lokalno("2026-10-21T20:00"), { partySize: 8 }),
              rezervacija("accepted", lokalno("2026-10-22T10:00")),
              rezervacija("new", lokalno("2026-10-21T16:00")),
              rezervacija("arrived", lokalno("2026-10-21T14:30")),
              rezervacija("declined", lokalno("2026-10-21T14:45")),
              rezervacija("cancelled", lokalno("2026-10-21T15:15")),
              rezervacija("change_proposed", lokalno("2026-10-21T17:00")),
            ],
          },
        }),
      );
      expect(summary.sada?.rezervacije).toEqual({
        preostalo: 3,
        sledeca: { at: lokalno("2026-10-21T15:00"), partySize: 2, positionLabel: "Sto 4" },
      });
      // The new one is waiting for an answer (Pažnja), not "coming" (Sada).
      expect(summary.paznja).toEqual([{ vrsta: "rezervacije-cekaju", broj: 1 }]);
    });

    test("the one whose time has come but is still held is still to come (and the next one when it is the earliest)", () => {
      const summary = homeSummary(
        ulaz({
          operations: {
            reservations: [rezervacija("accepted", lokalno("2026-10-21T18:00")), rezervacija("accepted", lokalno("2026-10-21T13:50"), { partySize: 6 })],
          },
        }),
      );
      expect(summary.sada?.rezervacije.preostalo).toBe(2);
      expect(summary.sada?.rezervacije.sledeca).toEqual({ at: lokalno("2026-10-21T13:50"), partySize: 6, positionLabel: null });
    });

    test("the one past the hold is in Pažnja, not in Sada", () => {
      const summary = homeSummary(ulaz({ operations: { reservations: [rezervacija("accepted", lokalno("2026-10-21T13:00")), rezervacija("accepted", lokalno("2026-10-21T19:00"))] } }));
      expect(summary.paznja).toEqual([{ vrsta: "rezervacije-kasne", broj: 1 }]);
      expect(summary.sada?.rezervacije.preostalo).toBe(1);
      expect(summary.sada?.rezervacije.sledeca?.at).toBe(lokalno("2026-10-21T19:00"));
    });

    test("the order the server sends them in does not matter", () => {
      const a = rezervacija("accepted", lokalno("2026-10-21T15:00"));
      const b = rezervacija("accepted", lokalno("2026-10-21T16:00"));
      const c = rezervacija("accepted", lokalno("2026-10-21T17:00"));
      for (const redosled of [[a, b, c], [c, b, a], [b, c, a]]) {
        expect(homeSummary(ulaz({ operations: { reservations: redosled } })).sada?.rezervacije.sledeca?.at).toBe(a.requestedAt);
      }
    });

    test("today is the Belgrade day: just before midnight, 23:55 is today and 00:10 is tomorrow", () => {
      const sada = lokalno("2026-10-21T23:50");
      const summary = homeSummary(
        ulaz({ nowMs: sada, operations: { reservations: [rezervacija("accepted", lokalno("2026-10-21T23:55")), rezervacija("accepted", lokalno("2026-10-22T00:10"))] } }),
      );
      expect(summary.sada?.rezervacije).toMatchObject({ preostalo: 1, sledeca: { at: lokalno("2026-10-21T23:55") } });
    });

    test("just after midnight the new day starts: 00:30 is today, and a reservation of 23:30 yesterday is late (Pažnja)", () => {
      const sada = lokalno("2026-10-22T00:05");
      const summary = homeSummary(
        ulaz({ nowMs: sada, operations: { reservations: [rezervacija("accepted", lokalno("2026-10-22T00:30")), rezervacija("accepted", lokalno("2026-10-21T23:30"))] } }),
      );
      expect(summary.sada?.rezervacije).toMatchObject({ preostalo: 1, sledeca: { at: lokalno("2026-10-22T00:30") } });
      expect(summary.paznja).toEqual([{ vrsta: "rezervacije-kasne", broj: 1 }]);
    });

    test("the day is not UTC: 00:30 Belgrade is still the day before in UTC", () => {
      const sada = lokalno("2026-10-21T00:10");
      const termin = lokalno("2026-10-21T00:40");
      expect(new Date(termin).toISOString().slice(0, 10)).toBe("2026-10-20");
      const summary = homeSummary(ulaz({ nowMs: sada, operations: { reservations: [rezervacija("accepted", termin)] } }));
      expect(summary.sada?.rezervacije.preostalo).toBe(1);
    });

    test("the day of the clock change (25 Oct 2026, 25 hours long) holds exactly its own reservations", () => {
      const sada = lokalno("2026-10-25T12:00");
      const summary = homeSummary(
        ulaz({
          nowMs: sada,
          operations: {
            reservations: [
              rezervacija("accepted", lokalno("2026-10-24T23:59")),
              rezervacija("accepted", lokalno("2026-10-25T13:00")),
              rezervacija("accepted", lokalno("2026-10-25T23:59")),
              rezervacija("accepted", lokalno("2026-10-26T00:00")),
            ],
          },
        }),
      );
      expect(summary.sada?.rezervacije).toMatchObject({ preostalo: 2, sledeca: { at: lokalno("2026-10-25T13:00") } });
      // 23:59 yesterday is long past its hold.
      expect(summary.paznja).toEqual([{ vrsta: "rezervacije-kasne", broj: 1 }]);
    });
  });

  describe("staff on shift", () => {
    test("expired sign-ins do not count", () => {
      const summary = homeSummary(
        ulaz({ operations: { staffSessions: [{ expiresAt: SADA + HOUR }, { expiresAt: SADA - 1 }, { expiresAt: SADA - 3 * HOUR }, { expiresAt: SADA }, { expiresAt: SADA + 2 * HOUR }] } }),
      );
      expect(summary.sada?.osoblje).toBe(2);
    });
  });
});

describe("a role without operations (Urednik)", () => {
  test("`sada` is null and Pažnja has only what the role may see", () => {
    const summary = homeSummary(
      ulaz({
        operations: null,
        mail: null,
        roomServicePriceWarnings: 3,
        menu: { state: "dirty", lastEditAt: SADA - 2 * 24 * HOUR },
      }),
    );
    expect(summary.sada).toBeNull();
    expect(vrste(summary)).toEqual(["room-service", "neobjavljeno"]);
    expect(summary.stanje).toBe("paznja");
  });

  test("a calm editor sees `mirno` and nothing about operations", () => {
    const summary = homeSummary(ulaz({ operations: null, mail: null }));
    expect(summary).toMatchObject({ stanje: "mirno", paznja: [], sada: null });
  });
});

describe("the menu block", () => {
  test("the live version is shown only when both its number and its time are known", () => {
    expect(homeSummary(ulaz({ menu: { liveVersionNumber: 7, livePublishedAt: SADA - HOUR } })).meni.objavljeno).toEqual({ broj: 7, kada: SADA - HOUR });
    expect(homeSummary(ulaz({ menu: { state: "never_published", liveVersionNumber: null, livePublishedAt: null } })).meni).toEqual({
      stanje: "never_published",
      objavljeno: null,
    });
    expect(homeSummary(ulaz({ menu: { liveVersionNumber: 7, livePublishedAt: null } })).meni.objavljeno).toBeNull();
    expect(homeSummary(ulaz({ menu: { liveVersionNumber: null, livePublishedAt: SADA } })).meni.objavljeno).toBeNull();
  });
});

describe("brojkeBloka: what each block shows", () => {
  test("Pažnja shows late requests, late and waiting reservations, price warnings; Sada shows the rest", () => {
    const summary = homeSummary(
      ulaz({
        operations: {
          requests: [zahtev("call", "new", pre(20)), zahtev("bill", "new", pre(1))],
          reservations: [rezervacija("accepted", pre(30)), rezervacija("new", SADA + 3 * HOUR), rezervacija("accepted", SADA + 2 * HOUR)],
        },
        roomServicePriceWarnings: 5,
        mail: { status: "error" },
        menu: { state: "dirty", lastEditAt: pre(48 * 60) },
      }),
    );
    expect(brojkeBloka(summary)).toEqual({
      paznja: [
        { metrika: "requests.late", vrednost: 1 },
        { metrika: "reservations.late", vrednost: 1 },
        { metrika: "reservations.waiting", vrednost: 1 },
        { metrika: "roomService.priceWarnings", vrednost: 5 },
      ],
      sada: [
        { metrika: "requests.active", vrednost: 0 },
        { metrika: "requests.active", vrednost: 1 },
        { metrika: "requests.active", vrednost: 0 },
        { metrika: "reservations.today", vrednost: 1 },
        { metrika: "staff.onShift", vrednost: 1 },
      ],
    });
  });

  test("the lines without a number (staff, mailbox, unpublished) add no number; Sada drops the staff number when Pažnja says nobody is signed in", () => {
    const summary = homeSummary(ulaz({ operations: { requests: [zahtev("call", "new", pre(1))], staffSessions: [] }, mail: { status: "error" } }));
    expect(vrste(summary)).toEqual(["bez-osoblja", "posta"]);
    const brojke = brojkeBloka(summary);
    expect(brojke.paznja).toEqual([]);
    expect(brojke.sada.map((b) => b.metrika)).toEqual(["requests.active", "requests.active", "requests.active", "reservations.today"]);
  });

  test("a role without operations has no numbers in Sada", () => {
    const summary = homeSummary(ulaz({ operations: null, roomServicePriceWarnings: 2 }));
    expect(brojkeBloka(summary)).toEqual({ paznja: [{ metrika: "roomService.priceWarnings", vrednost: 2 }], sada: [] });
  });
});

// -----------------------------------------------------------------------------
// The rule of the screen, on many generated states
// -----------------------------------------------------------------------------

/** A small seeded generator (mulberry32): the same states on every run. */
function generator(seed: number) {
  let stanje = seed >>> 0;
  const next = () => {
    stanje = (stanje + 0x6d2b79f5) >>> 0;
    let t = stanje;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p: number) => next() < p,
    pick: <T>(lista: readonly T[]): T => lista[Math.floor(next() * lista.length)],
  };
}
type Gen = ReturnType<typeof generator>;

const KINDS: readonly MenuRequestKind[] = ["call", "bill", "order"];
const ZAHTEV_STATUSI: readonly MenuRequestStatus[] = ["new", "new", "accepted", "accepted", "done", "cancelled"];
const REZ_STATUSI: readonly MenuReservationStatus[] = ["new", "accepted", "accepted", "declined", "change_proposed", "arrived", "cancelled"];
/** Days around the Belgrade midnight and the clock change of 25 Oct 2026. */
const DANI = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-28"];
/** Wall-clock times that exist on every one of those days (02:00-02:59 of 25 Oct is ambiguous and left out). */
const VREMENA = ["00:00", "00:01", "00:30", "01:00", "03:00", "09:15", "12:00", "14:00", "18:45", "23:00", "23:59"];

function novoStanje(g: Gen): HomeInput {
  const nowMs = lokalno(`${g.pick(DANI)}T${g.pick(VREMENA)}`) + g.pick([-1, 0, 0, 1, g.int(-30_000, 30_000)]);
  const danas = belgradeDateKey(nowMs);
  const prag = g.pick([5, 10, 15, 30]);
  const hold = g.pick([5, 15, 30, 60]);

  const zahtevi: ZahtevUlaz[] = Array.from({ length: g.int(0, 12) }, () => ({
    kind: g.pick(KINDS),
    status: g.pick(ZAHTEV_STATUSI),
    // Around the threshold (1 ms short, exactly, 1 ms over, a minute either way) or anywhere in the last three hours.
    createdAt: g.chance(0.6) ? nowMs - (prag * MINUTE + g.pick([-MINUTE, -1, 0, 1, MINUTE])) : nowMs - g.int(0, 3 * HOUR),
  }));

  const rezervacije: RezervacijaUlaz[] = Array.from({ length: g.int(0, 10) }, () => {
    const obrazac = g.int(0, 4);
    const requestedAt =
      obrazac === 0
        ? nowMs + g.int(-3 * HOUR, 30 * HOUR)
        : obrazac === 1
          ? nowMs - hold * MINUTE + g.pick([-SECOND, -1, 0, 1, SECOND])
          : obrazac === 2
            ? lokalno(`${addDays(danas, g.pick([-1, 0, 0, 1]))}T${g.pick(["00:00", "00:01", "12:00", "23:59"])}`)
            : obrazac === 3
              ? nowMs + g.int(0, 2 * HOUR)
              : nowMs - g.int(0, 40 * MINUTE);
    return { status: g.pick(REZ_STATUSI), requestedAt, partySize: g.int(1, 12), positionLabel: g.chance(0.5) ? `Sto ${g.int(1, 20)}` : null };
  });

  const sesije = Array.from({ length: g.int(0, 4) }, () => ({
    expiresAt: g.chance(0.3) ? nowMs + g.pick([-1, 0, 1]) : nowMs + g.int(-2 * HOUR, 8 * HOUR),
  }));

  const stanjeMenija = g.pick(["never_published", "clean", "dirty"] as const);
  const objavljen = stanjeMenija !== "never_published" && !g.chance(0.05);

  return {
    nowMs,
    menu: {
      state: stanjeMenija,
      liveVersionNumber: objavljen ? g.int(1, 30) : null,
      livePublishedAt: objavljen ? nowMs - g.int(HOUR, 400 * HOUR) : null,
      lastEditAt: g.chance(0.5) ? nowMs - (24 * HOUR + g.pick([-MINUTE, -1, 0, 1, MINUTE])) : nowMs - g.int(0, 72 * HOUR),
    },
    roomServicePriceWarnings: g.pick([null, null, 0, g.int(1, 9)]),
    operations: g.chance(0.1)
      ? null
      : {
          lateThresholdMin: prag,
          holdMinutes: hold,
          requests: zahtevi,
          requestsTruncated: g.chance(0.2),
          reservations: rezervacije,
          staffSessions: sesije,
        },
    mail: g.pick([null, { status: "active" }, { status: "error" }, { status: "none" }] as const),
  };
}

/** Which block owns each metric: exactly one. */
const BLOK_METRIKE: Record<HomeMetric, "paznja" | "sada"> = {
  "requests.late": "paznja",
  "requests.active": "sada",
  "reservations.waiting": "paznja",
  "reservations.late": "paznja",
  "reservations.today": "sada",
  "staff.onShift": "sada",
  "roomService.priceWarnings": "paznja",
};

const REDOSLED: readonly PaznjaVrsta[] = [
  "zahtevi-kasne",
  "bez-osoblja",
  "rezervacije-kasne",
  "rezervacije-cekaju",
  "posta",
  "room-service",
  "neobjavljeno",
];

describe("Početna ne ponavlja istu brojku u dva bloka", () => {
  const BROJ_STANJA = 600;

  test(`${BROJ_STANJA} generated states: no metric in both blocks, the requests add up, staff and calm agree`, () => {
    const g = generator(20261021);
    const pokrivenost = { mirno: 0, mirnoSaOperacijama: 0, urednik: 0, bezOsoblja: 0, kasneZahtevi: 0, rezKasne: 0, rezCekaju: 0, preostalo: 0, neobjavljeno: 0, dst: 0 };

    for (let i = 0; i < BROJ_STANJA; i += 1) {
      const stanje = novoStanje(g);
      const poruka = `state #${i} ${JSON.stringify(stanje)}`;
      const summary = homeSummary(stanje);
      const brojke = brojkeBloka(summary);

      // 1. No metric is present in both Pažnja and Sada, and every metric stands in its own block only.
      const uPaznji = new Set(brojke.paznja.map((b) => b.metrika));
      const uSadi = new Set(brojke.sada.map((b) => b.metrika));
      expect([...uPaznji].filter((metrika) => uSadi.has(metrika)), poruka).toEqual([]);
      for (const metrika of uPaznji) expect(BLOK_METRIKE[metrika], poruka).toBe("paznja");
      for (const metrika of uSadi) expect(BLOK_METRIKE[metrika], poruka).toBe("sada");
      // ...and Pažnja never lists a metric twice.
      expect(uPaznji.size, poruka).toBe(brojke.paznja.length);

      // 2. "Mirno" exactly when Pažnja is empty; Pažnja keeps its order and has no duplicate line.
      expect(summary.stanje === "mirno", poruka).toBe(summary.paznja.length === 0);
      const indeksi = vrste(summary).map((vrsta) => REDOSLED.indexOf(vrsta));
      expect(indeksi.every((indeks) => indeks >= 0), poruka).toBe(true);
      expect(indeksi, poruka).toEqual([...indeksi].sort((a, b) => a - b));
      expect(new Set(indeksi).size, poruka).toBe(indeksi.length);

      // 3. The menu block mirrors the input.
      expect(summary.meni.stanje, poruka).toBe(stanje.menu.state);
      const neobjavljeno = stanje.menu.state === "dirty" && stanje.nowMs - stanje.menu.lastEditAt >= HOME_UNPUBLISHED_STALE_MS;
      expect(vrste(summary).includes("neobjavljeno"), poruka).toBe(neobjavljeno);
      expect(vrste(summary).includes("posta"), poruka).toBe(stanje.mail?.status === "error");
      const upozorenja = stanje.roomServicePriceWarnings;
      const roomLinija = summary.paznja.find((stavka) => stavka.vrsta === "room-service");
      expect(roomLinija === undefined, poruka).toBe(upozorenja === null || upozorenja === 0);
      if (roomLinija?.vrsta === "room-service") expect(roomLinija.broj, poruka).toBe(upozorenja);

      const operacije = stanje.operations;
      if (neobjavljeno) pokrivenost.neobjavljeno += 1;
      if (belgradeDateKey(stanje.nowMs) === "2026-10-25") pokrivenost.dst += 1;
      if (summary.stanje === "mirno") pokrivenost.mirno += 1;

      if (operacije === null) {
        // A role without operations: no Sada, no operations line, no numbers from operations.
        expect(summary.sada, poruka).toBeNull();
        expect(brojke.sada, poruka).toEqual([]);
        for (const vrsta of ["zahtevi-kasne", "bez-osoblja", "rezervacije-kasne", "rezervacije-cekaju"] as const) {
          expect(vrste(summary).includes(vrsta), poruka).toBe(false);
        }
        pokrivenost.urednik += 1;
        continue;
      }

      // 4. Late requests + the rest of Sada = every active request.
      const { nowMs } = stanje;
      const aktivni = operacije.requests.filter((r) => r.status === "new" || r.status === "accepted");
      const kasne = aktivni.filter((r) => nowMs - r.createdAt >= operacije.lateThresholdMin * MINUTE);
      const kasneLinija = summary.paznja.find((stavka) => stavka.vrsta === "zahtevi-kasne");
      expect(kasneLinija?.vrsta === "zahtevi-kasne" ? kasneLinija.broj : 0, poruka).toBe(kasne.length);
      if (kasneLinija?.vrsta === "zahtevi-kasne") expect(kasneLinija.pragMin, poruka).toBe(operacije.lateThresholdMin);
      expect(summary.sada, poruka).not.toBeNull();
      const sada = summary.sada!;
      const uSadiZahtevi = sada.zahtevi.reduce((zbir, z) => zbir + z.broj, 0);
      expect(kasne.length + uSadiZahtevi, poruka).toBe(aktivni.length);
      expect(sada.zahtevi.map((z) => z.kind), poruka).toEqual(["call", "bill", "order"]);
      for (const z of sada.zahtevi) {
        expect(z.broj, poruka).toBe(aktivni.filter((r) => r.kind === z.kind && nowMs - r.createdAt < operacije.lateThresholdMin * MINUTE).length);
      }
      expect(sada.bezKasnih, poruka).toBe(kasne.length > 0);
      expect(sada.skraceno, poruka).toBe(operacije.requestsTruncated);

      // 5. Staff: Sada has no staff number exactly when Pažnja says nobody is signed in.
      const uSmeni = operacije.staffSessions.filter((s) => s.expiresAt > nowMs).length;
      const bezOsoblja = uSmeni === 0 && aktivni.some((r) => r.status === "new");
      expect(vrste(summary).includes("bez-osoblja"), poruka).toBe(bezOsoblja);
      expect(sada.osoblje === null, poruka).toBe(vrste(summary).includes("bez-osoblja"));
      if (sada.osoblje !== null) expect(sada.osoblje, poruka).toBe(uSmeni);
      expect(brojke.sada.some((b) => b.metrika === "staff.onShift"), poruka).toBe(sada.osoblje !== null);

      // 6. Reservations: each accepted one is late (Pažnja) or still to come today (Sada), never both; new ones only wait.
      const holdMs = operacije.holdMinutes * MINUTE;
      const prihvacene = operacije.reservations.filter((r) => r.status === "accepted");
      const rezKasne = prihvacene.filter((r) => nowMs - r.requestedAt >= holdMs);
      // Today's still to come, plus one whose time has come and whose hold still runs (also past midnight).
      const dolaze = prihvacene.filter(
        (r) =>
          nowMs - r.requestedAt < holdMs &&
          (r.requestedAt <= nowMs || belgradeDateKey(r.requestedAt) === belgradeDateKey(nowMs)),
      );
      const cekaju = operacije.reservations.filter((r) => r.status === "new");
      const rezKasneLinija = summary.paznja.find((stavka) => stavka.vrsta === "rezervacije-kasne");
      const rezCekajuLinija = summary.paznja.find((stavka) => stavka.vrsta === "rezervacije-cekaju");
      expect(rezKasneLinija?.vrsta === "rezervacije-kasne" ? rezKasneLinija.broj : 0, poruka).toBe(rezKasne.length);
      expect(rezCekajuLinija?.vrsta === "rezervacije-cekaju" ? rezCekajuLinija.broj : 0, poruka).toBe(cekaju.length);
      expect(sada.rezervacije.preostalo, poruka).toBe(dolaze.length);
      expect(sada.rezervacije.preostalo + rezKasne.length, poruka).toBeLessThanOrEqual(prihvacene.length);
      if (dolaze.length === 0) {
        expect(sada.rezervacije.sledeca, poruka).toBeNull();
      } else {
        const najranije = Math.min(...dolaze.map((r) => r.requestedAt));
        expect(sada.rezervacije.sledeca?.at, poruka).toBe(najranije);
      }

      if (summary.stanje === "mirno") pokrivenost.mirnoSaOperacijama += 1;
      if (bezOsoblja) pokrivenost.bezOsoblja += 1;
      if (kasne.length > 0) pokrivenost.kasneZahtevi += 1;
      if (rezKasne.length > 0) pokrivenost.rezKasne += 1;
      if (cekaju.length > 0) pokrivenost.rezCekaju += 1;
      if (dolaze.length > 0) pokrivenost.preostalo += 1;
    }

    // The generator reaches every case (a property over states that never meet the case proves nothing).
    // Coverage thresholds were set for 2000 states; they scale with BROJ_STANJA (600 keeps the full suite under its timeout).
    expect(pokrivenost.mirno).toBeGreaterThanOrEqual(Math.ceil((10 * BROJ_STANJA) / 2000));
    expect(pokrivenost.mirnoSaOperacijama).toBeGreaterThanOrEqual(Math.ceil((5 * BROJ_STANJA) / 2000));
    expect(pokrivenost.urednik).toBeGreaterThanOrEqual(Math.ceil((100 * BROJ_STANJA) / 2000));
    expect(pokrivenost.bezOsoblja).toBeGreaterThanOrEqual(Math.ceil((50 * BROJ_STANJA) / 2000));
    expect(pokrivenost.kasneZahtevi).toBeGreaterThanOrEqual(Math.ceil((500 * BROJ_STANJA) / 2000));
    expect(pokrivenost.rezKasne).toBeGreaterThanOrEqual(Math.ceil((50 * BROJ_STANJA) / 2000));
    expect(pokrivenost.rezCekaju).toBeGreaterThanOrEqual(Math.ceil((50 * BROJ_STANJA) / 2000));
    expect(pokrivenost.preostalo).toBeGreaterThanOrEqual(Math.ceil((50 * BROJ_STANJA) / 2000));
    expect(pokrivenost.neobjavljeno).toBeGreaterThanOrEqual(Math.ceil((50 * BROJ_STANJA) / 2000));
    expect(pokrivenost.dst).toBeGreaterThanOrEqual(Math.ceil((100 * BROJ_STANJA) / 2000));
  });

  test("the generator is deterministic: the same seed gives the same states", () => {
    const stanja = (seed: number) => {
      const g = generator(seed);
      return Array.from({ length: 20 }, () => JSON.stringify(novoStanje(g)));
    };
    expect(stanja(7)).toEqual(stanja(7));
    expect(new Set(stanja(7)).size).toBeGreaterThan(15);
    expect(stanja(7)).not.toEqual(stanja(8));
  });
});
