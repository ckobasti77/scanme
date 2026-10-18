// ScanMe Menu V1 — K18: a key that is already in conflict (`postaviKonflikt`)
// and the count of conflicts (`brojKonflikata`) in the editor's save queue.
// Same doubles as autosave-queue.test.ts: the clock and the senders are
// injected, so nothing here waits for real time.

import { describe, expect, test } from "vitest";
import type { CasValue } from "../cas";
import { AutosaveRed, kljucCene, type RedPosiljalac, type RedSat } from "./autosave-queue";
import type { StudioGreska, StudioIshod, StudioKonflikt } from "./model";

// --- test doubles -------------------------------------------------------------

function lazniSat(pocetak = 1_000) {
  let vreme = pocetak;
  let sledeci = 1;
  const tajmeri = new Map<number, { fn: () => void; ms: number }>();
  const sat: RedSat = {
    sad: () => vreme,
    zakazi: (fn, ms) => {
      const id = sledeci++;
      tajmeri.set(id, { fn, ms });
      return id;
    },
    otkazi: (handle) => {
      tajmeri.delete(handle as number);
    },
  };
  return {
    sat,
    postavi(ms: number) {
      vreme = ms;
    },
    brojTajmera: () => tajmeri.size,
    /** Fires every pending timer (each is removed before it runs). */
    okini() {
      for (const [id, t] of [...tajmeri]) {
        tajmeri.delete(id);
        t.fn();
      }
    },
  };
}

type Poziv = {
  ocekivano: CasValue;
  vrednost: CasValue;
  zavrsi(ishod: StudioIshod<unknown>): void;
};

function kontrolisanPosiljalac() {
  const pozivi: Poziv[] = [];
  const posalji: RedPosiljalac = (ocekivano, vrednost) =>
    new Promise<StudioIshod<unknown>>((resolve) => {
      pozivi.push({ ocekivano, vrednost, zavrsi: resolve });
    });
  return { posalji, pozivi };
}

const OK: StudioIshod<unknown> = { ok: true, vrednost: null };
const konflikt = (sacuvano: CasValue, pokusano: CasValue): StudioKonflikt => ({
  ok: false,
  vrsta: "konflikt",
  sacuvano,
  pokusano,
});
const greska = (kod: string, ponovljivo: boolean): StudioGreska => ({
  ok: false,
  vrsta: "greska",
  kod,
  ponovljivo,
});

/** Lets the promise chains of the queue run to the end. */
const protoci = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const K = kljucCene("art1");
/** What the person saw (100), what was saved meanwhile (120), what they typed (150). */
const OCEKIVANO = 100;
const SACUVANO = 120;
const POKUSANO = 150;

function postavka() {
  const sat = lazniSat();
  const red = new AutosaveRed(sat.sat);
  const posiljalac = kontrolisanPosiljalac();
  return { sat, red, ...posiljalac };
}

/** A queue whose key K was put in conflict by `postaviKonflikt`. */
function uKonfliktu() {
  const p = postavka();
  p.red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: POKUSANO, sacuvano: SACUVANO, posalji: p.posalji });
  return p;
}

// --- tests --------------------------------------------------------------------

