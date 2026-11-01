// ScanMe Menu V1 — K04: promotions (master §7.6). The pure rules shared by the
// editor, Convex and the renderer: percent <-> price in whole dinars, what makes
// a valid discount, which regular prices a promotion applies to, and whether it
// runs at a given instant (computed from time, never by a job).

import { describe, expect, test } from "vitest";
import {
  checkPromo,
  isPromoActiveAt,
  isPromoScheduled,
  percentFromPromoPrice,
  promoPriceFromPercent,
  promoPrices,
  promoStateAt,
  promoWindowFromBelgradeLocal,
  regularPrices,
  type MenuPromo,
  type MenuPromoPriceContext,
} from "./promo";

const plain = (basePriceRsd: number | null): MenuPromoPriceContext => ({
  basePriceRsd,
  variantsEnabled: false,
  variants: [],
});

const withVariants = (
  basePriceRsd: number | null,
  variants: { key: string; priceRsd: number | null }[],
): MenuPromoPriceContext => ({ basePriceRsd, variantsEnabled: true, variants });

const percentPromo = (percent: number, rest: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "percent",
  percent,
  ...rest,
});

const pricePromo = (priceRsd: number, rest: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "price",
  priceRsd,
  ...rest,
});

describe("percent <-> price, whole dinars, half up", () => {
  test("a percent becomes a promo price rounded to the nearest dinar, half up", () => {
    expect(promoPriceFromPercent(450, 15)).toBe(383); // 382,5 -> 383
    expect(promoPriceFromPercent(1000, 10)).toBe(900);
    expect(promoPriceFromPercent(199, 50)).toBe(100); // 99,5 -> 100
    expect(promoPriceFromPercent(200, 50)).toBe(100);
    expect(promoPriceFromPercent(333, 33)).toBe(223); // 223,11 -> 223
    expect(promoPriceFromPercent(1, 99)).toBe(0); // 0,01 -> 0 (a 99 % discount of 1 dinar)
  });

  test("a promo price becomes the nearest whole percent, never 0 for a real discount", () => {
    expect(percentFromPromoPrice(450, 383)).toBe(15); // 14,89 %
    expect(percentFromPromoPrice(1000, 900)).toBe(10);
    expect(percentFromPromoPrice(1000, 999)).toBe(1); // 0,1 % rounds to 0, but it is a discount
    expect(percentFromPromoPrice(400, 300)).toBe(25);
    expect(percentFromPromoPrice(450, 300)).toBe(33); // 33,33 %
    expect(percentFromPromoPrice(450, 1)).toBe(100); // 99,78 %
  });

  test("a price that is not lower is not a discount", () => {
    expect(percentFromPromoPrice(450, 450)).toBeNull();
    expect(percentFromPromoPrice(450, 500)).toBeNull();
    expect(percentFromPromoPrice(0, 0)).toBeNull();
    expect(percentFromPromoPrice(450, -1)).toBeNull();
  });
});

describe("checkPromo: price mode", () => {
  test("needs the base price, and a price that is at least 1 and lower than it", () => {
    expect(checkPromo(pricePromo(300), plain(450))).toEqual(pricePromo(300));
    expect(checkPromo(pricePromo(449), plain(450))).toEqual(pricePromo(449));
    expect(checkPromo(pricePromo(1), plain(450))).toEqual(pricePromo(1));
    expect(checkPromo(pricePromo(300), plain(null))).toBeNull();
    expect(checkPromo(pricePromo(450), plain(450))).toBeNull();
    expect(checkPromo(pricePromo(500), plain(450))).toBeNull();
    expect(checkPromo(pricePromo(0), plain(450))).toBeNull();
  });

  test("the price must be a valid whole-dinar amount and must be given", () => {
    expect(checkPromo(pricePromo(299.5), plain(450))).toBeNull();
    expect(checkPromo(pricePromo(-5), plain(450))).toBeNull();
    expect(checkPromo(pricePromo(Number.NaN), plain(450))).toBeNull();
    expect(checkPromo({ active: true, mode: "price" }, plain(450))).toBeNull();
  });

  test("is refused when variants are enabled (one promo price cannot fit several regular prices)", () => {
    const context = withVariants(450, [
      { key: "mala", priceRsd: 400 },
      { key: "velika", priceRsd: 600 },
    ]);
    expect(checkPromo(pricePromo(300), context)).toBeNull();
  });

  test("variants switched on but none created yet still uses the base price", () => {
    expect(checkPromo(pricePromo(300), withVariants(450, []))).toEqual(pricePromo(300));
  });
});

