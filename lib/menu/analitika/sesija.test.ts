// ScanMe Menu V1 (K29) — the session (master §14.4; docs/menu/ANALITIKA-DEFINICIJE.md §3):
// a run of one browser's events on one venue's menu with no pause of 30 minutes
// or longer. A pause of exactly 30:00 ends it. Tag [sesija-30].

import { describe, expect, test, vi } from "vitest";
import { MENU_ANALYTICS_SESSION_GAP_MS } from "./definicije";
import {
  SESIJA_PATTERN,
  citajStanje,
  kljucSesije,
  nastavljaSesiju,
  noviIdSesije,
  sledecaSesija,
} from "./sesija";

const MINUT = 60 * 1000;
const POLA_SATA = 30 * MINUT;
const T0 = Date.UTC(2026, 9, 21, 12, 0, 0);
const ID = "abcdefghjkmnpqrs";
const NOVI_ID = "zzzzzzzzzzzzzzzz";

describe("session gap constant", () => {
  test("[sesija-30] the gap is 30 minutes", () => {
    expect(MENU_ANALYTICS_SESSION_GAP_MS).toBe(POLA_SATA);
  });
});

describe("sledecaSesija", () => {
  test("[sesija-30] no stored state starts a new session at the current time", () => {
    expect(sledecaSesija(null, T0, () => NOVI_ID)).toEqual({ s: NOVI_ID, t: T0 });
  });

  test("[sesija-30] the default id generator gives a well-formed id", () => {
    const stanje = sledecaSesija(null, T0);
    expect(stanje.s).toMatch(SESIJA_PATTERN);
    expect(stanje.t).toBe(T0);
  });

  test("[sesija-30] 29:59.999 after the last activity is the same session and the time moves forward", () => {
    const noviId = vi.fn(() => NOVI_ID);
    const sledeca = sledecaSesija({ s: ID, t: T0 }, T0 + POLA_SATA - 1, noviId);
    expect(sledeca).toEqual({ s: ID, t: T0 + POLA_SATA - 1 });
    expect(noviId).not.toHaveBeenCalled();
  });

  test("[sesija-30] a pause of exactly 30:00 starts a new session", () => {
    const noviId = vi.fn(() => NOVI_ID);
    const sledeca = sledecaSesija({ s: ID, t: T0 }, T0 + POLA_SATA, noviId);
    expect(sledeca).toEqual({ s: NOVI_ID, t: T0 + POLA_SATA });
    expect(noviId).toHaveBeenCalledTimes(1);
  });

  test("[sesija-30] a pause of 30:00.001 and of 45 minutes start a new session", () => {
    expect(sledecaSesija({ s: ID, t: T0 }, T0 + POLA_SATA + 1, () => NOVI_ID).s).toBe(NOVI_ID);
    expect(sledecaSesija({ s: ID, t: T0 }, T0 + 45 * MINUT, () => NOVI_ID)).toEqual({ s: NOVI_ID, t: T0 + 45 * MINUT });
  });

  test("[sesija-30] an event at the very same instant continues the session", () => {
    expect(sledecaSesija({ s: ID, t: T0 }, T0, () => NOVI_ID)).toEqual({ s: ID, t: T0 });
  });

  test("[sesija-30] a stored time in the future (the clock moved back) starts a new session", () => {
    const noviId = vi.fn(() => NOVI_ID);
    expect(sledecaSesija({ s: ID, t: T0 + 1 }, T0, noviId)).toEqual({ s: NOVI_ID, t: T0 });
    expect(sledecaSesija({ s: ID, t: T0 + 10 * MINUT }, T0, noviId)).toEqual({ s: NOVI_ID, t: T0 });
    expect(noviId).toHaveBeenCalledTimes(2);
  });

  test("[sesija-30] the pause is measured from the LAST activity: a long browsing run stays one session", () => {
    let stanje = sledecaSesija(null, T0, () => ID);
    // Events 25 minutes apart for two hours: every step is under 30 minutes.
    for (let korak = 1; korak <= 5; korak += 1) {
      stanje = sledecaSesija(stanje, T0 + korak * 25 * MINUT, () => NOVI_ID);
      expect(stanje.s).toBe(ID);
    }
    expect(stanje.t).toBe(T0 + 5 * 25 * MINUT);
    // Then a pause of exactly 30 minutes ends it.
    expect(sledecaSesija(stanje, stanje.t + POLA_SATA, () => NOVI_ID).s).toBe(NOVI_ID);
  });

  test("[sesija-30] a new session after a pause keeps going for the next events", () => {
    const druga = sledecaSesija({ s: ID, t: T0 }, T0 + 40 * MINUT, () => NOVI_ID);
    const treca = sledecaSesija(druga, T0 + 50 * MINUT, () => "ignorisan00000000");
    expect(treca).toEqual({ s: NOVI_ID, t: T0 + 50 * MINUT });
  });
});

