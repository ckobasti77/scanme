// K34 render tests for the waiter panel (review findings C1 and C5). Server markup only
// (renderToStaticMarkup, no DOM). Two modes:
//   - as everywhere in this folder, useSyncExternalStore answers with its SERVER snapshot (what
//     the server render and the hydration read);
//   - `klijent.ukljucen` makes it answer with the CLIENT snapshot instead, which is what the live
//     panel reads after hydration (a fake system clock moves it). This is the only way to reach
//     the clock hook here, because there is no DOM to mount a component in.
// C5  the occupancy label of a table: a mark of an earlier Belgrade day carries its date in the
//     same `{vreme}` slot, a mark of today keeps the bare time (ZauzetostStola).
// C1  useSat: the page's clock offset (PomakSataKontekst) reaches the clock of the PIN screen and
//     the panel; the izlog path and the server snapshot are exactly as before. The live route
//     (ruta.tsx) measures it once and provides it to both screens (Convex and the two screens are
//     replaced by probes that print the offset they see).
// Texts are read from the dictionaries. Invented data only.

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { belgradeLocalToEpoch } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { KonobarRuta } from "./ruta";
import { ZauzetostStola, type ZauzetostStolaProps } from "./sto/zauzetost";
import { PomakSataKontekst, useSat } from "./use-sat";

const klijent = vi.hoisted(() => ({ ukljucen: false }));
/** Does the (mocked) Convex say that the PIN sign-in of ruta.tsx is valid? */
const sesija = vi.hoisted(() => ({ prijavljen: false }));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const useSyncExternalStore: typeof actual.useSyncExternalStore = (subscribe, getSnapshot, getServerSnapshot) =>
    klijent.ukljucen ? getSnapshot() : actual.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...actual, useSyncExternalStore };
});

vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexConnectionState: () => ({ hasEverConnected: false, isWebSocketConnected: false }),
    useMutation: () => async () => null,
    useQuery: (ref: Parameters<typeof getFunctionName>[0]) =>
      sesija.prijavljen && getFunctionName(ref) === "menuWaiter:me"
        ? { kind: "pin", displayName: "Milan", businessName: "Demo restoran", expiresAt: null }
        : undefined,
  };
});

// The two screens of the route, reduced to what the route gives them: the clock offset they would read.
vi.mock("./pin/pin-ekran", async () => {
  const { createElement, useContext } = await import("react");
  const { PomakSataKontekst: kontekst } = await import("./use-sat");
  return { PinEkran: () => createElement("i", { "data-ekran": "pin", "data-pomak": useContext(kontekst) }) };
});
vi.mock("./panel", async () => {
  const { createElement, useContext } = await import("react");
  const { PomakSataKontekst: kontekst } = await import("./use-sat");
  return { KonobarPanel: () => createElement("i", { "data-ekran": "panel", "data-pomak": useContext(kontekst) }) };
});

afterEach(() => {
  klijent.ukljucen = false;
  sesija.prijavljen = false;
  vi.useRealTimers();
});

const t = menuKonobarSr;
const NISTA = () => undefined;
const SEKUNDA = 1000;
const MINUT = 60 * SEKUNDA;

/** A Belgrade wall-clock time ("2026-10-21T21:03") as an epoch; a typo fails loudly. */
function u(local: string): number {
  const epoch = belgradeLocalToEpoch(local);
  if (epoch === null) throw new Error(`not a Belgrade time: ${local}`);
  return epoch;
}

const unesc = (text: string) =>
  text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");

/** What a person could read: no tags, one line. */
const tekst = (html: string) => unesc(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// --- C5: the occupancy label of a table ----------------------------------------------------

function oznaka(preko: Partial<ZauzetostStolaProps>): string {
  const html = renderToStaticMarkup(
    <ZauzetostStola
      stanje="occupied"
      meta={{ updatedAt: u("2026-10-21T21:03"), updatedBy: "Milan" }}
      radi={false}
      iskljuceno={false}
      onPromena={NISTA}
      {...preko}
    />,
  );
  const trenutno = /<p data-zauzetost-trenutno="([^"]*)"[^>]*>([\s\S]*?)<\/p>/.exec(html);
  if (!trenutno) throw new Error("the current-state line is missing");
  return tekst(trenutno[2]);
}

const zauzet = (vreme: string, ime = "Milan") => fmt(t.sto.statusPromenio, { stanje: t.zauzetost.occupied, vreme, ime });
const zauzetBezImena = (vreme: string) => fmt(t.sto.statusPromenioBezImena, { stanje: t.zauzetost.occupied, vreme });