describe("checkPromo: percent mode", () => {
  test("percent is a whole number from 1 to 99", () => {
    expect(checkPromo(percentPromo(1), plain(450))).toEqual(percentPromo(1));
    expect(checkPromo(percentPromo(99), plain(450))).toEqual(percentPromo(99));
    for (const bad of [0, -10, 100, 150, 15.5, Number.NaN]) {
      expect(checkPromo(percentPromo(bad), plain(450))).toBeNull();
    }
    expect(checkPromo({ active: true, mode: "percent" }, plain(450))).toBeNull();
  });

  test("needs at least one regular price", () => {
    expect(checkPromo(percentPromo(10), plain(null))).toBeNull();
    expect(
      checkPromo(percentPromo(10), withVariants(null, [{ key: "a", priceRsd: null }])),
    ).toBeNull();
    expect(
      checkPromo(percentPromo(10), withVariants(null, [{ key: "a", priceRsd: 300 }])),
    ).toEqual(percentPromo(10));
  });

  test("works on variant prices; a variant without a price falls back to the base price", () => {
    const context = withVariants(400, [
      { key: "mala", priceRsd: 300 },
      { key: "velika", priceRsd: 500 },
      { key: "bez-cene", priceRsd: null },
    ]);
    expect(checkPromo(percentPromo(10), context)).toEqual(percentPromo(10));
    expect(promoPrices(percentPromo(10), context)).toEqual([
      { key: "mala", regularRsd: 300, promoRsd: 270, percent: 10 },
      { key: "velika", regularRsd: 500, promoRsd: 450, percent: 10 },
      { key: "bez-cene", regularRsd: 400, promoRsd: 360, percent: 10 },
    ]);
  });
});

describe("checkPromo: schedule and stored form", () => {
  test("the start must be before the end; instants are whole non-negative milliseconds", () => {
    const ok = Date.UTC(2026, 9, 17, 16);
    expect(checkPromo(percentPromo(10, { startsAt: ok, endsAt: ok + 1 }), plain(450))).not.toBeNull();
    expect(checkPromo(percentPromo(10, { startsAt: ok, endsAt: ok }), plain(450))).toBeNull();
    expect(checkPromo(percentPromo(10, { startsAt: ok + 1, endsAt: ok }), plain(450))).toBeNull();
    expect(checkPromo(percentPromo(10, { startsAt: ok }), plain(450))).not.toBeNull();
    expect(checkPromo(percentPromo(10, { endsAt: ok }), plain(450))).not.toBeNull();
    expect(checkPromo(percentPromo(10, { startsAt: -1 }), plain(450))).toBeNull();
    expect(checkPromo(percentPromo(10, { endsAt: 1.5 }), plain(450))).toBeNull();
  });

  test("keeps only the value of its mode (and the label and schedule)", () => {
    const start = Date.UTC(2026, 9, 17, 16);
    const end = Date.UTC(2026, 9, 17, 20);
    // A price promotion drops a stray percent; a percent promotion drops a stray price.
    const price = checkPromo(
      { active: false, mode: "price", priceRsd: 300, percent: 20, label: "recommended" },
      plain(450),
    );
    expect(price).toEqual({ active: false, mode: "price", priceRsd: 300, label: "recommended" });
    expect(price).not.toHaveProperty("percent");

    const percent = checkPromo(
      { active: true, mode: "percent", percent: 20, priceRsd: 300, startsAt: start, endsAt: end },
      plain(450),
    );
    expect(percent).toEqual({ active: true, mode: "percent", percent: 20, startsAt: start, endsAt: end });
    expect(percent).not.toHaveProperty("priceRsd");
    expect(percent).not.toHaveProperty("label");
  });
});

