// ScanMe Menu V1 (K16) — where a Room service price comes from (master §5.3):
// inherited / computed / manual, what the markup rule alone would give, and
// the dialog shown after the base price of a manual-priced article changed.

import { describe, expect, test } from "vitest";
import type { RoomServiceRule } from "./room-service-pricing";
import { countOrigins, rsRowPrice, rsWarningView, type RsRowPriceInput } from "./rs-price-origin";

const all = (markupBps: number): RoomServiceRule => ({ markupBps, markupScope: "all" });
const selected = (markupBps: number): RoomServiceRule => ({ markupBps, markupScope: "selected" });
const row = (base: number | null, extra: Partial<RsRowPriceInput> = {}): RsRowPriceInput => ({
  basePriceRsd: base,
  markupApplies: false,
  manualPriceRsd: null,
  ...extra,
});

describe("rsRowPrice — inherited", () => {
  test("no markup: the base price, inherited", () => {
    expect(rsRowPrice(all(0), row(450))).toEqual({
      priceRsd: 450,
      origin: "inherited",
      basePriceRsd: 450,
      markupPercent: null,
      rulePriceRsd: 450,
      markupReaches: false,
    });
  });

  test("no markup stays inherited even for a selected row", () => {
    const view = rsRowPrice(all(0), row(450, { markupApplies: true }));
    expect(view.origin).toBe("inherited");
    expect(view.priceRsd).toBe(450);
    expect(view.markupReaches).toBe(false);
  });

  test("scope selected and the row is not selected: base price, inherited, markup does not reach it", () => {
    expect(rsRowPrice(selected(1500), row(450))).toEqual({
      priceRsd: 450,
      origin: "inherited",
      basePriceRsd: 450,
      markupPercent: null,
      rulePriceRsd: 450,
      markupReaches: false,
    });
  });

  test("base price null: no price at all, inherited, nothing to recompute", () => {
    expect(rsRowPrice(all(1500), row(null))).toEqual({
      priceRsd: null,
      origin: "inherited",
      basePriceRsd: null,
      markupPercent: null,
      rulePriceRsd: null,
      markupReaches: true,
    });
  });
});

describe("rsRowPrice — computed", () => {
  test("markup for all: 450 + 15 % = 518 (67.5 rounds half up)", () => {
    expect(rsRowPrice(all(1500), row(450))).toEqual({
      priceRsd: 518,
      origin: "computed",
      basePriceRsd: 450,
      markupPercent: 15,
      rulePriceRsd: 518,
      markupReaches: true,
    });
  });

  test("scope selected and the row is selected", () => {
    const view = rsRowPrice(selected(1500), row(450, { markupApplies: true }));
    expect(view.origin).toBe("computed");
    expect(view.priceRsd).toBe(518);
    expect(view.markupReaches).toBe(true);
  });

  test("scope all ignores markupApplies = false", () => {
    expect(rsRowPrice(all(1500), row(450, { markupApplies: false })).origin).toBe("computed");
  });

  test("markupPercent is the markup in percent, with decimals", () => {
    expect(rsRowPrice(all(1250), row(200)).markupPercent).toBe(12.5);
    expect(rsRowPrice(all(725), row(200)).markupPercent).toBe(7.25);
  });

  test("rounds half up and down", () => {
    expect(rsRowPrice(all(1500), row(449)).priceRsd).toBe(516); // 67.35 down
    expect(rsRowPrice(all(1000), row(335)).priceRsd).toBe(369); // 33.5 up
    expect(rsRowPrice(all(5000), row(1)).priceRsd).toBe(2); // 0.5 up
  });

  test("a zero base price with a markup is still computed (0)", () => {
    const view = rsRowPrice(all(1500), row(0));
    expect(view.priceRsd).toBe(0);
    expect(view.origin).toBe("computed");
  });
});

