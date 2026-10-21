// ScanMe Menu V1 (K14) — the active promotion at Belgrade wall-clock
// boundaries (master §7.6): it starts and ends by the instant, and after the
// end the regular price comes back by itself. Uses the K13 view functions.

import { describe, expect, test } from "vitest";
import { epochToBelgradeLocal } from "../belgrade-time";
import { promoWindowFromBelgradeLocal, type MenuPromo } from "./promo";
import { akcijaAktivna, cenaPrikaz } from "./public-view";
import type { PublicArticle } from "./snapshot";

function clanak(over: Partial<PublicArticle> = {}): PublicArticle {
  return {
    key: "ar_test00000001",
    kind: "item",
    name: "Kafa",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 400,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode: "none", imageMediaId: null, iconKey: null },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
    ...over,
  };
}

const MINUT = 60 * 1000;

function prozor(od: string, do_: string): { startsAt: number; endsAt: number } {
  const w = promoWindowFromBelgradeLocal(od, do_);
  if (!w || w.startsAt === undefined || w.endsAt === undefined) throw new Error("bad window in test");
  return { startsAt: w.startsAt, endsAt: w.endsAt };
}

const cenaPromo = (priceRsd: number, over: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "price",
  priceRsd,
  ...over,
});

const procenatPromo = (percent: number, over: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "percent",
  percent,
  ...over,
});