describe("C5: the occupancy label shows the date of a mark that is not from today", () => {
  test("a mark of today keeps the bare time", () => {
    expect(oznaka({ sadaMs: u("2026-10-21T22:30") })).toBe(zauzet("21:03"));
    expect(oznaka({ sadaMs: u("2026-10-21T21:03") })).toBe(zauzet("21:03"));
    expect(oznaka({ sadaMs: u("2026-10-21T23:59") })).toBe(zauzet("21:03"));
  });

  test("a mark of yesterday evening reads 'od 20. 10. 21:03', not as if it were fresh", () => {
    const tekstOznake = oznaka({ sadaMs: u("2026-10-21T09:00"), meta: { updatedAt: u("2026-10-20T21:03"), updatedBy: "Milan" } });
    expect(tekstOznake).toBe(zauzet("20. 10. 21:03"));
    expect(tekstOznake).toContain("20. 10. 21:03");
    // The same time of day, one day later, is no longer the fresh-looking "od 21:03".
    expect(oznaka({ sadaMs: u("2026-10-21T21:03"), meta: { updatedAt: u("2026-10-20T21:03"), updatedBy: "Milan" } })).not.toBe(zauzet("21:03"));
  });

  test("the date is in the same slot with and without the name of whoever set it", () => {
    const stara = { updatedAt: u("2026-10-18T07:09") };
    expect(oznaka({ sadaMs: u("2026-10-21T09:00"), meta: { ...stara, updatedBy: "Milan" } })).toBe(zauzet("18. 10. 07:09"));
    expect(oznaka({ sadaMs: u("2026-10-21T09:00"), meta: { ...stara, updatedBy: null } })).toBe(zauzetBezImena("18. 10. 07:09"));
    expect(oznaka({ sadaMs: u("2026-10-21T09:00"), meta: { updatedAt: u("2026-10-21T07:09"), updatedBy: null } })).toBe(
      zauzetBezImena("07:09"),
    );
  });

  test("the Belgrade day decides, also across the change of 25 Oct 2026 (the clocks go back)", () => {
    // Saturday 21:03 (CEST), read on Sunday morning (CET).
    expect(oznaka({ sadaMs: u("2026-10-25T10:00"), meta: { updatedAt: u("2026-10-24T21:03"), updatedBy: "Milan" } })).toBe(
      zauzet("24. 10. 21:03"),
    );
    // Sunday 00:30 (CEST) and Sunday 23:40 (CET) are 24 h 10 min apart but the same date.
    expect(oznaka({ sadaMs: u("2026-10-25T23:40"), meta: { updatedAt: u("2026-10-25T00:30"), updatedBy: "Milan" } })).toBe(zauzet("00:30"));
    // Sunday 23:40 (CET), read just after midnight.
    expect(oznaka({ sadaMs: u("2026-10-26T00:10"), meta: { updatedAt: u("2026-10-25T23:40"), updatedBy: "Milan" } })).toBe(
      zauzet("25. 10. 23:40"),
    );
  });

  test("a neutral table and a state without a record keep their lines", () => {
    expect(oznaka({ stanje: "neutral", meta: null, sadaMs: u("2026-10-21T09:00") })).toBe(`${t.sto.neutralno} — ${t.sto.neutralnoOpis}`);
    expect(oznaka({ meta: null, sadaMs: u("2026-10-21T09:00") })).toBe(fmt(t.sto.statusTrenutno, { stanje: t.zauzetost.occupied }));
  });

  test("with no clock handed in, the server render and the hydration read the mark as of now: the bare time", () => {
    const stara = { updatedAt: u("2026-10-17T18:07"), updatedBy: "Milan" };
    expect(oznaka({ meta: stara })).toBe(zauzet("18:07"));
  });

  test("with no clock handed in, the live panel clock decides once it runs", () => {
    klijent.ukljucen = true;
    vi.useFakeTimers();
    vi.setSystemTime(u("2026-10-21T09:00"));
    expect(oznaka({ meta: { updatedAt: u("2026-10-20T21:03"), updatedBy: "Milan" } })).toBe(zauzet("20. 10. 21:03"));
    expect(oznaka({ meta: { updatedAt: u("2026-10-21T08:15"), updatedBy: "Milan" } })).toBe(zauzet("08:15"));
  });

  test("the live panel clock is the corrected one: a device 20 minutes behind does not make yesterday's mark look fresh", () => {
    klijent.ukljucen = true;
    vi.useFakeTimers();
    // The server's time is 00:10 on the 21st; this device still shows 23:50 on the 20th.
    vi.setSystemTime(u("2026-10-20T23:50"));
    const stara = { updatedAt: u("2026-10-20T23:40"), updatedBy: "Milan" };
    const render = (pomak: number) =>
      renderToStaticMarkup(
        <PomakSataKontekst.Provider value={pomak}>
          <ZauzetostStola stanje="occupied" meta={stara} radi={false} iskljuceno={false} onPromena={NISTA} />
        </PomakSataKontekst.Provider>,
      );
    expect(tekst(render(0))).toContain(zauzet("23:40"));
    expect(tekst(render(20 * MINUT))).toContain(zauzet("20. 10. 23:40"));
  });
});

