// ScanMe Menu V1 — room service pricing (master §5.3): base → markup → manual
// → one delivery fee per order, whole dinars, half-up rounding, integer math.

import { describe, expect, test } from "vitest";
import {
  ROOM_SERVICE_MAX_MARKUP_BPS,
  isValidMarkupBps,
  markupAmountRsd,
  markupAppliesTo,
  markupBpsToPercent,
  markupPercentToBps,
  nextPriceWarning,
  priceWarningView,
  resolvePriceWarning,
  roomServiceOrderTotal,
  roomServiceUnitPrice,
  ruleUnitPriceRsd,
  type RoomServiceItemPriceInput,
  type RoomServiceRule,
  type RoomServiceUnitPrice,
} from "./room-service-pricing";

const all = (markupBps: number): RoomServiceRule => ({ markupBps, markupScope: "all" });
const selected = (markupBps: number): RoomServiceRule => ({ markupBps, markupScope: "selected" });

interface PriceCase {
  name: string;
  rule: RoomServiceRule;
  base: number | null;
  applies: boolean;
  manual: number | null;
  expected: RoomServiceUnitPrice;
}

const PRICE_CASES: PriceCase[] = [
  { name: "450 + 15 % = 518 (67.5 rounds up)", rule: all(1500), base: 450, applies: false, manual: null, expected: { priceRsd: 518, origin: "computed" } },
  { name: "449 + 15 % = 516 (67.35 rounds down)", rule: all(1500), base: 449, applies: false, manual: null, expected: { priceRsd: 516, origin: "computed" } },
  { name: "333 + 10 % = 366 (33.3 rounds down)", rule: all(1000), base: 333, applies: false, manual: null, expected: { priceRsd: 366, origin: "computed" } },
  { name: "335 + 10 % = 369 (33.5 rounds half up)", rule: all(1000), base: 335, applies: false, manual: null, expected: { priceRsd: 369, origin: "computed" } },
  { name: "199 + 12.5 % = 224 (24.875 rounds up)", rule: all(1250), base: 199, applies: false, manual: null, expected: { priceRsd: 224, origin: "computed" } },
  { name: "1 + 50 % = 2 (0.5 rounds up)", rule: all(5000), base: 1, applies: false, manual: null, expected: { priceRsd: 2, origin: "computed" } },
  { name: "3 + 50 % = 5 (1.5 rounds up)", rule: all(5000), base: 3, applies: false, manual: null, expected: { priceRsd: 5, origin: "computed" } },
  { name: "0 + 15 % = 0 and still computed", rule: all(1500), base: 0, applies: false, manual: null, expected: { priceRsd: 0, origin: "computed" } },
  { name: "100 + 0 % = 100 inherited", rule: all(0), base: 100, applies: true, manual: null, expected: { priceRsd: 100, origin: "inherited" } },
  { name: "selected scope, article not selected → base, inherited", rule: selected(1500), base: 450, applies: false, manual: null, expected: { priceRsd: 450, origin: "inherited" } },
  { name: "selected scope, article selected → computed", rule: selected(1500), base: 450, applies: true, manual: null, expected: { priceRsd: 518, origin: "computed" } },
  { name: "all scope ignores markupApplies = false", rule: all(1500), base: 450, applies: false, manual: null, expected: { priceRsd: 518, origin: "computed" } },
  { name: "manual 600 beats the 15 % markup", rule: all(1500), base: 450, applies: true, manual: 600, expected: { priceRsd: 600, origin: "manual" } },
  { name: "manual 599 stays exactly 599", rule: all(1500), base: 450, applies: true, manual: 599, expected: { priceRsd: 599, origin: "manual" } },
  { name: "manual price beats an unselected article's base", rule: selected(1500), base: 450, applies: false, manual: 480, expected: { priceRsd: 480, origin: "manual" } },
  { name: "manual 0 is a real manual price", rule: all(1500), base: 450, applies: true, manual: 0, expected: { priceRsd: 0, origin: "manual" } },
  { name: "manual price works without a base price", rule: all(1500), base: null, applies: true, manual: 350, expected: { priceRsd: 350, origin: "manual" } },
  { name: "no base and no manual → no price, inherited", rule: all(1500), base: null, applies: true, manual: null, expected: { priceRsd: null, origin: "inherited" } },
  { name: "no base, 0 % markup → no price, inherited", rule: all(0), base: null, applies: false, manual: null, expected: { priceRsd: null, origin: "inherited" } },
  { name: "max price 1 000 000 + 300 % = 4 000 000", rule: all(ROOM_SERVICE_MAX_MARKUP_BPS), base: 1_000_000, applies: false, manual: null, expected: { priceRsd: 4_000_000, origin: "computed" } },
];