describe("regularPrices and promoPrices", () => {
  test("regular prices: the base price, or every variant (with the base fallback)", () => {
    expect(regularPrices(plain(450))).toEqual([{ key: null, regularRsd: 450 }]);
    expect(regularPrices(plain(null))).toEqual([]);
    expect(
      regularPrices(withVariants(400, [{ key: "a", priceRsd: 300 }, { key: "b", priceRsd: null }])),
    ).toEqual([
      { key: "a", regularRsd: 300 },
      { key: "b", regularRsd: 400 },
    ]);
    // No base price: a variant without a price has nothing to show.
    expect(
      regularPrices(withVariants(null, [{ key: "a", priceRsd: 300 }, { key: "b", priceRsd: null }])),
    ).toEqual([{ key: "a", regularRsd: 300 }]);
  });

  test("a price promotion: regular and promo price of the base price, with the derived percent", () => {
    expect(promoPrices(pricePromo(300), plain(450))).toEqual([
      { key: null, regularRsd: 450, promoRsd: 300, percent: 33 },
    ]);
    expect(promoPrices(pricePromo(383), plain(450))).toEqual([
      { key: null, regularRsd: 450, promoRsd: 383, percent: 15 },
    ]);
  });

  test("a percent promotion: the promo price of the base price follows the base price", () => {
    expect(promoPrices(percentPromo(15), plain(450))).toEqual([
      { key: null, regularRsd: 450, promoRsd: 383, percent: 15 },
    ]);
    expect(promoPrices(percentPromo(15), plain(500))).toEqual([
      { key: null, regularRsd: 500, promoRsd: 425, percent: 15 },
    ]);
  });

  test("an invalid promotion gives no promo prices (the regular price shows)", () => {
    expect(promoPrices(pricePromo(450), plain(450))).toBeNull();
    expect(promoPrices(percentPromo(10), plain(null))).toBeNull();
    expect(promoPrices(pricePromo(300), withVariants(450, [{ key: "a", priceRsd: 400 }]))).toBeNull();
  });
});

describe("isPromoScheduled", () => {
  test("a start or an end makes it scheduled; none is a manual promotion", () => {
    expect(isPromoScheduled({})).toBe(false);
    expect(isPromoScheduled({ startsAt: 1 })).toBe(true);
    expect(isPromoScheduled({ endsAt: 1 })).toBe(true);
    expect(isPromoScheduled({ startsAt: 1, endsAt: 2 })).toBe(true);
  });
});