// --- C1: the clock hook --------------------------------------------------------------------

describe("C1: useSat reads the page's clock offset", () => {
  function Sat({ pocetnoMs, izlogOd }: { pocetnoMs: number; izlogOd?: number }) {
    const sekunda = useSat(pocetnoMs, { izlogOd });
    return <i>{sekunda}</i>;
  }

  /** The second the clock hook shows. */
  function sat(pocetnoMs: number, pomak?: number, izlogOd?: number): number {
    const drvo = <Sat pocetnoMs={pocetnoMs} izlogOd={izlogOd} />;
    const html = renderToStaticMarkup(pomak === undefined ? drvo : <PomakSataKontekst.Provider value={pomak}>{drvo}</PomakSataKontekst.Provider>);
    return Number(tekst(html));
  }

  // The device reads 10:00:00 and a little (the clock hook floors to the second). The page was rendered
  // a minute before the corrected clock now reads, so the server's instant and "now" differ.
  const UREDJAJ = u("2026-10-21T10:00") + 250;
  const SERVER = u("2026-10-21T09:40");

  function naUredjaju() {
    klijent.ukljucen = true;
    vi.useFakeTimers();
    vi.setSystemTime(UREDJAJ);
  }

  test("without a page offset the clock is the device's, as before", () => {
    naUredjaju();
    expect(sat(SERVER)).toBe(u("2026-10-21T10:00"));
    expect(sat(SERVER, 0)).toBe(u("2026-10-21T10:00"));
  });

  test("with the page offset (device 19 minutes ahead of the server) the clock reads server time", () => {
    naUredjaju();
    const pomak = -19 * MINUT;
    expect(sat(SERVER, pomak)).toBe(u("2026-10-21T09:41"));
    // ...and moves with the device clock from there.
    vi.setSystemTime(UREDJAJ + 7 * SEKUNDA);
    expect(sat(SERVER, pomak)).toBe(u("2026-10-21T09:41") + 7 * SEKUNDA);
  });

  test("the izlog keeps its own clock (it starts at its fixed instant), whatever offset surrounds it", () => {
    naUredjaju();
    const izlogOd = u("2026-10-17T18:27");
    expect(sat(izlogOd, undefined, izlogOd)).toBe(izlogOd);
    expect(sat(izlogOd, -19 * MINUT, izlogOd)).toBe(izlogOd);
    expect(sat(izlogOd, 5 * MINUT, izlogOd)).toBe(izlogOd);
  });

  test("the server render and the hydration read the server's instant, offset or not", () => {
    vi.useFakeTimers();
    vi.setSystemTime(UREDJAJ);
    expect(sat(SERVER)).toBe(SERVER);
    expect(sat(SERVER, -19 * MINUT)).toBe(SERVER);
    expect(sat(SERVER + 400)).toBe(SERVER);
  });
});

describe("C1: the live route measures the offset once, when the page loads, and gives it to both screens", () => {
  const NOW = u("2026-10-21T10:00");

  function ruta(pocetnoMs: number, token: string | null) {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const html = renderToStaticMarkup(
      <KonobarRuta slug="demo-restoran" panelCode="K7M2Q9XA" lokal="Demo restoran" pinDostupan pocetniToken={token} pocetnoMs={pocetnoMs} />,
    );
    const ekran = /data-ekran="([a-z]+)"/.exec(html)?.[1];
    const pomak = /data-pomak="(-?\d+)"/.exec(html)?.[1];
    return { ekran, pomak: pomak === undefined ? undefined : Number(pomak) };
  }

  test("a server instant 19 minutes after this device's clock is an offset of +19 minutes (the device is behind)", () => {
    expect(ruta(NOW + 19 * MINUT, null)).toEqual({ ekran: "pin", pomak: 19 * MINUT });
  });

  test("a server instant 19 minutes before it is -19 minutes (the device is ahead)", () => {
    expect(ruta(NOW - 19 * MINUT, null)).toEqual({ ekran: "pin", pomak: -19 * MINUT });
  });

  test("the panel gets the same offset as the PIN screen (a signed-in device)", () => {
    sesija.prijavljen = true;
    expect(ruta(NOW + 19 * MINUT, "a".repeat(43))).toEqual({ ekran: "panel", pomak: 19 * MINUT });
  });

  test("a page delivered within a minute needs no correction; a difference of more than 12 hours is no skew", () => {
    expect(ruta(NOW + 5 * SEKUNDA, null)).toEqual({ ekran: "pin", pomak: 0 });
    expect(ruta(NOW - 59 * SEKUNDA, null)).toEqual({ ekran: "pin", pomak: 0 });
    expect(ruta(NOW + 13 * 60 * MINUT, null)).toEqual({ ekran: "pin", pomak: 0 });
  });
});
