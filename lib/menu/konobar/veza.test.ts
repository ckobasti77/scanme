// ScanMe Menu V1 (K23) — the connection of a waiter's device: online, offline
// (actions wait, nothing is queued) and "ponovo" (just came back).

import { describe, expect, test } from "vitest";
import { POCETNA_VEZA, PONOVO_MS, radnjeDozvoljene, sledecaVeza, type Veza } from "./veza";

const T0 = 1_000_000;

describe("POCETNA_VEZA", () => {
  test("starts online with nothing recorded", () => {
    expect(POCETNA_VEZA).toEqual({ stanje: "online", poslednjeOsvezenje: null, ponovoDo: null });
  });
});

describe("sledecaVeza: going offline", () => {
  test("goes offline and records the moment it went offline", () => {
    const veza = sledecaVeza(POCETNA_VEZA, false, T0);
    expect(veza).toEqual({ stanje: "offline", poslednjeOsvezenje: T0, ponovoDo: null });
  });

  test("keeps the same object on repeated offline ticks", () => {
    const offline = sledecaVeza(POCETNA_VEZA, false, T0);
    const again = sledecaVeza(offline, false, T0 + 5000);
    expect(again).toBe(offline);
    expect(sledecaVeza(again, false, T0 + 60_000).poslednjeOsvezenje).toBe(T0);
  });

  test("going offline while the back-online note is shown goes offline again", () => {
    const ponovo: Veza = { stanje: "ponovo", poslednjeOsvezenje: T0, ponovoDo: T0 + PONOVO_MS };
    expect(sledecaVeza(ponovo, false, T0 + 1000)).toEqual({
      stanje: "offline",
      poslednjeOsvezenje: T0 + 1000,
      ponovoDo: null,
    });
  });
});

describe("sledecaVeza: coming back", () => {
  test("coming back shows ponovo for PONOVO_MS", () => {
    const offline = sledecaVeza(POCETNA_VEZA, false, T0);
    const back = sledecaVeza(offline, true, T0 + 30_000);
    expect(back).toEqual({
      stanje: "ponovo",
      poslednjeOsvezenje: T0 + 30_000,
      ponovoDo: T0 + 30_000 + PONOVO_MS,
    });
  });

  test("PONOVO_MS is 4 seconds", () => {
    expect(PONOVO_MS).toBe(4000);
  });

  test("ponovo stays ponovo before ponovoDo", () => {
    const back = sledecaVeza(sledecaVeza(POCETNA_VEZA, false, T0), true, T0 + 1000);
    const early = sledecaVeza(back, true, back.ponovoDo! - 1);
    expect(early.stanje).toBe("ponovo");
    expect(early).toBe(back);
  });

  test("ponovo turns online exactly at ponovoDo, not 1 ms before", () => {
    const back = sledecaVeza(sledecaVeza(POCETNA_VEZA, false, T0), true, T0 + 1000);
    const ponovoDo = back.ponovoDo!;
    expect(sledecaVeza(back, true, ponovoDo - 1).stanje).toBe("ponovo");
    expect(sledecaVeza(back, true, ponovoDo)).toEqual({ stanje: "online", poslednjeOsvezenje: ponovoDo, ponovoDo: null });
  });

  test("ponovo turns online after ponovoDo too", () => {
    const back = sledecaVeza(sledecaVeza(POCETNA_VEZA, false, T0), true, T0 + 1000);
    const late = sledecaVeza(back, true, back.ponovoDo! + 10_000);
    expect(late.stanje).toBe("online");
    expect(late.ponovoDo).toBeNull();
  });
});

describe("sledecaVeza: online", () => {
  test("every online tick updates poslednjeOsvezenje", () => {
    let veza: Veza = POCETNA_VEZA;
    veza = sledecaVeza(veza, true, T0);
    expect(veza).toEqual({ stanje: "online", poslednjeOsvezenje: T0, ponovoDo: null });
    veza = sledecaVeza(veza, true, T0 + 1000);
    expect(veza.poslednjeOsvezenje).toBe(T0 + 1000);
    expect(veza.stanje).toBe("online");
  });

  test("a repeated tick at the same moment changes nothing", () => {
    const veza = sledecaVeza(POCETNA_VEZA, true, T0);
    expect(sledecaVeza(veza, true, T0)).toBe(veza);
  });

  test("a full outage: online, offline, back, online again", () => {
    let veza = sledecaVeza(POCETNA_VEZA, true, T0);
    veza = sledecaVeza(veza, false, T0 + 1000);
    expect(veza.stanje).toBe("offline");
    veza = sledecaVeza(veza, false, T0 + 2000);
    expect(veza.poslednjeOsvezenje).toBe(T0 + 1000);
    veza = sledecaVeza(veza, true, T0 + 10_000);
    expect(veza.stanje).toBe("ponovo");
    veza = sledecaVeza(veza, true, T0 + 10_000 + PONOVO_MS);
    expect(veza.stanje).toBe("online");
    expect(veza.poslednjeOsvezenje).toBe(T0 + 10_000 + PONOVO_MS);
  });
});

describe("radnjeDozvoljene", () => {
  test("is false only while offline", () => {
    expect(radnjeDozvoljene({ stanje: "offline", poslednjeOsvezenje: T0, ponovoDo: null })).toBe(false);
  });

  test("is true for ponovo and online", () => {
    expect(radnjeDozvoljene({ stanje: "ponovo", poslednjeOsvezenje: T0, ponovoDo: T0 + PONOVO_MS })).toBe(true);
    expect(radnjeDozvoljene(POCETNA_VEZA)).toBe(true);
  });
});
