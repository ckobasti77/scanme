// ScanMe Menu V1 — K10: the editor's save queue. The clock, the timers and the
// senders are all injected, so every rule runs without a browser: timers fire
// only when the test fires them, and a send finishes only when the test says so.

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
    odlaganja: () => [...tajmeri.values()].map((t) => t.ms),
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
  odbij(razlog: unknown): void;
};

function kontrolisanPosiljalac() {
  const pozivi: Poziv[] = [];
  const posalji: RedPosiljalac = (ocekivano, vrednost) =>
    new Promise<StudioIshod<unknown>>((resolve, reject) => {
      pozivi.push({ ocekivano, vrednost, zavrsi: resolve, odbij: reject });
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

function postavka() {
  const sat = lazniSat();
  const red = new AutosaveRed(sat.sat);
  const posiljalac = kontrolisanPosiljalac();
  return { sat, red, ...posiljalac };
}

// --- tests --------------------------------------------------------------------

describe("kljucCene", () => {
  test("the key of the shared base price", () => {
    expect(kljucCene("art1")).toBe("cena:art1");
  });
});

describe("a value that changes nothing", () => {
  test("a value equal to ocekivano sends nothing and leaves no trace", () => {
    const { red, pozivi, posalji, sat } = postavka();
    const pre = red.snimak();
    red.zakazi(K, { ocekivano: 100, vrednost: 100, posalji });
    expect(pozivi).toHaveLength(0);
    expect(sat.brojTajmera()).toBe(0);
    expect(red.stanje(K)).toBeUndefined();
    expect(red.imaNesacuvano()).toBe(false);
    expect(red.zbir()).toEqual({ stanje: "sacuvano", neuspelo: 0, poslednjeU: null });
    expect(red.snimak()).toBe(pre);
  });

  test("typing back to the first expected value while waiting cancels the save", () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 500 });
    expect(sat.brojTajmera()).toBe(1);
    red.zakazi(K, { ocekivano: 150, vrednost: 100, posalji, odlozi: 500 });
    expect(sat.brojTajmera()).toBe(0);
    expect(red.stanje(K)).toBeUndefined();
    expect(red.imaNesacuvano()).toBe(false);
    sat.okini();
    expect(pozivi).toHaveLength(0);
  });
});

describe("debounce (odlozi) and isprazni", () => {
  test("a delayed value waits; the timer sends it", async () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    expect(pozivi).toHaveLength(0);
    expect(sat.odlaganja()).toEqual([600]);
    expect(red.stanje(K)).toEqual({ faza: "ceka", vrednost: 150 });
    expect(red.zbir().stanje).toBe("cuva-se");
    expect(red.imaNesacuvano()).toBe(true);

    sat.okini();
    expect(pozivi).toHaveLength(1);
    expect(pozivi[0]).toMatchObject({ ocekivano: 100, vrednost: 150 });
    expect(red.stanje(K)).toEqual({ faza: "salje", vrednost: 150 });
  });

  test("a newer value replaces the waiting one but keeps the first ocekivano", () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    // The editor's own idea of "expected" has moved on to what it typed; the queue must not follow it.
    red.zakazi(K, { ocekivano: 150, vrednost: 200, posalji, odlozi: 600 });
    expect(sat.brojTajmera()).toBe(1); // the first timer was cancelled
    expect(red.stanje(K)).toEqual({ faza: "ceka", vrednost: 200 });
    expect(pozivi).toHaveLength(0);

    sat.okini();
    expect(pozivi).toHaveLength(1);
    expect(pozivi[0]).toMatchObject({ ocekivano: 100, vrednost: 200 });
  });

  test("isprazni sends a waiting key now and cancels its timer", () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    red.isprazni(K);
    expect(pozivi).toHaveLength(1);
    expect(pozivi[0]).toMatchObject({ ocekivano: 100, vrednost: 150 });
    expect(sat.brojTajmera()).toBe(0);
    expect(red.stanje(K)?.faza).toBe("salje");
    sat.okini(); // nothing left to fire
    expect(pozivi).toHaveLength(1);
  });

  test("isprazni does nothing for an unknown key or a key already in flight", () => {
    const { red, pozivi, posalji } = postavka();
    red.isprazni("cena:nema");
    expect(pozivi).toHaveLength(0);
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    expect(pozivi).toHaveLength(1);
    red.isprazni(K);
    expect(pozivi).toHaveLength(1);
  });

  test("a zero delay sends at once", () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    expect(pozivi).toHaveLength(1);
    expect(sat.brojTajmera()).toBe(0);
  });
});