describe("nastavljaSesiju", () => {
  test("[sesija-30] continues while the pause is shorter than 30 minutes", () => {
    expect(nastavljaSesiju(T0, T0)).toBe(true);
    expect(nastavljaSesiju(T0, T0 + MINUT)).toBe(true);
    expect(nastavljaSesiju(T0, T0 + POLA_SATA - 1)).toBe(true);
  });

  test("[sesija-30] stops at exactly 30:00 and after", () => {
    expect(nastavljaSesiju(T0, T0 + POLA_SATA)).toBe(false);
    expect(nastavljaSesiju(T0, T0 + POLA_SATA + 1)).toBe(false);
    expect(nastavljaSesiju(T0, T0 + 24 * 60 * MINUT)).toBe(false);
  });
});

describe("noviIdSesije", () => {
  test("[sesija-30] turns the injected bytes into 16 characters of the id alphabet, deterministically", () => {
    const bajtovi = Uint8Array.from({ length: 16 }, (_, index) => index);
    const random = vi.fn(() => bajtovi);
    const id = noviIdSesije(random);
    expect(random).toHaveBeenCalledWith(16);
    expect(id).toBe("0123456789abcdef");
    expect(id).toHaveLength(16);
    expect(id).toMatch(SESIJA_PATTERN);
    expect(noviIdSesije(random)).toBe(id);
  });

  test("[sesija-30] bytes wrap around the 32-character alphabet", () => {
    expect(noviIdSesije(() => new Uint8Array(16).fill(0))).toBe("0000000000000000");
    expect(noviIdSesije(() => new Uint8Array(16).fill(31))).toBe("zzzzzzzzzzzzzzzz");
    expect(noviIdSesije(() => new Uint8Array(16).fill(32))).toBe("0000000000000000");
    expect(noviIdSesije(() => new Uint8Array(16).fill(255))).toBe("zzzzzzzzzzzzzzzz");
  });

  test("[sesija-30] every possible byte gives a character the server accepts (no i, l, o, u)", () => {
    for (let bajt = 0; bajt < 256; bajt += 1) {
      expect(noviIdSesije(() => new Uint8Array(16).fill(bajt))).toMatch(SESIJA_PATTERN);
    }
  });

  test("[sesija-30] the default generator uses the browser's random source: well-formed and not repeating", () => {
    const ids = Array.from({ length: 100 }, () => noviIdSesije());
    for (const id of ids) expect(id).toMatch(SESIJA_PATTERN);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("citajStanje", () => {
  test("[sesija-30] reads a valid stored state", () => {
    expect(citajStanje(JSON.stringify({ s: ID, t: T0 }))).toEqual({ s: ID, t: T0 });
  });

  test("[sesija-30] keeps only the id and the time of a stored state", () => {
    expect(citajStanje(JSON.stringify({ s: ID, t: T0, ime: "Ana", ip: "1.2.3.4" }))).toStrictEqual({ s: ID, t: T0 });
  });

  test("[sesija-30] nothing stored gives null", () => {
    expect(citajStanje(null)).toBeNull();
    expect(citajStanje("")).toBeNull();
  });

  test("[sesija-30] damaged JSON gives null", () => {
    expect(citajStanje("{not json")).toBeNull();
    expect(citajStanje('{"s":"abcdefghjkmnpqrs","t":')).toBeNull();
    expect(citajStanje("undefined")).toBeNull();
  });

  test("[sesija-30] valid JSON that is not an object gives null", () => {
    expect(citajStanje("null")).toBeNull();
    expect(citajStanje("42")).toBeNull();
    expect(citajStanje('"abcdefghjkmnpqrs"')).toBeNull();
    expect(citajStanje("true")).toBeNull();
    expect(citajStanje("[]")).toBeNull();
    expect(citajStanje(`["${ID}", ${T0}]`)).toBeNull();
  });

  test("[sesija-30] wrong field types give null", () => {
    expect(citajStanje(JSON.stringify({ s: 1234567890123456, t: T0 }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: ID, t: String(T0) }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: ID, t: null }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: ID }))).toBeNull();
    expect(citajStanje(JSON.stringify({ t: T0 }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: null, t: T0 }))).toBeNull();
  });

  test("[sesija-30] a time that is not a finite number gives null", () => {
    // JSON has no Infinity, but 1e999 parses to it.
    expect(citajStanje(`{"s":"${ID}","t":1e999}`)).toBeNull();
    expect(citajStanje(`{"s":"${ID}","t":-1e999}`)).toBeNull();
  });

  test("[sesija-30] an id that is not 16 characters of the alphabet gives null", () => {
    expect(citajStanje(JSON.stringify({ s: ID.slice(0, 15), t: T0 }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: `${ID}a`, t: T0 }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: ID.toUpperCase(), t: T0 }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: "", t: T0 }))).toBeNull();
    expect(citajStanje(JSON.stringify({ s: "abcdefghjkmnpqr-", t: T0 }))).toBeNull();
    for (const losSlovo of ["i", "l", "o", "u"]) {
      expect(citajStanje(JSON.stringify({ s: `${ID.slice(0, 15)}${losSlovo}`, t: T0 })), losSlovo).toBeNull();
    }
  });
});

describe("kljucSesije", () => {
  test("[sesija-30] one key per venue slug in localStorage", () => {
    expect(kljucSesije("cafe-bar")).toBe("smm_an:cafe-bar");
    expect(kljucSesije("hotel-vista")).toBe("smm_an:hotel-vista");
    expect(kljucSesije("cafe-bar")).not.toBe(kljucSesije("hotel-vista"));
  });
});