describe("roomServiceUnitPrice (base → markup → manual)", () => {
  test.each(PRICE_CASES)("$name", ({ rule, base, applies, manual, expected }) => {
    expect(
      roomServiceUnitPrice(rule, { basePriceRsd: base, markupApplies: applies, manualPriceRsd: manual }),
    ).toEqual(expected);
  });
});

describe("ruleUnitPriceRsd (what recomputeFromMarkup yields)", () => {
  test.each([
    { rule: all(1500), base: 450, applies: false, expected: 518 },
    { rule: selected(1500), base: 450, applies: false, expected: 450 },
    { rule: selected(1500), base: 450, applies: true, expected: 518 },
    { rule: all(0), base: 450, applies: true, expected: 450 },
    { rule: all(1500), base: null, applies: true, expected: null },
  ])("$rule.markupScope $rule.markupBps bps, base $base, applies $applies → $expected", ({ rule, base, applies, expected }) => {
    expect(ruleUnitPriceRsd(rule, base, applies)).toBe(expected);
  });
});

describe("markupAppliesTo", () => {
  test.each([
    { rule: all(1500), applies: false, expected: true },
    { rule: all(1500), applies: true, expected: true },
    { rule: selected(1500), applies: false, expected: false },
    { rule: selected(1500), applies: true, expected: true },
    { rule: all(0), applies: true, expected: false },
    { rule: selected(0), applies: true, expected: false },
  ])("$rule.markupScope $rule.markupBps bps, applies $applies → $expected", ({ rule, applies, expected }) => {
    expect(markupAppliesTo(rule, applies)).toBe(expected);
  });
});

describe("markup percent and basis points", () => {
  test("the cap is 300 %", () => {
    expect(ROOM_SERVICE_MAX_MARKUP_BPS).toBe(30_000);
  });

  test.each([
    { bps: 0, valid: true },
    { bps: 1, valid: true },
    { bps: 1500, valid: true },
    { bps: 30_000, valid: true },
    { bps: 30_001, valid: false },
    { bps: -1, valid: false },
    { bps: 1.5, valid: false },
    { bps: Number.NaN, valid: false },
    { bps: Number.POSITIVE_INFINITY, valid: false },
  ])("isValidMarkupBps($bps) → $valid", ({ bps, valid }) => {
    expect(isValidMarkupBps(bps)).toBe(valid);
  });

  test.each([
    { percent: 15, bps: 1500 },
    { percent: 12.5, bps: 1250 },
    { percent: 7.25, bps: 725 },
    { percent: 0, bps: 0 },
    { percent: 300, bps: 30_000 },
    { percent: 0.01, bps: 1 },
    { percent: 0.29, bps: 29 },
    { percent: 1.1, bps: 110 },
    { percent: 4.35, bps: 435 },
    { percent: 300.01, bps: null },
    { percent: -1, bps: null },
    { percent: -0.01, bps: null },
    { percent: 1.234, bps: null },
    { percent: 1.005, bps: null },
    { percent: 0.001, bps: null },
    { percent: Number.NaN, bps: null },
    { percent: Number.POSITIVE_INFINITY, bps: null },
    { percent: Number.NEGATIVE_INFINITY, bps: null },
  ])("markupPercentToBps($percent) → $bps", ({ percent, bps }) => {
    expect(markupPercentToBps(percent)).toBe(bps);
  });

  test("negative zero is plain zero", () => {
    expect(Object.is(markupPercentToBps(-0), 0)).toBe(true);
  });

  test.each([
    { bps: 1500, percent: 15 },
    { bps: 1250, percent: 12.5 },
    { bps: 725, percent: 7.25 },
    { bps: 0, percent: 0 },
    { bps: 30_000, percent: 300 },
  ])("markupBpsToPercent($bps) → $percent", ({ bps, percent }) => {
    expect(markupBpsToPercent(bps)).toBe(percent);
  });

  test("percent → bps → percent round-trips for every valid two-decimal percent", () => {
    for (let bps = 0; bps <= ROOM_SERVICE_MAX_MARKUP_BPS; bps += 1) {
      expect(markupPercentToBps(markupBpsToPercent(bps))).toBe(bps);
    }
  });
});