describe("a new value while the previous one is in flight", () => {
  test("it is chained and sent after success with ocekivano = the value in flight", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 200, posalji });
    expect(pozivi).toHaveLength(1);
    // The field shows the newest value even though 150 is what is on the wire.
    expect(red.stanje(K)).toEqual({ faza: "salje", vrednost: 200 });

    pozivi[0].zavrsi(OK);
    await protoci();
    expect(pozivi).toHaveLength(2);
    expect(pozivi[1]).toMatchObject({ ocekivano: 150, vrednost: 200 });
    expect(red.stanje(K)).toEqual({ faza: "salje", vrednost: 200 });
    expect(red.zbir().stanje).toBe("cuva-se");

    pozivi[1].zavrsi(OK);
    await protoci();
    expect(red.stanje(K)).toBeUndefined();
    expect(red.imaNesacuvano()).toBe(false);
    expect(red.zbir().stanje).toBe("sacuvano");
  });

  test("several quick edits in flight collapse to the last one", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 160, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 170, posalji });
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(pozivi).toHaveLength(2);
    expect(pozivi[1]).toMatchObject({ ocekivano: 150, vrednost: 170 });
  });

  test("a chained value equal to the one in flight needs no second send", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(pozivi).toHaveLength(1);
    expect(red.stanje(K)).toBeUndefined();
  });
});

describe("conflict", () => {
  test("it stops the key and shows both values; nothing is overwritten", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(konflikt(120, 150));
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: 150, sacuvano: 120, pokusano: 150 });
    expect(pozivi).toHaveLength(1);
    expect(red.zbir()).toEqual({ stanje: "greska", neuspelo: 1, poslednjeU: null });
    expect(red.imaNesacuvano()).toBe(true);
    // The list shows the person's own value until they choose.
    expect(red.naCekanju().get(K)).toBe(150);
  });

  test("the value chained while it was in flight is dropped", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 200, posalji });
    pozivi[0].zavrsi(konflikt(120, 150));
    await protoci();
    expect(pozivi).toHaveLength(1);
    expect(red.stanje(K)).toEqual({ faza: "konflikt", vrednost: 150, sacuvano: 120, pokusano: 150 });
    expect(red.naCekanju().get(K)).toBe(150);
  });

  test("zadrziMoju resends the person's value over the saved one (ocekivano = sacuvano)", async () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(konflikt(120, 150));
    await protoci();

    red.zadrziMoju(K);
    expect(pozivi).toHaveLength(2);
    expect(pozivi[1]).toMatchObject({ ocekivano: 120, vrednost: 150 });
    expect(red.stanje(K)).toEqual({ faza: "salje", vrednost: 150 });

    sat.postavi(9_000);
    pozivi[1].zavrsi(OK);
    await protoci();
    expect(red.stanje(K)).toBeUndefined();
    expect(red.sacuvano(K)).toBe(9_000);
    expect(red.zbir()).toEqual({ stanje: "sacuvano", neuspelo: 0, poslednjeU: 9_000 });
  });

  test("zadrziMoju does nothing outside a conflict", () => {
    const { red, pozivi, posalji } = postavka();
    red.zadrziMoju(K);
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zadrziMoju(K);
    expect(pozivi).toHaveLength(1);
  });

  test("odbaci forgets the key (take the saved value)", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(konflikt(120, 150));
    await protoci();
    red.odbaci(K);
    expect(red.stanje(K)).toBeUndefined();
    expect(red.naCekanju().has(K)).toBe(false);
    expect(red.imaNesacuvano()).toBe(false);
    expect(red.zbir().stanje).toBe("sacuvano");
  });

  test("a new edit after a conflict builds on the saved value", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(konflikt(120, 150));
    await protoci();
    red.zakazi(K, { ocekivano: 100, vrednost: 300, posalji });
    expect(pozivi).toHaveLength(2);
    expect(pozivi[1]).toMatchObject({ ocekivano: 120, vrednost: 300 });
  });

  test("typing the saved value after a conflict ends it with nothing sent", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(konflikt(120, 150));
    await protoci();
    red.zakazi(K, { ocekivano: 100, vrednost: 120, posalji });
    expect(pozivi).toHaveLength(1);
    expect(red.stanje(K)).toBeUndefined();
    expect(red.zbir().stanje).toBe("sacuvano");
  });
});

