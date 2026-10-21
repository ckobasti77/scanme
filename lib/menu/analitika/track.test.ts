// @vitest-environment node
//
// ScanMe Menu V1 (K13 seam, K29 events) — the analytics of the public menu in
// the guest's browser. track.ts keeps module state (context, queue, timer), so
// every test loads a fresh copy; the browser (window, localStorage, document,
// navigator.sendBeacon) is a stub and the clock is fake.
// Tags [izlog] (nothing leaves without a live public page, batching) and
// [sesija-30] (the session id in the guest's browser).

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { SESIJA_PATTERN } from "./sesija";

const PG = "pg_5k2m9q0x7c1d";
const PG_DRUGA = "pg_0123456789ab";
const AR = "ar_5k2m9q0x7c1d";
const KARTICA = "k123456789ab";
const ID = "abcdefghjkmnpqrs";

const MINUT = 60 * 1000;
const POLA_SATA = 30 * MINUT;
const T0 = Date.UTC(2026, 9, 21, 12, 0, 0);

type Track = typeof import("./track");
type JavniAnalitika = import("./track").JavniAnalitika;
type Rezim = JavniAnalitika["rezim"];

const kontekst = (dopuna: Partial<JavniAnalitika> = {}): JavniAnalitika => ({
  slug: "cafe-bar",
  jezik: "sr",
  kartica: null,
  rezim: "iskljuceno",
  ...dopuna,
});

type PoslatoTelo = { slug: string; dogadjaji: Record<string, string>[] };

function postaviBrowser(pocetno: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(pocetno));
  const localStorage = {
    getItem: vi.fn((kljuc: string) => store.get(kljuc) ?? null),
    setItem: vi.fn((kljuc: string, vrednost: string) => {
      store.set(kljuc, vrednost);
    }),
  };
  const dokument = { addEventListener: vi.fn(), visibilityState: "visible" as string };
  const prozor = { localStorage, addEventListener: vi.fn() };
  const sendBeacon = vi.fn<(adresa: string, telo: Blob) => boolean>(() => true);
  vi.stubGlobal("window", prozor);
  vi.stubGlobal("document", dokument);
  vi.stubGlobal("navigator", { sendBeacon });
  return { store, localStorage, dokument, prozor, sendBeacon };
}

/** A fresh copy of track.ts (its context, queue and timer start empty). */
async function ucitajTrack(): Promise<Track> {
  vi.resetModules();
  return import("./track");
}

async function tela(sendBeacon: { mock: { calls: [string, Blob][] } }): Promise<PoslatoTelo[]> {
  return Promise.all(sendBeacon.mock.calls.map(async ([, blob]) => JSON.parse(await blob.text()) as PoslatoTelo));
}