describe("markupAmountRsd determinism (integer math, half up)", () => {
  // Exact reference: half-up division with BigInt, no floats anywhere.
  function exactHalfUp(base: number, bps: number): number {
    return Number((BigInt(base) * BigInt(bps) + BigInt(5000)) / BigInt(10000));
  }

  test("1500 bps over bases 0..2000 is an integer and equals the BigInt result", () => {
    for (let base = 0; base <= 2000; base += 1) {
      const amount = markupAmountRsd(base, 1500);
      expect(Number.isInteger(amount)).toBe(true);
      expect(amount).toBe(exactHalfUp(base, 1500));
    }
  });

  test("away from a .5 boundary it agrees with float rounding", () => {
    for (let base = 0; base <= 2000; base += 1) {
      if (base % 20 === 10) continue; // base * 0.15 ends in exactly .5
      expect(base + markupAmountRsd(base, 1500)).toBe(Math.round(base * 0.15 + base));
    }
  });

  test("on a .5 boundary it always rounds up", () => {
    for (let base = 10; base <= 2000; base += 20) {
      expect(markupAmountRsd(base, 1500)).toBe((3 * base + 10) / 20); // x.5 → x + 1
    }
  });

  test("every bps in 0..30000 on awkward bases stays an exact integer", () => {
    for (const base of [1, 7, 199, 449, 999_999, 1_000_000]) {
      for (let bps = 0; bps <= ROOM_SERVICE_MAX_MARKUP_BPS; bps += 7) {
        const amount = markupAmountRsd(base, bps);
        expect(Number.isInteger(amount)).toBe(true);
        expect(amount).toBe(exactHalfUp(base, bps));
      }
    }
  });

  test("zero markup or zero base adds nothing", () => {
    expect(markupAmountRsd(450, 0)).toBe(0);
    expect(markupAmountRsd(0, 30_000)).toBe(0);
  });
});

describe("roomServiceOrderTotal (the fee is added once)", () => {
  test("[518 x 2, 300 x 1] with fee 200 → 1336 + 200 = 1536", () => {
    expect(
      roomServiceOrderTotal(
        [
          { unitPriceRsd: 518, quantity: 2 },
          { unitPriceRsd: 300, quantity: 1 },
        ],
        200,
      ),
    ).toEqual({ itemsRsd: 1336, deliveryFeeRsd: 200, totalRsd: 1536 });
  });

  test.each([1, 2, 10])("the fee is added once for an order with %i line(s)", (count) => {
    const lines = Array.from({ length: count }, () => ({ unitPriceRsd: 100, quantity: 1 }));
    expect(roomServiceOrderTotal(lines, 250)).toEqual({
      itemsRsd: 100 * count,
      deliveryFeeRsd: 250,
      totalRsd: 100 * count + 250,
    });
  });

  test("a null fee is 0", () => {
    expect(roomServiceOrderTotal([{ unitPriceRsd: 518, quantity: 2 }], null)).toEqual({
      itemsRsd: 1036,
      deliveryFeeRsd: 0,
      totalRsd: 1036,
    });
  });

  test("an empty order has no fee", () => {
    expect(roomServiceOrderTotal([], 200)).toEqual({ itemsRsd: 0, deliveryFeeRsd: 0, totalRsd: 0 });
    expect(roomServiceOrderTotal([], null)).toEqual({ itemsRsd: 0, deliveryFeeRsd: 0, totalRsd: 0 });
  });

  test("a free (0 RSD) line still counts toward the order and its fee", () => {
    expect(roomServiceOrderTotal([{ unitPriceRsd: 0, quantity: 1 }], 200)).toEqual({
      itemsRsd: 0,
      deliveryFeeRsd: 200,
      totalRsd: 200,
    });
  });

  test.each([
    { name: "quantity 0", lines: [{ unitPriceRsd: 100, quantity: 0 }], fee: 0 },
    { name: "quantity 1.5", lines: [{ unitPriceRsd: 100, quantity: 1.5 }], fee: 0 },
    { name: "negative quantity", lines: [{ unitPriceRsd: 100, quantity: -1 }], fee: 0 },
    { name: "NaN quantity", lines: [{ unitPriceRsd: 100, quantity: Number.NaN }], fee: 0 },
    { name: "negative price", lines: [{ unitPriceRsd: -1, quantity: 1 }], fee: 0 },
    { name: "fractional price", lines: [{ unitPriceRsd: 99.5, quantity: 1 }], fee: 0 },
    { name: "fractional fee", lines: [{ unitPriceRsd: 100, quantity: 1 }], fee: 200.5 },
    { name: "negative fee", lines: [{ unitPriceRsd: 100, quantity: 1 }], fee: -1 },
    { name: "invalid line after a valid one", lines: [{ unitPriceRsd: 100, quantity: 1 }, { unitPriceRsd: 100, quantity: 0 }], fee: 0 },
  ])("throws RangeError for $name", ({ lines, fee }) => {
    expect(() => roomServiceOrderTotal(lines, fee)).toThrow(RangeError);
  });
});