describe("failure", () => {
  test("the value stays on screen in phase greska with the code", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(greska("menu/forbidden", false));
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "greska", vrednost: 150, kod: "menu/forbidden", ponovljivo: false });
    expect(red.naCekanju().get(K)).toBe(150);
    expect(red.zbir()).toEqual({ stanje: "greska", neuspelo: 1, poslednjeU: null });
    expect(red.imaNesacuvano()).toBe(true);
  });

  test("pokusajPonovo resends with the same ocekivano", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();

    red.pokusajPonovo();
    expect(pozivi).toHaveLength(2);
    expect(pozivi[1]).toMatchObject({ ocekivano: 100, vrednost: 150 });
    expect(red.stanje(K)).toEqual({ faza: "salje", vrednost: 150 });

    pozivi[1].zavrsi(OK);
    await protoci();
    expect(red.stanje(K)).toBeUndefined();
  });

  test("pokusajPonovo with a key touches only that key, and only failed ones", async () => {
    const { red, pozivi, posalji } = postavka();
    const drugi = kljucCene("art2");
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(drugi, { ocekivano: 10, vrednost: 20, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    pozivi[1].zavrsi(greska("mreza", true));
    await protoci();
    expect(red.zbir().neuspelo).toBe(2);

    red.pokusajPonovo(drugi);
    expect(pozivi).toHaveLength(3);
    expect(pozivi[2]).toMatchObject({ ocekivano: 10, vrednost: 20 });
    expect(red.stanje(K)?.faza).toBe("greska");

    // A key that is in flight is not sent twice.
    red.pokusajPonovo(drugi);
    expect(pozivi).toHaveLength(3);
  });

  test("a value chained during the failed send becomes the value to retry", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 200, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "greska", vrednost: 200, kod: "mreza", ponovljivo: true });

    red.pokusajPonovo();
    expect(pozivi[1]).toMatchObject({ ocekivano: 100, vrednost: 200 });
  });

  test("a new edit after a failure keeps the original ocekivano", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();
    red.zakazi(K, { ocekivano: 777, vrednost: 130, posalji });
    expect(pozivi[1]).toMatchObject({ ocekivano: 100, vrednost: 130 });
  });

  test("a rejected sender becomes a retryable network error", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    pozivi[0].odbij(new Error("offline"));
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "greska", vrednost: 150, kod: "mreza", ponovljivo: true });
  });

  test("a sender that throws synchronously becomes a retryable network error", async () => {
    const { red } = postavka();
    const baca: RedPosiljalac = () => {
      throw new Error("boom");
    };
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji: baca });
    await protoci();
    expect(red.stanje(K)).toEqual({ faza: "greska", vrednost: 150, kod: "mreza", ponovljivo: true });
    expect(red.zbir().stanje).toBe("greska");
  });
});