async function sviDogadjaji(sendBeacon: { mock: { calls: [string, Blob][] } }): Promise<Record<string, string>[]> {
  return (await tela(sendBeacon)).flatMap((telo) => telo.dogadjaji);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("nothing leaves without a live public page", () => {
  test("[izlog] without postaviAnalitiku trackJavni does nothing: no queue, no timer, no storage, no listeners", async () => {
    const { store, localStorage, dokument, prozor, sendBeacon } = postaviBrowser();
    const { trackJavni } = await ucitajTrack();

    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    trackJavni({ vrsta: "korak", korak: "zahtev" });
    vi.advanceTimersByTime(5000);

    expect(sendBeacon).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    expect(dokument.addEventListener).not.toHaveBeenCalled();
    expect(prozor.addEventListener).not.toHaveBeenCalled();
  });

  test("[izlog] outside a browser (no window) trackJavni does nothing and does not throw", async () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal("navigator", { sendBeacon });
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    expect(() => trackJavni({ vrsta: "stranica", stranica: PG })).not.toThrow();
    vi.advanceTimersByTime(5000);

    expect(sendBeacon).not.toHaveBeenCalled();
  });

  test("[izlog] after the page is left (context null) events are no longer counted", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    postaviAnalitiku(null);
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(5000);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  test("[izlog] a context can be set again after it was cleared", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    postaviAnalitiku(null);
    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(2000);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});

describe("a live public page with the identifier off (iskljuceno)", () => {
  test("[izlog] a page open leaves after 2 s as ONE beacon with the documented body and no session", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni, ANALITIKA_PUTANJA } = await ucitajTrack();

    postaviAnalitiku(kontekst({ kartica: KARTICA }));
    trackJavni({ vrsta: "stranica", stranica: PG });

    vi.advanceTimersByTime(1999);
    expect(sendBeacon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    const [adresa, blob] = sendBeacon.mock.calls[0];
    expect(adresa).toBe("/api/meni/analitika");
    expect(adresa).toBe(ANALITIKA_PUTANJA);
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text())).toStrictEqual({
      slug: "cafe-bar",
      dogadjaji: [{ vrsta: "stranica", stranica: PG, jezik: "sr", kartica: KARTICA }],
    });
  });

  test("[izlog] a plain link (no card) sends no kartica", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ kartica: null, jezik: "en" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(2000);

    expect(await sviDogadjaji(sendBeacon)).toStrictEqual([{ vrsta: "stranica", stranica: PG, jezik: "en" }]);
  });

  test("[izlog] a detail carries page, article and language, never the card", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ kartica: KARTICA }));
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(2000);

    expect(await sviDogadjaji(sendBeacon)).toStrictEqual([{ vrsta: "detalj", stranica: PG, artikal: AR, jezik: "sr" }]);
  });

  test("[izlog] no session id is created or stored while the identifier is off", async () => {
    const { store, localStorage, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "iskljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(2000);

    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
    for (const dogadjaj of await sviDogadjaji(sendBeacon)) expect(dogadjaj).not.toHaveProperty("sesija");
  });

  test("[izlog] a step event is not queued at all without a session", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "korak", korak: "zahtev" });
    trackJavni({ vrsta: "korak", korak: "porudzbina" });
    trackJavni({ vrsta: "korak", korak: "rezervacija" });

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(sendBeacon).not.toHaveBeenCalled();
    postaviAnalitiku(null);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  test("[izlog] a step event does not travel with the page opens that wait beside it", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "korak", korak: "zahtev" });
    vi.advanceTimersByTime(2000);

    const dogadjaji = await sviDogadjaji(sendBeacon);
    expect(dogadjaji.map((dogadjaj) => dogadjaj.vrsta)).toEqual(["stranica"]);
  });
});