describe("postaviKonflikt", () => {
  test("the key stands in conflict with both values; nothing is sent", () => {
    const { red, pozivi, sat } = uKonfliktu();
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: POKUSANO, sacuvano: SACUVANO, pokusano: POKUSANO });
    expect(pozivi).toHaveLength(0);
    expect(sat.brojTajmera()).toBe(0);
  });

  test("the save state is 'greska' with one unresolved key and the data counts as unsaved", () => {
    const { red } = uKonfliktu();
    expect(red.zbir()).toEqual({ stanje: "greska", neuspelo: 1, poslednjeU: null });
    expect(red.imaNesacuvano()).toBe(true);
  });

  test("it is counted as a conflict", () => {
    const { red } = uKonfliktu();
    expect(red.brojKonflikata()).toBe(1);
  });

  test("the list shows the person's own value until they choose", () => {
    const { red } = uKonfliktu();
    expect(red.naCekanju().get(K)).toBe(POKUSANO);
  });

  test("subscribers are told", () => {
    const { red } = postavka();
    let pozvano = 0;
    red.pretplati(() => {
      pozvano += 1;
    });
    const pre = red.snimak();
    red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: POKUSANO, sacuvano: SACUVANO, posalji: async () => OK });
    expect(pozvano).toBe(1);
    expect(red.snimak()).toBeGreaterThan(pre);
  });

  test("a cleared value (null) is a value like any other", () => {
    const { red, pozivi, posalji } = postavka();
    red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: null, sacuvano: SACUVANO, posalji });
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: null, sacuvano: SACUVANO, pokusano: null });
    expect(red.naCekanju().has(K)).toBe(true);
    expect(red.naCekanju().get(K)).toBeNull();
    red.zadrziMoju(K);
    expect(pozivi[0]).toMatchObject({ ocekivano: SACUVANO, vrednost: null });
  });

  test("a second call for the same key replaces the first and still counts once", () => {
    const { red, posalji } = uKonfliktu();
    red.postaviKonflikt(K, { ocekivano: SACUVANO, pokusano: 180, sacuvano: 170, posalji });
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: 180, sacuvano: 170, pokusano: 180 });
    expect(red.brojKonflikata()).toBe(1);
    expect(red.zbir().neuspelo).toBe(1);
  });

  test("it replaces a value that was still waiting, and its timer never fires", () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: 130, posalji, odlozi: 600 });
    expect(sat.brojTajmera()).toBe(1);

    red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: POKUSANO, sacuvano: SACUVANO, posalji });
    expect(sat.brojTajmera()).toBe(0);
    sat.okini();
    expect(pozivi).toHaveLength(0);
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: POKUSANO, sacuvano: SACUVANO, pokusano: POKUSANO });
  });

  test("a late answer of a send that was in flight does not touch the conflict", async () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: 130, posalji });
    red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: POKUSANO, sacuvano: SACUVANO, posalji });

    sat.postavi(5_000);
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: POKUSANO, sacuvano: SACUVANO, pokusano: POKUSANO });
    expect(red.sacuvano(K)).toBeUndefined();
    expect(red.zbir().poslednjeU).toBeNull();
    expect(red.brojKonflikata()).toBe(1);
  });

  test("a new edit builds on the saved value; typing the saved value ends the conflict", () => {
    const a = uKonfliktu();
    a.red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: 300, posalji: a.posalji });
    expect(a.pozivi).toHaveLength(1);
    expect(a.pozivi[0]).toMatchObject({ ocekivano: SACUVANO, vrednost: 300 });

    const b = uKonfliktu();
    b.red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: SACUVANO, posalji: b.posalji });
    expect(b.pozivi).toHaveLength(0);
    expect(b.red.stanje(K)).toBeUndefined();
    expect(b.red.brojKonflikata()).toBe(0);
    expect(b.red.zbir().stanje).toBe("sacuvano");
  });
});

describe("zadrziMoju after postaviKonflikt", () => {
  test("it sends the person's value over the saved one, with the sender given to postaviKonflikt", () => {
    const { red, pozivi } = uKonfliktu();
    red.zadrziMoju(K);
    expect(pozivi).toHaveLength(1);
    expect(pozivi[0]).toMatchObject({ ocekivano: SACUVANO, vrednost: POKUSANO });
    expect(pozivi[0].ocekivano).not.toBe(OCEKIVANO);
    expect(red.stanje(K)).toEqual({ faza: "salje", vrednost: POKUSANO });
    expect(red.brojKonflikata()).toBe(0);
    expect(red.zbir().stanje).toBe("cuva-se");
  });

  test("on success the key is cleared and stamped as saved", async () => {
    const { red, pozivi, sat } = uKonfliktu();
    red.zadrziMoju(K);
    sat.postavi(9_000);
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.stanje(K)).toBeUndefined();
    expect(red.naCekanju().has(K)).toBe(false);
    expect(red.sacuvano(K)).toBe(9_000);
    expect(red.imaNesacuvano()).toBe(false);
    expect(red.brojKonflikata()).toBe(0);
    expect(red.zbir()).toEqual({ stanje: "sacuvano", neuspelo: 0, poslednjeU: 9_000 });
  });

  test("if someone saved again meanwhile, the key is back in conflict with the newest saved value", async () => {
    const { red, pozivi } = uKonfliktu();
    red.zadrziMoju(K);
    pozivi[0].zavrsi(konflikt(130, POKUSANO));
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: POKUSANO, sacuvano: 130, pokusano: POKUSANO });
    expect(red.brojKonflikata()).toBe(1);
    expect(pozivi).toHaveLength(1);

    red.zadrziMoju(K);
    expect(pozivi[1]).toMatchObject({ ocekivano: 130, vrednost: POKUSANO });
  });

  test("if the send fails, the key becomes a failure and is no longer a conflict", async () => {
    const { red, pozivi } = uKonfliktu();
    red.zadrziMoju(K);
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "greska", vrednost: POKUSANO, kod: "mreza", ponovljivo: true });
    expect(red.brojKonflikata()).toBe(0);
    expect(red.zbir()).toEqual({ stanje: "greska", neuspelo: 1, poslednjeU: null });

    // The retry keeps the expected value of the failed send: the value saved meanwhile.
    red.pokusajPonovo();
    expect(pozivi[1]).toMatchObject({ ocekivano: SACUVANO, vrednost: POKUSANO });
  });
});