describe("odbaci while a send is in flight", () => {
  test("the late answer is ignored", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.odbaci(K);
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.stanje(K)).toBeUndefined();
    expect(red.sacuvano(K)).toBeUndefined();
    expect(red.zbir().poslednjeU).toBeNull();
  });

  test("odbaci cancels a waiting timer", () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    red.odbaci(K);
    expect(sat.brojTajmera()).toBe(0);
    sat.okini();
    expect(pozivi).toHaveLength(0);
    red.odbaci("cena:nema"); // unknown key: no-op
  });
});

describe("prati (structural actions)", () => {
  test("zbir says cuva-se while it runs and returns the outcome", async () => {
    const { red, sat } = postavka();
    let zavrsi!: (ishod: StudioIshod<{ id: string }>) => void;
    const rad = () => new Promise<StudioIshod<{ id: string }>>((resolve) => (zavrsi = resolve));

    const obecanje = red.prati(rad);
    expect(red.zbir().stanje).toBe("cuva-se");
    expect(red.imaNesacuvano()).toBe(true);

    sat.postavi(7_000);
    zavrsi({ ok: true, vrednost: { id: "sc_1" } });
    const ishod = await obecanje;
    expect(ishod).toEqual({ ok: true, vrednost: { id: "sc_1" } });
    expect(red.zbir()).toEqual({ stanje: "sacuvano", neuspelo: 0, poslednjeU: 7_000 });
    expect(red.imaNesacuvano()).toBe(false);
  });

  test("a refused action is returned as is and is not a save", async () => {
    const { red } = postavka();
    const refused = greska("menu/page_has_qr", false);
    const ishod = await red.prati(async (): Promise<StudioIshod> => refused);
    expect(ishod).toBe(refused);
    expect(red.zbir()).toEqual({ stanje: "sacuvano", neuspelo: 0, poslednjeU: null });
  });

  test("a rejected action becomes a retryable network error and the counter recovers", async () => {
    const { red } = postavka();
    const ishod = await red.prati<null>(() => Promise.reject(new Error("offline")));
    expect(ishod).toEqual({ ok: false, vrsta: "greska", kod: "mreza", ponovljivo: true });
    expect(red.zbir().stanje).toBe("sacuvano");
    expect(red.imaNesacuvano()).toBe(false);
  });

  test("several tracked actions keep cuva-se until the last one ends", async () => {
    const { red } = postavka();
    const zavrsetci: (() => void)[] = [];
    const rad = () => new Promise<StudioIshod>((resolve) => zavrsetci.push(() => resolve(OK as StudioIshod)));
    const a = red.prati(rad);
    const b = red.prati(rad);
    zavrsetci[0]();
    await a;
    expect(red.zbir().stanje).toBe("cuva-se");
    zavrsetci[1]();
    await b;
    expect(red.zbir().stanje).toBe("sacuvano");
  });
});

describe("naCekanju", () => {
  test("it is the same Map object until the queue changes", () => {
    const { red, posalji } = postavka();
    const prazna = red.naCekanju();
    expect(red.naCekanju()).toBe(prazna);
    expect(prazna.size).toBe(0);

    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    const jedna = red.naCekanju();
    expect(jedna).not.toBe(prazna);
    expect(jedna.get(K)).toBe(150);
    expect(red.naCekanju()).toBe(jedna);
  });

  test("it shows the chained value, not the one in flight", () => {
    const { red, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    expect(red.naCekanju().get(K)).toBe(150);
    red.zakazi(K, { ocekivano: 100, vrednost: 200, posalji });
    expect(red.naCekanju().get(K)).toBe(200);
  });

  test("a saved key leaves the map", async () => {
    const { red, pozivi, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    expect(red.naCekanju().has(K)).toBe(true);
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.naCekanju().has(K)).toBe(false);
  });

  test("a null value (price cleared) is kept as null", () => {
    const { red, posalji } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: null, posalji, odlozi: 600 });
    expect(red.naCekanju().has(K)).toBe(true);
    expect(red.naCekanju().get(K)).toBeNull();
  });
});