describe("batching", () => {
  test("[izlog] the 2 s wait starts with the first event; a later event does not postpone the send", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(1000);
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(999);
    expect(sendBeacon).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [telo] = await tela(sendBeacon);
    expect(telo.slug).toBe("cafe-bar");
    expect(telo.dogadjaji.map((dogadjaj) => dogadjaj.vrsta)).toEqual(["stranica", "detalj"]);
  });

  test("[izlog] 10 events are sent at once, without waiting", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    for (let index = 0; index < 9; index += 1) trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    expect(sendBeacon).not.toHaveBeenCalled();

    trackJavni({ vrsta: "stranica", stranica: PG });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [telo] = await tela(sendBeacon);
    expect(telo.dogadjaji).toHaveLength(10);
    expect(telo.dogadjaji[9].vrsta).toBe("stranica");

    // The pending timer was cleared: no empty second request.
    vi.advanceTimersByTime(5000);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("[izlog] 25 events leave as 10 + 10 at once and the last 5 after 2 s", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    for (let index = 0; index < 25; index += 1) trackJavni({ vrsta: "stranica", stranica: PG });
    expect(sendBeacon).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(2000);
    expect(sendBeacon).toHaveBeenCalledTimes(3);
    expect((await tela(sendBeacon)).map((telo) => telo.dogadjaji.length)).toEqual([10, 10, 5]);
  });

  test("[izlog] after an immediate send the next event starts a new 2 s wait", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    for (let index = 0; index < 10; index += 1) trackJavni({ vrsta: "stranica", stranica: PG });
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(700);
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(1999);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(sendBeacon).toHaveBeenCalledTimes(2);
    expect((await tela(sendBeacon))[1].dogadjaji).toHaveLength(1);
  });

  test("[izlog] postaviAnalitiku(null) sends what waits right away", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    expect(sendBeacon).not.toHaveBeenCalled();

    postaviAnalitiku(null);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect((await tela(sendBeacon))[0].dogadjaji).toHaveLength(2);

    vi.advanceTimersByTime(5000);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });

  test("[izlog] postaviAnalitiku(null) with nothing waiting sends nothing", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    postaviAnalitiku(null);
    postaviAnalitiku(null);
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  test("[izlog] moving to another venue sends the old venue's events first, in their own request", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ slug: "cafe-bar" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    postaviAnalitiku(kontekst({ slug: "hotel-vista" }));
    expect(sendBeacon).toHaveBeenCalledTimes(1);

    trackJavni({ vrsta: "stranica", stranica: PG_DRUGA });
    vi.advanceTimersByTime(2000);
    expect(sendBeacon).toHaveBeenCalledTimes(2);

    const [prvo, drugo] = await tela(sendBeacon);
    expect(prvo.slug).toBe("cafe-bar");
    expect(prvo.dogadjaji.map((dogadjaj) => dogadjaj.stranica)).toEqual([PG]);
    expect(drugo.slug).toBe("hotel-vista");
    expect(drugo.dogadjaji.map((dogadjaj) => dogadjaj.stranica)).toEqual([PG_DRUGA]);
  });

  test("[izlog] switching the language on the same venue does not send early and each event keeps the language it was recorded in", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ jezik: "sr" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    postaviAnalitiku(kontekst({ jezik: "en" }));
    expect(sendBeacon).not.toHaveBeenCalled();
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(2000);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect((await sviDogadjaji(sendBeacon)).map((dogadjaj) => dogadjaj.jezik)).toEqual(["sr", "en"]);
  });
});