describe("rsRowPrice — manual", () => {
  test("a manual price wins over the markup and stays exactly as typed", () => {
    expect(rsRowPrice(all(1500), row(450, { manualPriceRsd: 599 }))).toEqual({
      priceRsd: 599,
      origin: "manual",
      basePriceRsd: 450,
      markupPercent: null,
      rulePriceRsd: 518,
      markupReaches: true,
    });
  });

  test("a manual price wins for a row the markup does not reach", () => {
    const view = rsRowPrice(selected(1500), row(450, { manualPriceRsd: 480 }));
    expect(view.origin).toBe("manual");
    expect(view.priceRsd).toBe(480);
    expect(view.rulePriceRsd).toBe(450);
    expect(view.markupReaches).toBe(false);
  });

  test("a manual price wins even without a base price", () => {
    expect(rsRowPrice(all(1500), row(null, { manualPriceRsd: 350 }))).toEqual({
      priceRsd: 350,
      origin: "manual",
      basePriceRsd: null,
      markupPercent: null,
      rulePriceRsd: null,
      markupReaches: true,
    });
  });

  test("a manual price of 0 is a real manual price", () => {
    const view = rsRowPrice(all(1500), row(450, { manualPriceRsd: 0 }));
    expect(view.origin).toBe("manual");
    expect(view.priceRsd).toBe(0);
  });

  test("with no markup at all, a manual price is still manual and the rule gives the base price", () => {
    const view = rsRowPrice(all(0), row(450, { manualPriceRsd: 500 }));
    expect(view.origin).toBe("manual");
    expect(view.rulePriceRsd).toBe(450);
  });
});

describe("countOrigins", () => {
  test("counts each origin", () => {
    expect(
      countOrigins([
        { origin: "inherited" },
        { origin: "computed" },
        { origin: "computed" },
        { origin: "manual" },
        { origin: "computed" },
      ]),
    ).toEqual({ inherited: 1, computed: 3, manual: 1 });
  });

  test("nothing counted is all zeros", () => {
    expect(countOrigins([])).toEqual({ inherited: 0, computed: 0, manual: 0 });
  });

  test("works on the views rsRowPrice returns", () => {
    const rule = selected(1500);
    const views = [
      rsRowPrice(rule, row(450)),
      rsRowPrice(rule, row(450, { markupApplies: true })),
      rsRowPrice(rule, row(450, { manualPriceRsd: 400 })),
      rsRowPrice(rule, row(null)),
    ];
    expect(countOrigins(views)).toEqual({ inherited: 2, computed: 1, manual: 1 });
  });
});

describe("rsWarningView", () => {
  test("old base, new base, the manual RS price and the price recomputing would give with the NEW base", () => {
    // The base went 450 -> 500; the manual Room service price 480 stays.
    const view = rsWarningView(all(1500), row(500, { manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: 500 });
    expect(view).toEqual({
      oldBaseRsd: 450,
      newBaseRsd: 500,
      roomServicePriceRsd: 480,
      recomputedPriceRsd: 575, // 500 + 75 (15 %)
    });
  });

  test("the recomputed price is the old-base price when the base is unchanged in the row (control)", () => {
    const old = rsWarningView(all(1500), row(450, { manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: 450 });
    expect(old.recomputedPriceRsd).toBe(518);
    const now = rsWarningView(all(1500), row(500, { manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: 500 });
    expect(now.recomputedPriceRsd).not.toBe(old.recomputedPriceRsd);
  });

  test("without a markup the recomputed price is the new base price", () => {
    const view = rsWarningView(all(0), row(500, { manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: 500 });
    expect(view.recomputedPriceRsd).toBe(500);
  });

  test("scope selected and the row not selected: recomputing gives the plain new base", () => {
    const view = rsWarningView(selected(1500), row(500, { manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: 500 });
    expect(view.recomputedPriceRsd).toBe(500);
    const picked = rsWarningView(selected(1500), row(500, { markupApplies: true, manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: 500 });
    expect(picked.recomputedPriceRsd).toBe(575);
  });

  test("the article lost its price: nothing to recompute, the manual price stays", () => {
    const view = rsWarningView(all(1500), row(null, { manualPriceRsd: 480 }), { oldBaseRsd: 450, newBaseRsd: null });
    expect(view).toEqual({ oldBaseRsd: 450, newBaseRsd: null, roomServicePriceRsd: 480, recomputedPriceRsd: null });
  });

  test("the article had no price before and got one now", () => {
    const view = rsWarningView(all(1500), row(300, { manualPriceRsd: 480 }), { oldBaseRsd: null, newBaseRsd: 300 });
    expect(view.oldBaseRsd).toBeNull();
    expect(view.recomputedPriceRsd).toBe(345);
  });
});