describe("nextPriceWarning", () => {
  const AT = 1_000;
  const existing = { oldBaseRsd: 450, newBaseRsd: 500, at: 500 };

  test("no manual price → no warning, the computed price simply follows", () => {
    expect(
      nextPriceWarning({ existing: null, manualPriceRsd: null, previousBaseRsd: 450, nextBaseRsd: 500, at: AT }),
    ).toBeNull();
    expect(
      nextPriceWarning({ existing, manualPriceRsd: null, previousBaseRsd: 500, nextBaseRsd: 520, at: AT }),
    ).toBeNull();
  });

  test("unchanged base → the existing warning is returned as is", () => {
    expect(
      nextPriceWarning({ existing, manualPriceRsd: 600, previousBaseRsd: 500, nextBaseRsd: 500, at: AT }),
    ).toBe(existing);
    expect(
      nextPriceWarning({ existing: null, manualPriceRsd: 600, previousBaseRsd: 500, nextBaseRsd: 500, at: AT }),
    ).toBeNull();
  });

  test("first change 450 → 500 raises a warning", () => {
    expect(
      nextPriceWarning({ existing: null, manualPriceRsd: 600, previousBaseRsd: 450, nextBaseRsd: 500, at: AT }),
    ).toEqual({ oldBaseRsd: 450, newBaseRsd: 500, at: AT });
  });

  test("second change 500 → 520 keeps old base 450, moves new base and time", () => {
    expect(
      nextPriceWarning({ existing, manualPriceRsd: 600, previousBaseRsd: 500, nextBaseRsd: 520, at: AT }),
    ).toEqual({ oldBaseRsd: 450, newBaseRsd: 520, at: AT });
  });

  test("changing back to the confirmed base clears the warning", () => {
    expect(
      nextPriceWarning({ existing, manualPriceRsd: 600, previousBaseRsd: 500, nextBaseRsd: 450, at: AT }),
    ).toBeNull();
  });

  test("base cleared (500 → null) → new base null", () => {
    expect(
      nextPriceWarning({ existing: null, manualPriceRsd: 600, previousBaseRsd: 500, nextBaseRsd: null, at: AT }),
    ).toEqual({ oldBaseRsd: 500, newBaseRsd: null, at: AT });
  });

  test("base set from null → old base null", () => {
    expect(
      nextPriceWarning({ existing: null, manualPriceRsd: 600, previousBaseRsd: null, nextBaseRsd: 500, at: AT }),
    ).toEqual({ oldBaseRsd: null, newBaseRsd: 500, at: AT });
  });

  test("returning to a cleared base (null) also clears the warning", () => {
    const cleared = { oldBaseRsd: null, newBaseRsd: 500, at: 500 };
    expect(
      nextPriceWarning({ existing: cleared, manualPriceRsd: 600, previousBaseRsd: 500, nextBaseRsd: null, at: AT }),
    ).toBeNull();
  });
});

describe("resolvePriceWarning", () => {
  test("keepManual keeps the manual price and clears the warning", () => {
    expect(resolvePriceWarning("keepManual", 600)).toEqual({ manualPriceRsd: 600, priceWarning: null });
  });

  test("recomputeFromMarkup clears the manual price and the warning", () => {
    expect(resolvePriceWarning("recomputeFromMarkup", 600)).toEqual({
      manualPriceRsd: null,
      priceWarning: null,
    });
  });

  test("a null manual price stays null for both actions", () => {
    expect(resolvePriceWarning("keepManual", null)).toEqual({ manualPriceRsd: null, priceWarning: null });
    expect(resolvePriceWarning("recomputeFromMarkup", null)).toEqual({
      manualPriceRsd: null,
      priceWarning: null,
    });
  });
});

describe("priceWarningView", () => {
  const warning = { oldBaseRsd: 450, newBaseRsd: 500, at: 1_000 };

  test("rule 15 % all, base now 500, manual 600 → RS price 600, recomputed 575", () => {
    const item: RoomServiceItemPriceInput = { basePriceRsd: 500, markupApplies: false, manualPriceRsd: 600 };
    expect(priceWarningView(all(1500), item, warning)).toEqual({
      oldBaseRsd: 450,
      newBaseRsd: 500,
      roomServicePriceRsd: 600,
      recomputedPriceRsd: 575,
    });
  });

  test("recomputed price follows the selected scope", () => {
    const item: RoomServiceItemPriceInput = { basePriceRsd: 500, markupApplies: false, manualPriceRsd: 600 };
    expect(priceWarningView(selected(1500), item, warning).recomputedPriceRsd).toBe(500);
    expect(
      priceWarningView(selected(1500), { ...item, markupApplies: true }, warning).recomputedPriceRsd,
    ).toBe(575);
  });

  test("a cleared base gives no recomputed price but keeps the manual one", () => {
    const item: RoomServiceItemPriceInput = { basePriceRsd: null, markupApplies: true, manualPriceRsd: 600 };
    expect(
      priceWarningView(all(1500), item, { oldBaseRsd: 450, newBaseRsd: null, at: 1_000 }),
    ).toEqual({ oldBaseRsd: 450, newBaseRsd: null, roomServicePriceRsd: 600, recomputedPriceRsd: null });
  });
});