describe("hiding the page", () => {
  test("[izlog] the visibility and pagehide listeners are added once, not per event", async () => {
    const { dokument, prozor } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    for (let index = 0; index < 5; index += 1) trackJavni({ vrsta: "stranica", stranica: PG });

    expect(dokument.addEventListener).toHaveBeenCalledTimes(1);
    expect(dokument.addEventListener.mock.calls[0][0]).toBe("visibilitychange");
    expect(prozor.addEventListener).toHaveBeenCalledTimes(1);
    expect(prozor.addEventListener.mock.calls[0][0]).toBe("pagehide");
  });

  test("[izlog] hiding the page sends what waits; a page that stays visible does not", async () => {
    const { dokument, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    const slusalac = dokument.addEventListener.mock.calls.find(([ime]) => ime === "visibilitychange")![1] as () => void;

    dokument.visibilityState = "visible";
    slusalac();
    expect(sendBeacon).not.toHaveBeenCalled();

    dokument.visibilityState = "hidden";
    slusalac();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(await sviDogadjaji(sendBeacon)).toHaveLength(1);
  });

  test("[izlog] pagehide sends what waits", async () => {
    const { prozor, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    const slusalac = prozor.addEventListener.mock.calls.find(([ime]) => ime === "pagehide")![1] as () => void;
    slusalac();

    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});

describe("sending", () => {
  test("[izlog] when sendBeacon refuses the same JSON goes out by fetch with keepalive", async () => {
    const { sendBeacon } = postaviBrowser();
    sendBeacon.mockReturnValue(false);
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(2000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [adresa, opcije] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(adresa).toBe("/api/meni/analitika");
    expect(opcije.method).toBe("POST");
    expect(opcije.keepalive).toBe(true);
    expect(opcije.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(opcije.body as string)).toStrictEqual({
      slug: "cafe-bar",
      dogadjaji: [{ vrsta: "stranica", stranica: PG, jezik: "sr" }],
    });
  });

  test("[izlog] without navigator.sendBeacon the send goes out by fetch", async () => {
    postaviBrowser();
    vi.stubGlobal("navigator", {});
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    vi.stubGlobal("fetch", fetchMock);
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(2000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("[izlog] a failing send never breaks the menu", async () => {
    const { sendBeacon } = postaviBrowser();
    sendBeacon.mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst());
    expect(() => {
      trackJavni({ vrsta: "stranica", stranica: PG });
      vi.advanceTimersByTime(2000);
      postaviAnalitiku(null);
    }).not.toThrow();
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});

describe("the session id in the guest's browser", () => {
  const KLJUC = "smm_an:cafe-bar";

  test("[sesija-30] with the identifier on, events carry a well-formed session id and its state is stored under smm_an:<slug>", async () => {
    const { store, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(2000);

    const [dogadjaj] = await sviDogadjaji(sendBeacon);
    expect(dogadjaj.sesija).toMatch(SESIJA_PATTERN);
    expect(JSON.parse(store.get(KLJUC)!)).toStrictEqual({ s: dogadjaj.sesija, t: T0 });
    expect([...store.keys()]).toEqual([KLJUC]);
  });

  test("[sesija-30] events less than 30 minutes apart share one session, even when the whole run is longer", async () => {
    const { store, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(20 * MINUT);
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    vi.advanceTimersByTime(20 * MINUT);
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    postaviAnalitiku(null);

    const dogadjaji = await sviDogadjaji(sendBeacon);
    expect(dogadjaji).toHaveLength(3);
    expect(new Set(dogadjaji.map((dogadjaj) => dogadjaj.sesija)).size).toBe(1);
    expect(JSON.parse(store.get(KLJUC)!).t).toBe(T0 + 40 * MINUT);
  });

  test("[sesija-30] a pause of exactly 30 minutes starts a new session, 29:59.999 does not", async () => {
    const { store, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG }); // t = 0
    vi.advanceTimersByTime(POLA_SATA - 1);
    trackJavni({ vrsta: "stranica", stranica: PG }); // 29:59.999 after the first: same session
    vi.advanceTimersByTime(POLA_SATA);
    trackJavni({ vrsta: "stranica", stranica: PG }); // exactly 30:00 after the second: new session
    postaviAnalitiku(null);

    const sesije = (await sviDogadjaji(sendBeacon)).map((dogadjaj) => dogadjaj.sesija);
    expect(sesije).toHaveLength(3);
    expect(sesije[1]).toBe(sesije[0]);
    expect(sesije[2]).not.toBe(sesije[0]);
    expect(sesije[2]).toMatch(SESIJA_PATTERN);
    expect(JSON.parse(store.get(KLJUC)!).s).toBe(sesije[2]);
  });

  test("[sesija-30] a session stored by an earlier page load continues while it is under 30 minutes old", async () => {
    const { store, sendBeacon } = postaviBrowser({ [KLJUC]: JSON.stringify({ s: ID, t: T0 - 5 * MINUT }) });
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    postaviAnalitiku(null);

    expect((await sviDogadjaji(sendBeacon))[0].sesija).toBe(ID);
    expect(JSON.parse(store.get(KLJUC)!)).toStrictEqual({ s: ID, t: T0 });
  });

  test("[sesija-30] a stored session that is exactly 30 minutes old is replaced, one millisecond younger is kept", async () => {
    const mlad = postaviBrowser({ [KLJUC]: JSON.stringify({ s: ID, t: T0 - POLA_SATA + 1 }) });
    let track = await ucitajTrack();
    track.postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    track.trackJavni({ vrsta: "stranica", stranica: PG });
    track.postaviAnalitiku(null);
    expect((await sviDogadjaji(mlad.sendBeacon))[0].sesija).toBe(ID);
    vi.unstubAllGlobals();

    const star = postaviBrowser({ [KLJUC]: JSON.stringify({ s: ID, t: T0 - POLA_SATA }) });
    track = await ucitajTrack();
    track.postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    track.trackJavni({ vrsta: "stranica", stranica: PG });
    track.postaviAnalitiku(null);
    const sesija = (await sviDogadjaji(star.sendBeacon))[0].sesija;
    expect(sesija).not.toBe(ID);
    expect(sesija).toMatch(SESIJA_PATTERN);
  });

  test("[sesija-30] damaged or foreign stored state starts a new session without an error", async () => {
    for (const sacuvano of ["{broken", "null", "42", JSON.stringify({ s: "short", t: T0 }), JSON.stringify({ s: ID, t: "x" })]) {
      const { sendBeacon } = postaviBrowser({ [KLJUC]: sacuvano });
      const { postaviAnalitiku, trackJavni } = await ucitajTrack();

      postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
      trackJavni({ vrsta: "stranica", stranica: PG });
      postaviAnalitiku(null);

      const sesija = (await sviDogadjaji(sendBeacon))[0].sesija;
      expect(sesija, sacuvano).toMatch(SESIJA_PATTERN);
      expect(sesija, sacuvano).not.toBe(ID);
      vi.unstubAllGlobals();
    }
  });

  test("[sesija-30] a stored time in the future (the clock was moved back) starts a new session", async () => {
    const { sendBeacon } = postaviBrowser({ [KLJUC]: JSON.stringify({ s: ID, t: T0 + 10 * MINUT }) });
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    postaviAnalitiku(null);

    expect((await sviDogadjaji(sendBeacon))[0].sesija).not.toBe(ID);
  });

  test("[sesija-30] each venue keeps its own session id, with no link between venues", async () => {
    const { store, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ slug: "cafe-bar", rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    postaviAnalitiku(kontekst({ slug: "hotel-vista", rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG_DRUGA });
    postaviAnalitiku(null);

    expect([...store.keys()].sort()).toEqual(["smm_an:cafe-bar", "smm_an:hotel-vista"]);
    const prvo = JSON.parse(store.get("smm_an:cafe-bar")!).s as string;
    const drugo = JSON.parse(store.get("smm_an:hotel-vista")!).s as string;
    expect(prvo).not.toBe(drugo);

    const [telo1, telo2] = await tela(sendBeacon);
    expect(telo1.slug).toBe("cafe-bar");
    expect(telo1.dogadjaji[0].sesija).toBe(prvo);
    expect(telo2.slug).toBe("hotel-vista");
    expect(telo2.dogadjaji[0].sesija).toBe(drugo);
  });

  test("[sesija-30] with the identifier on a step event is queued and carries the session", async () => {
    const { sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "korak", korak: "porudzbina" });
    vi.advanceTimersByTime(2000);

    const [otvaranje, korak] = await sviDogadjaji(sendBeacon);
    expect(otvaranje.sesija).toMatch(SESIJA_PATTERN);
    expect(korak).toStrictEqual({ vrsta: "korak", korak: "porudzbina", jezik: "sr", sesija: otvaranje.sesija });
  });

  test("[sesija-30] in saglasnost mode without a stored answer there is no session id, nothing is stored, steps are dropped", async () => {
    const { store, localStorage, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "saglasnost" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "korak", korak: "zahtev" });
    vi.advanceTimersByTime(2000);

    const dogadjaji = await sviDogadjaji(sendBeacon);
    expect(dogadjaji).toStrictEqual([{ vrsta: "stranica", stranica: PG, jezik: "sr" }]);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(store.has(KLJUC)).toBe(false);
  });

  test("[sesija-30] in saglasnost mode a stored answer other than da gives no session id", async () => {
    for (const izbor of ["ne", "", "DA", "yes"]) {
      const { store, sendBeacon } = postaviBrowser({ smm_an_saglasnost: izbor });
      const { postaviAnalitiku, trackJavni } = await ucitajTrack();

      postaviAnalitiku(kontekst({ rezim: "saglasnost" }));
      trackJavni({ vrsta: "stranica", stranica: PG });
      postaviAnalitiku(null);

      expect((await sviDogadjaji(sendBeacon))[0], izbor).not.toHaveProperty("sesija");
      expect(store.has(KLJUC), izbor).toBe(false);
      vi.unstubAllGlobals();
    }
  });

  test("[sesija-30] in saglasnost mode, with smm_an_saglasnost = da, the session id is present and stored", async () => {
    const { store, sendBeacon } = postaviBrowser({ smm_an_saglasnost: "da" });
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "saglasnost" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "korak", korak: "rezervacija" });
    vi.advanceTimersByTime(2000);

    const [otvaranje, korak] = await sviDogadjaji(sendBeacon);
    expect(otvaranje.sesija).toMatch(SESIJA_PATTERN);
    expect(korak.sesija).toBe(otvaranje.sesija);
    expect(JSON.parse(store.get(KLJUC)!).s).toBe(otvaranje.sesija);
  });

  test("[sesija-30] a consent given after the first event takes effect from the next event", async () => {
    const { store, sendBeacon } = postaviBrowser();
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "saglasnost" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    store.set("smm_an_saglasnost", "da");
    trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
    postaviAnalitiku(null);

    const [prvo, drugo] = await sviDogadjaji(sendBeacon);
    expect(prvo).not.toHaveProperty("sesija");
    expect(drugo.sesija).toMatch(SESIJA_PATTERN);
  });

  test("[sesija-30] blocked storage still counts the page open, without a session; steps are dropped", async () => {
    const { localStorage, sendBeacon } = postaviBrowser();
    localStorage.getItem.mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    trackJavni({ vrsta: "korak", korak: "zahtev" });
    vi.advanceTimersByTime(2000);

    expect(await sviDogadjaji(sendBeacon)).toStrictEqual([{ vrsta: "stranica", stranica: PG, jezik: "sr" }]);
  });

  test("[sesija-30] storage that cannot be written (quota) still counts the page open, without a session", async () => {
    const { localStorage, sendBeacon } = postaviBrowser();
    localStorage.setItem.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { postaviAnalitiku, trackJavni } = await ucitajTrack();

    postaviAnalitiku(kontekst({ rezim: "ukljuceno" }));
    trackJavni({ vrsta: "stranica", stranica: PG });
    vi.advanceTimersByTime(2000);

    expect(await sviDogadjaji(sendBeacon)).toStrictEqual([{ vrsta: "stranica", stranica: PG, jezik: "sr" }]);
  });

  test.each(["iskljuceno", "ukljuceno", "saglasnost"] as const satisfies readonly Rezim[])(
    "[sesija-30] mode %s sends only the known fields: kind, page, article, card, step, language, session",
    async (rezim) => {
      const { sendBeacon } = postaviBrowser({ smm_an_saglasnost: "da" });
      const { postaviAnalitiku, trackJavni } = await ucitajTrack();

      postaviAnalitiku(kontekst({ rezim, kartica: KARTICA }));
      trackJavni({ vrsta: "stranica", stranica: PG });
      trackJavni({ vrsta: "detalj", stranica: PG, artikal: AR });
      trackJavni({ vrsta: "korak", korak: "zahtev" });
      postaviAnalitiku(null);

      const dozvoljena = ["vrsta", "stranica", "artikal", "kartica", "korak", "jezik", "sesija"];
      for (const dogadjaj of await sviDogadjaji(sendBeacon)) {
        for (const polje of Object.keys(dogadjaj)) expect(dozvoljena, polje).toContain(polje);
      }
    },
  );
});