describe("a window entered as Belgrade wall clock (2026-10-20 08:00 to 22:00)", () => {
  const W = prozor("2026-10-20T08:00", "2026-10-20T22:00");
  const a = clanak({ priceRsd: 400, promo: cenaPromo(300, W) });

  test("the window is the Belgrade wall clock (CEST, UTC+2)", () => {
    expect(W.startsAt).toBe(Date.UTC(2026, 9, 20, 6, 0));
    expect(W.endsAt).toBe(Date.UTC(2026, 9, 20, 20, 0));
  });

  test("one minute before the start: not active, the regular price shows", () => {
    const sad = W.startsAt - MINUT;
    expect(akcijaAktivna(a, sad)).toBe(false);
    expect(cenaPrikaz(a, sad)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("exactly at the start: active, the promo price shows", () => {
    expect(akcijaAktivna(a, W.startsAt)).toBe(true);
    expect(cenaPrikaz(a, W.startsAt)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
  });

  test("the last minute before the end (21:59): still active", () => {
    const sad = W.endsAt - MINUT;
    expect(epochToBelgradeLocal(sad)).toBe("2026-10-20T21:59");
    expect(akcijaAktivna(a, sad)).toBe(true);
    expect(cenaPrikaz(a, sad)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
  });

  test("exactly at the end: not active, the regular price comes back by itself", () => {
    expect(akcijaAktivna(a, W.endsAt)).toBe(false);
    expect(cenaPrikaz(a, W.endsAt)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("after the end and on later days: not active", () => {
    for (const sad of [W.endsAt + MINUT, W.endsAt + 24 * 60 * MINUT, W.endsAt + 400 * 24 * 60 * MINUT]) {
      expect(akcijaAktivna(a, sad)).toBe(false);
      expect(cenaPrikaz(a, sad)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
    }
  });

  test("long before the start: not active", () => {
    expect(akcijaAktivna(a, 0)).toBe(false);
    expect(cenaPrikaz(a, 0)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("an article without a promotion is never active", () => {
    expect(akcijaAktivna(clanak(), W.startsAt)).toBe(false);
    expect(cenaPrikaz(clanak(), W.startsAt)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });
});

describe("a window across the DST change (2026-10-25 01:30 to 04:00 Belgrade)", () => {
  // Clocks go back at 03:00 CEST -> 02:00 CET (01:00 UTC): the window is 3.5 real hours long.
  const W = prozor("2026-10-25T01:30", "2026-10-25T04:00");
  const a = clanak({ promo: cenaPromo(300, W) });

  test("the instants are the real ones", () => {
    expect(W.startsAt).toBe(Date.UTC(2026, 9, 24, 23, 30)); // 01:30 CEST
    expect(W.endsAt).toBe(Date.UTC(2026, 9, 25, 3, 0)); // 04:00 CET
    expect(W.endsAt - W.startsAt).toBe(3.5 * 60 * MINUT);
  });

  test("behaves by the instant, also through the repeated hour", () => {
    expect(akcijaAktivna(a, W.startsAt - MINUT)).toBe(false);
    expect(akcijaAktivna(a, W.startsAt)).toBe(true);
    expect(akcijaAktivna(a, Date.UTC(2026, 9, 25, 0, 30))).toBe(true); // 02:30 CEST
    expect(akcijaAktivna(a, Date.UTC(2026, 9, 25, 1, 30))).toBe(true); // 02:30 CET, the second time
    expect(akcijaAktivna(a, Date.UTC(2026, 9, 25, 2, 59))).toBe(true); // 03:59 CET
    expect(akcijaAktivna(a, W.endsAt)).toBe(false); // 04:00 CET
    expect(cenaPrikaz(a, W.endsAt)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
    expect(cenaPrikaz(a, Date.UTC(2026, 9, 25, 1, 30))).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
  });
});

describe("manual and open-ended promotions", () => {
  test("a manual promotion without a window is active", () => {
    const a = clanak({ promo: cenaPromo(300) });
    expect(akcijaAktivna(a, 0)).toBe(true);
    expect(akcijaAktivna(a, Date.UTC(2030, 0, 1))).toBe(true);
    expect(cenaPrikaz(a, Date.UTC(2026, 9, 20, 12, 0))).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
  });

  test("active:false is never active, inside any window or without one", () => {
    const W = prozor("2026-10-20T08:00", "2026-10-20T22:00");
    const unutra = W.startsAt + 60 * MINUT;
    for (const promo of [cenaPromo(300, { active: false }), cenaPromo(300, { ...W, active: false })]) {
      const a = clanak({ promo });
      expect(akcijaAktivna(a, unutra)).toBe(false);
      expect(cenaPrikaz(a, unutra)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
    }
  });

  test("a start without an end runs from the start on", () => {
    const { startsAt } = prozor("2026-10-20T08:00", "2026-10-20T22:00");
    const a = clanak({ promo: cenaPromo(300, { startsAt }) });
    expect(akcijaAktivna(a, startsAt - MINUT)).toBe(false);
    expect(akcijaAktivna(a, startsAt)).toBe(true);
    expect(akcijaAktivna(a, startsAt + 1000 * 24 * 60 * MINUT)).toBe(true);
  });

  test("an end without a start runs until the end", () => {
    const { endsAt } = prozor("2026-10-20T08:00", "2026-10-20T22:00");
    const a = clanak({ promo: cenaPromo(300, { endsAt }) });
    expect(akcijaAktivna(a, 0)).toBe(true);
    expect(akcijaAktivna(a, endsAt - MINUT)).toBe(true);
    expect(akcijaAktivna(a, endsAt)).toBe(false);
  });
});

describe("variants", () => {
  const W = prozor("2026-10-20T08:00", "2026-10-20T22:00");
  const varijante = [
    { key: "va_1", name: "Mala", priceRsd: 500 },
    { key: "va_2", name: "Velika", priceRsd: 700 },
  ];
  const a = clanak({ priceRsd: null, variants: varijante, promo: procenatPromo(20, W) });

  test("a percent promotion gives every variant its own promo price while it runs", () => {
    expect(cenaPrikaz(a, W.startsAt)).toEqual({
      vrsta: "varijante",
      stavke: [
        { key: "va_1", naziv: "Mala", rsd: 500, akcijska: 400 },
        { key: "va_2", naziv: "Velika", rsd: 700, akcijska: 560 },
      ],
    });
  });

  test("before the start and from the end, the variants show regular prices only", () => {
    const redovne = {
      vrsta: "varijante",
      stavke: [
        { key: "va_1", naziv: "Mala", rsd: 500, akcijska: null },
        { key: "va_2", naziv: "Velika", rsd: 700, akcijska: null },
      ],
    };
    expect(cenaPrikaz(a, W.startsAt - MINUT)).toEqual(redovne);
    expect(cenaPrikaz(a, W.endsAt)).toEqual(redovne);
  });

  test("a percent promotion on a base price rounds to whole dinars, half up", () => {
    const b = clanak({ priceRsd: 450, promo: procenatPromo(15, W) });
    expect(cenaPrikaz(b, W.startsAt)).toEqual({ vrsta: "osnovna", rsd: 450, akcijska: 383 }); // 382.5
  });

  test("a price promotion cannot apply to variants: the regular prices show", () => {
    const b = clanak({ priceRsd: 600, variants: varijante, promo: cenaPromo(300, W) });
    expect(cenaPrikaz(b, W.startsAt)).toEqual({
      vrsta: "varijante",
      stavke: [
        { key: "va_1", naziv: "Mala", rsd: 500, akcijska: null },
        { key: "va_2", naziv: "Velika", rsd: 700, akcijska: null },
      ],
    });
  });
});