describe("imaNesacuvano, sacuvano and zbir", () => {
  test("imaNesacuvano is true while waiting, in flight, failed or in conflict, false once saved", async () => {
    const { red, pozivi, posalji } = postavka();
    expect(red.imaNesacuvano()).toBe(false);
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    expect(red.imaNesacuvano()).toBe(true);
    red.isprazni(K);
    expect(red.imaNesacuvano()).toBe(true);
    pozivi[0].zavrsi(greska("mreza", true));
    await protoci();
    expect(red.imaNesacuvano()).toBe(true);
    red.pokusajPonovo();
    pozivi[1].zavrsi(OK);
    await protoci();
    expect(red.imaNesacuvano()).toBe(false);
  });

  test("sacuvano(k) is the clock time of the confirmation", async () => {
    const { red, pozivi, posalji, sat } = postavka();
    expect(red.sacuvano(K)).toBeUndefined();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    sat.postavi(4_321);
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.sacuvano(K)).toBe(4_321);
    expect(red.zbir().poslednjeU).toBe(4_321);
    expect(red.sacuvano("cena:nema")).toBeUndefined();
  });

  test("with a chained value sacuvano is stamped only by the last save", async () => {
    const { red, pozivi, posalji, sat } = postavka();
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    red.zakazi(K, { ocekivano: 100, vrednost: 200, posalji });
    sat.postavi(2_000);
    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.sacuvano(K)).toBeUndefined(); // 200 is still on its way
    expect(red.zbir().poslednjeU).toBe(2_000);
    sat.postavi(3_000);
    pozivi[1].zavrsi(OK);
    await protoci();
    expect(red.sacuvano(K)).toBe(3_000);
    expect(red.zbir().poslednjeU).toBe(3_000);
  });

  test("zbir counts failed and conflicting keys, and cuva-se wins over greska", async () => {
    const { red, pozivi, posalji } = postavka();
    const drugi = kljucCene("art2");
    const treci = kljucCene("art3");
    red.zakazi(K, { ocekivano: 1, vrednost: 2, posalji });
    red.zakazi(drugi, { ocekivano: 1, vrednost: 2, posalji });
    pozivi[0].zavrsi(greska("mreza", true));
    pozivi[1].zavrsi(konflikt(5, 2));
    await protoci();
    expect(red.zbir()).toEqual({ stanje: "greska", neuspelo: 2, poslednjeU: null });

    red.zakazi(treci, { ocekivano: 1, vrednost: 2, posalji });
    expect(red.zbir()).toEqual({ stanje: "cuva-se", neuspelo: 2, poslednjeU: null });
  });
});

describe("subscribers", () => {
  test("snimak grows and listeners are called on every change", async () => {
    const { red, pozivi, posalji } = postavka();
    let pozvano = 0;
    const odjava = red.pretplati(() => {
      pozvano += 1;
    });
    const pocetni = red.snimak();

    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji });
    const posleSlanja = red.snimak();
    expect(posleSlanja).toBeGreaterThan(pocetni);
    expect(pozvano).toBeGreaterThan(0);

    pozivi[0].zavrsi(OK);
    await protoci();
    expect(red.snimak()).toBeGreaterThan(posleSlanja);
    expect(red.stanje(K)).toBeUndefined();

    odjava();
    const pozvanoPreOdjave = pozvano;
    red.zakazi(K, { ocekivano: 150, vrednost: 160, posalji });
    expect(pozvano).toBe(pozvanoPreOdjave);
    expect(red.snimak()).toBeGreaterThan(posleSlanja);
  });

  test("a listener sees the new state when it is called", () => {
    const { red, posalji } = postavka();
    const videno: (string | undefined)[] = [];
    red.pretplati(() => videno.push(red.stanje(K)?.faza));
    red.zakazi(K, { ocekivano: 100, vrednost: 150, posalji, odlozi: 600 });
    expect(videno).toEqual(["ceka"]);
  });

  test("tracked actions notify too", async () => {
    const { red } = postavka();
    let pozvano = 0;
    red.pretplati(() => {
      pozvano += 1;
    });
    await red.prati(async () => OK);
    expect(pozvano).toBe(2); // start and end
  });
});