describe("odbaci after postaviKonflikt", () => {
  test("it clears the key without sending anything", () => {
    const { red, pozivi } = uKonfliktu();
    red.odbaci(K);
    expect(pozivi).toHaveLength(0);
    expect(red.stanje(K)).toBeUndefined();
    expect(red.naCekanju().has(K)).toBe(false);
    expect(red.brojKonflikata()).toBe(0);
    expect(red.imaNesacuvano()).toBe(false);
    expect(red.zbir()).toEqual({ stanje: "sacuvano", neuspelo: 0, poslednjeU: null });
  });

  test("it leaves other keys alone", () => {
    const { red, posalji } = uKonfliktu();
    const drugi = kljucCene("art2");
    red.postaviKonflikt(drugi, { ocekivano: 10, pokusano: 20, sacuvano: 15, posalji });
    expect(red.brojKonflikata()).toBe(2);
    red.odbaci(K);
    expect(red.brojKonflikata()).toBe(1);
    expect(red.stanje(drugi)?.faza).toBe("konflikt");
  });
});

describe("brojKonflikata", () => {
  test("an empty queue has none", () => {
    expect(postavka().red.brojKonflikata()).toBe(0);
  });

  test("each key in conflict counts once", () => {
    const { red, posalji } = postavka();
    red.postaviKonflikt(K, { ocekivano: 1, pokusano: 3, sacuvano: 2, posalji });
    red.postaviKonflikt(kljucCene("art2"), { ocekivano: 1, pokusano: 3, sacuvano: 2, posalji });
    red.postaviKonflikt(kljucCene("art3"), { ocekivano: 1, pokusano: 3, sacuvano: 2, posalji });
    expect(red.brojKonflikata()).toBe(3);
    expect(red.zbir().neuspelo).toBe(3);
  });

  test("a conflict from a refused save is counted just like one from postaviKonflikt", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: POKUSANO, posalji });
    pozivi[0].zavrsi(konflikt(SACUVANO, POKUSANO));
    await protoci();
    expect(red.brojKonflikata()).toBe(1);
  });

  test("a failed key is NOT a conflict, although it is a failure", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: POKUSANO, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();
    expect(red.stanje(K)?.faza).toBe("greska");
    expect(red.zbir().neuspelo).toBe(1);
    expect(red.brojKonflikata()).toBe(0);
  });

  test("failures and conflicts together: both are unresolved, only one is a conflict", async () => {
    const { red, pozivi, posalji } = postavka();
    red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: POKUSANO, sacuvano: SACUVANO, posalji });
    const drugi = kljucCene("art2");
    red.zakazi(drugi, { ocekivano: 10, vrednost: 20, posalji });
    pozivi[0].zavrsi(greska("menu/forbidden", false));
    await protoci();
    expect(red.zbir()).toEqual({ stanje: "greska", neuspelo: 2, poslednjeU: null });
    expect(red.brojKonflikata()).toBe(1);
  });

  test("keys waiting or in flight are not conflicts", () => {
    const { red, posalji } = postavka();
    red.zakazi(K, { ocekivano: OCEKIVANO, vrednost: POKUSANO, posalji, odlozi: 600 });
    red.zakazi(kljucCene("art2"), { ocekivano: 10, vrednost: 20, posalji });
    expect(red.brojKonflikata()).toBe(0);
  });
});

describe("pokusajPonovo does not send a conflict", () => {
  test("neither for every key nor for the key itself", () => {
    const { red, pozivi } = uKonfliktu();
    red.pokusajPonovo();
    red.pokusajPonovo(K);
    expect(pozivi).toHaveLength(0);
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: POKUSANO, sacuvano: SACUVANO, pokusano: POKUSANO });
    expect(red.brojKonflikata()).toBe(1);
  });

  test("with a failed key beside it, only the failed key is sent again", async () => {
    const { red, pozivi, posalji } = postavka();
    const pokvaren = kljucCene("art2");
    red.postaviKonflikt(K, { ocekivano: OCEKIVANO, pokusano: POKUSANO, sacuvano: SACUVANO, posalji });
    red.zakazi(pokvaren, { ocekivano: 10, vrednost: 20, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();

    red.pokusajPonovo();
    expect(pozivi).toHaveLength(2);
    expect(pozivi[1]).toMatchObject({ ocekivano: 10, vrednost: 20 });
    expect(red.stanje(K)?.faza).toBe("konflikt");
    expect(red.brojKonflikata()).toBe(1);
  });
});