describe("activity by Belgrade time", () => {
  test("summer window (CEST, UTC+2): 18:00-22:00 Belgrade is 16:00Z-20:00Z", () => {
    const window = promoWindowFromBelgradeLocal("2026-10-17T18:00", "2026-10-17T22:00");
    expect(window).toEqual({
      startsAt: Date.UTC(2026, 9, 17, 16, 0),
      endsAt: Date.UTC(2026, 9, 17, 20, 0),
    });
    const promo = { active: true, ...window };
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 15, 59))).toBe("scheduled");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 16, 0))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 19, 59))).toBe("active");
    // The end is exclusive: from 20:00Z the regular price is back, by itself.
    expect(promoStateAt(promo, Date.UTC(2026, 9, 17, 20, 0))).toBe("ended");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 18, 12, 0))).toBe("ended");
    expect(isPromoActiveAt(promo, Date.UTC(2026, 9, 17, 16, 0))).toBe(true);
    expect(isPromoActiveAt(promo, Date.UTC(2026, 9, 17, 15, 59))).toBe(false);
    expect(isPromoActiveAt(promo, Date.UTC(2026, 9, 17, 20, 0))).toBe(false);
  });

  test("winter window (CET, UTC+1): 08:00-10:00 Belgrade is 07:00Z-09:00Z", () => {
    const window = promoWindowFromBelgradeLocal("2026-12-01T08:00", "2026-12-01T10:00");
    expect(window).toEqual({
      startsAt: Date.UTC(2026, 11, 1, 7, 0),
      endsAt: Date.UTC(2026, 11, 1, 9, 0),
    });
    const promo = { active: true, ...window };
    expect(promoStateAt(promo, Date.UTC(2026, 11, 1, 6, 59))).toBe("scheduled");
    expect(promoStateAt(promo, Date.UTC(2026, 11, 1, 7, 0))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 11, 1, 8, 59))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 11, 1, 9, 0))).toBe("ended");
  });

  test("a window across the DST change of 25 Oct 2026 keeps both ends on the wall clock", () => {
    // 24 Oct 23:00 is still CEST (21:00Z); 25 Oct 05:00 is already CET (04:00Z):
    // 6 wall-clock hours, 7 real hours.
    const window = promoWindowFromBelgradeLocal("2026-10-24T23:00", "2026-10-25T05:00");
    expect(window).toEqual({
      startsAt: Date.UTC(2026, 9, 24, 21, 0),
      endsAt: Date.UTC(2026, 9, 25, 4, 0),
    });
    const promo = { active: true, ...window };
    expect(promoStateAt(promo, Date.UTC(2026, 9, 24, 20, 59))).toBe("scheduled");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 24, 21, 0))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 25, 3, 59))).toBe("active");
    expect(promoStateAt(promo, Date.UTC(2026, 9, 25, 4, 0))).toBe("ended");
  });

  test("an inactive promotion is off whatever the time", () => {
    const window = promoWindowFromBelgradeLocal("2026-10-17T18:00", "2026-10-17T22:00");
    const promo = { active: false, ...window };
    for (const hour of [10, 16, 18, 20, 23]) {
      expect(promoStateAt(promo, Date.UTC(2026, 9, 17, hour, 0))).toBe("off");
    }
    expect(isPromoActiveAt(promo, Date.UTC(2026, 9, 17, 17, 0))).toBe(false);
    expect(promoStateAt({ active: false }, Date.UTC(2026, 9, 17, 17, 0))).toBe("off");
  });

  test("open start: running right away until the end; open end: running from the start for good", () => {
    const end = promoWindowFromBelgradeLocal(null, "2026-10-17T22:00");
    expect(end).toEqual({ endsAt: Date.UTC(2026, 9, 17, 20, 0) });
    expect(promoStateAt({ active: true, ...end }, 0)).toBe("active");
    expect(promoStateAt({ active: true, ...end }, Date.UTC(2026, 9, 17, 19, 59))).toBe("active");
    expect(promoStateAt({ active: true, ...end }, Date.UTC(2026, 9, 17, 20, 0))).toBe("ended");

    const start = promoWindowFromBelgradeLocal("2026-10-17T18:00", "");
    expect(start).toEqual({ startsAt: Date.UTC(2026, 9, 17, 16, 0) });
    expect(promoStateAt({ active: true, ...start }, Date.UTC(2026, 9, 17, 15, 59))).toBe("scheduled");
    expect(promoStateAt({ active: true, ...start }, Date.UTC(2026, 9, 17, 16, 0))).toBe("active");
    expect(promoStateAt({ active: true, ...start }, Date.UTC(2030, 0, 1))).toBe("active");

    // No schedule at all: a manual promotion is active for as long as it is on.
    expect(promoStateAt({ active: true }, Date.UTC(2026, 9, 17, 12, 0))).toBe("active");
  });

  test("an empty input is an open window", () => {
    expect(promoWindowFromBelgradeLocal(null, null)).toEqual({});
    expect(promoWindowFromBelgradeLocal(undefined, undefined)).toEqual({});
    expect(promoWindowFromBelgradeLocal("", "")).toEqual({});
  });

  test("an invalid local time, or a start that is not before the end, gives no window", () => {
    expect(promoWindowFromBelgradeLocal("2026-10-17 18:00", null)).toBeNull();
    expect(promoWindowFromBelgradeLocal(null, "17.10.2026 22:00")).toBeNull();
    expect(promoWindowFromBelgradeLocal("garbage", "2026-10-17T22:00")).toBeNull();
    expect(promoWindowFromBelgradeLocal("2026-10-17T18:00", "2026-10-17T22:00:00")).toBeNull();
    expect(promoWindowFromBelgradeLocal("2026-10-17T22:00", "2026-10-17T18:00")).toBeNull();
    expect(promoWindowFromBelgradeLocal("2026-10-17T18:00", "2026-10-17T18:00")).toBeNull();
  });
});
