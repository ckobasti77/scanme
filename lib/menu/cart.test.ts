// ScanMe Menu V1 (K21) — the guest's cart and the order sent to the waiter
// (master §5.3, §8.2; plan K19-8, K19-9): selection checks, the price of a
// line, the cart on the phone, and the server side of an order. Fictional data.

import { describe, expect, test } from "vitest";
import {
  addCartLine,
  applyServerPrices,
  cartCount,
  cartLineId,
  cartStorageKey,
  checkOrderShape,
  cleanLineNote,
  isOrderAttemptKey,
  linePrice,
  missingGroups,
  orderFingerprint,
  orderLinesOf,
  orderTotals,
  priceOrder,
  readStoredCart,
  removeCartLine,
  setCartQuantity,
  validateSelection,
  type CartArticle,
  type CartLine,
  type OrderLineInput,
} from "./cart";
import type { MenuPromo } from "./promo";
import type { PublicAddonGroup, PublicArticle } from "./snapshot";

// =============================================================================
// Fixtures
// =============================================================================

const NOW = 1_800_000_000_000;

function article(fields: Partial<PublicArticle> & Pick<PublicArticle, "key" | "name">): PublicArticle {
  return {
    kind: "item",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: null,
    variants: [],
    addonGroups: [],
    noteEnabled: false,
    media: { mode: "none", imageMediaId: null, iconKey: null },
    allergens: null,
    tags: [],
    promo: null,
    combo: null,
    ...fields,
  };
}

function group(
  key: string,
  selection: "single" | "multiple",
  minSelect: number,
  maxSelect: number,
  options: [key: string, name: string, priceDeltaRsd: number][],
): PublicAddonGroup {
  return {
    key,
    name: `Grupa ${key}`,
    selection,
    required: minSelect > 0,
    minSelect,
    maxSelect,
    options: options.map(([optionKey, name, priceDeltaRsd]) => ({ key: optionKey, name, priceDeltaRsd })),
  };
}

/** Single, required: exactly one. */
const SIDE = group("prilog", "single", 1, 1, [
  ["pomfrit", "Pomfrit", 0],
  ["salata", "Salata", 50],
]);
/** Single, optional: zero or one. */
const SAUCE = group("sos", "single", 0, 1, [
  ["kecap", "Kecap", 0],
  ["majonez", "Majonez", 20],
]);
/** Multiple, optional: zero to two. */
const EXTRAS = group("dodaci", "multiple", 0, 2, [
  ["sir", "Sir", 60],
  ["slanina", "Slanina", 90],
  ["jaje", "Jaje", 40],
]);
/** Multiple, required: one to two. */
const TOPPINGS = group("preliv", "multiple", 1, 2, [
  ["med", "Med", 30],
  ["dzem", "Dzem", 20],
  ["cokolada", "Cokolada", 40],
]);

const KAFA = article({ key: "kafa", name: "Kafa", priceRsd: 200 });
const SOK = article({
  key: "sok",
  name: "Sok",
  variants: [
    { key: "mali", name: "Mali", priceRsd: 150 },
    { key: "veliki", name: "Veliki", priceRsd: 250 },
  ],
});
const BURGER = article({ key: "burger", name: "Burger", priceRsd: 700, noteEnabled: true, addonGroups: [SIDE, EXTRAS] });
const PALACINKE = article({ key: "palacinke", name: "Palacinke", priceRsd: 450 });
const DNEVNA_PONUDA = article({ key: "dnevna", name: "Dnevna ponuda" });

const percent = (value: number, fields: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "percent",
  percent: value,
  ...fields,
});
const promoPrice = (priceRsd: number, fields: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "price",
  priceRsd,
  ...fields,
});
const promoted = (base: PublicArticle, promo: MenuPromo): PublicArticle => ({ ...base, promo });

const pick = (addonKeys: string[] = [], variantKey: string | null = null) => ({ variantKey, addonKeys });

// =============================================================================
// validateSelection
// =============================================================================

describe("validateSelection: the variant", () => {
  test("a variant is required when the article has variants", () => {
    expect(validateSelection(SOK, pick())).toEqual({ ok: false, problem: "variant_required" });
  });

  test("an unknown variant key is refused", () => {
    expect(validateSelection(SOK, pick([], "ogromni"))).toEqual({ ok: false, problem: "variant_unknown" });
  });

  test("a known variant is returned", () => {
    expect(validateSelection(SOK, pick([], "veliki"))).toEqual({
      ok: true,
      variant: { key: "veliki", name: "Veliki", priceRsd: 250 },
      addons: [],
    });
  });

  test("a variant key on an article without variants is refused", () => {
    expect(validateSelection(KAFA, pick([], "mali"))).toEqual({ ok: false, problem: "variant_unknown" });
  });

  test("an article with neither a price nor variants cannot be ordered", () => {
    expect(validateSelection(DNEVNA_PONUDA, pick())).toEqual({ ok: false, problem: "no_price" });
  });

  test("an article with a price and no variants needs no variant", () => {
    expect(validateSelection(KAFA, pick())).toEqual({ ok: true, variant: null, addons: [] });
  });
});

describe("validateSelection: add-ons", () => {
  const withGroups = (...groups: PublicAddonGroup[]) => article({ key: "x", name: "X", priceRsd: 100, addonGroups: groups });

  test("an add-on key that belongs to no group is unknown", () => {
    expect(validateSelection(withGroups(SAUCE), pick(["ketchup-nepostojeci"]))).toEqual({ ok: false, problem: "addon_unknown" });
  });

  test("an unknown key next to a valid one is still unknown", () => {
    expect(validateSelection(withGroups(SAUCE), pick(["kecap", "nema"]))).toEqual({ ok: false, problem: "addon_unknown" });
  });

  test("a key listed twice is refused", () => {
    expect(validateSelection(withGroups(EXTRAS), pick(["sir", "sir"]))).toEqual({ ok: false, problem: "addon_unknown" });
  });

  test("add-ons on an article without groups are unknown", () => {
    expect(validateSelection(KAFA, pick(["sir"]))).toEqual({ ok: false, problem: "addon_unknown" });
  });

  test("a required single group needs exactly one option", () => {
    const burger = withGroups(SIDE);
    expect(validateSelection(burger, pick())).toEqual({ ok: false, problem: "addon_bounds", groupKey: "prilog" });
    expect(validateSelection(burger, pick(["pomfrit", "salata"]))).toEqual({ ok: false, problem: "addon_bounds", groupKey: "prilog" });
    expect(validateSelection(burger, pick(["salata"]))).toMatchObject({ ok: true });
  });

  test("an optional single group takes zero or one option", () => {
    const sauced = withGroups(SAUCE);
    expect(validateSelection(sauced, pick())).toMatchObject({ ok: true, addons: [] });
    expect(validateSelection(sauced, pick(["majonez"]))).toMatchObject({ ok: true });
    expect(validateSelection(sauced, pick(["kecap", "majonez"]))).toEqual({ ok: false, problem: "addon_bounds", groupKey: "sos" });
  });

  test("a multiple group keeps its minimum and its maximum", () => {
    const bar = withGroups(TOPPINGS);
    expect(validateSelection(bar, pick())).toEqual({ ok: false, problem: "addon_bounds", groupKey: "preliv" });
    expect(validateSelection(bar, pick(["med"]))).toMatchObject({ ok: true });
    expect(validateSelection(bar, pick(["med", "dzem"]))).toMatchObject({ ok: true });
    expect(validateSelection(bar, pick(["med", "dzem", "cokolada"]))).toEqual({
      ok: false,
      problem: "addon_bounds",
      groupKey: "preliv",
    });
  });

  test("an optional multiple group takes zero up to its maximum", () => {
    const extras = withGroups(EXTRAS);
    expect(validateSelection(extras, pick())).toMatchObject({ ok: true });
    expect(validateSelection(extras, pick(["sir", "jaje"]))).toMatchObject({ ok: true });
    expect(validateSelection(extras, pick(["sir", "jaje", "slanina"]))).toEqual({
      ok: false,
      problem: "addon_bounds",
      groupKey: "dodaci",
    });
  });

  test("the group that fails is named", () => {
    expect(validateSelection(BURGER, pick(["sir", "jaje", "slanina", "pomfrit"]))).toEqual({
      ok: false,
      problem: "addon_bounds",
      groupKey: "dodaci",
    });
    expect(validateSelection(BURGER, pick(["sir"]))).toEqual({ ok: false, problem: "addon_bounds", groupKey: "prilog" });
  });

  test("the priced add-ons come back in group and option order, with their names and deltas", () => {
    const result = validateSelection(BURGER, pick(["slanina", "salata", "sir"]));
    expect(result).toEqual({
      ok: true,
      variant: null,
      addons: [
        { groupKey: "prilog", groupName: "Grupa prilog", optionKey: "salata", optionName: "Salata", priceDeltaRsd: 50 },
        { groupKey: "dodaci", groupName: "Grupa dodaci", optionKey: "sir", optionName: "Sir", priceDeltaRsd: 60 },
        { groupKey: "dodaci", groupName: "Grupa dodaci", optionKey: "slanina", optionName: "Slanina", priceDeltaRsd: 90 },
      ],
    });
  });

  test("a variant article is checked for add-ons too", () => {
    const sok = article({
      key: "sok",
      name: "Sok",
      variants: [{ key: "mali", name: "Mali", priceRsd: 150 }],
      addonGroups: [SAUCE],
    });
    expect(validateSelection(sok, pick(["kecap"], "mali"))).toMatchObject({ ok: true });
    expect(validateSelection(sok, pick(["nema"], "mali"))).toEqual({ ok: false, problem: "addon_unknown" });
  });
});

// =============================================================================
// missingGroups
// =============================================================================

describe("missingGroups", () => {
  const sandwich = { addonGroups: [SIDE, SAUCE, EXTRAS, TOPPINGS] };

  test("lists every required group below its minimum", () => {
    expect(missingGroups(sandwich, []).map((row) => row.key)).toEqual(["prilog", "preliv"]);
  });

  test("a group that reached its minimum is no longer missing", () => {
    expect(missingGroups(sandwich, ["salata"]).map((row) => row.key)).toEqual(["preliv"]);
    expect(missingGroups(sandwich, ["salata", "med"])).toEqual([]);
  });

  test("optional groups are never missing", () => {
    expect(missingGroups({ addonGroups: [SAUCE, EXTRAS] }, [])).toEqual([]);
  });

  test("a group with a higher minimum stays missing until it is reached", () => {
    const pair = group("par", "multiple", 2, 3, [
      ["a", "A", 0],
      ["b", "B", 0],
      ["c", "C", 0],
    ]);
    expect(missingGroups({ addonGroups: [pair] }, ["a"]).map((row) => row.key)).toEqual(["par"]);
    expect(missingGroups({ addonGroups: [pair] }, ["a", "c"])).toEqual([]);
  });

  test("returns the groups themselves", () => {
    expect(missingGroups({ addonGroups: [SIDE] }, [])[0]).toBe(SIDE);
  });
});

// =============================================================================
// linePrice
// =============================================================================

describe("linePrice", () => {
  type PriceOptions = {
    quantity?: number;
    variantKey?: string | null;
    addonKeys?: string[];
    channel?: "standard" | "room_service";
    nowMs?: number;
  };
  const price = (target: CartArticle, options: PriceOptions = {}) =>
    linePrice(
      target,
      { variantKey: options.variantKey ?? null, addonKeys: options.addonKeys ?? [], quantity: options.quantity ?? 1 },
      options.nowMs ?? NOW,
      options.channel ?? "standard",
    );

  test("the base price of an article", () => {
    expect(price(KAFA)).toEqual({
      unitPriceRsd: 200,
      regularPriceRsd: null,
      promoApplied: false,
      variantName: null,
      addons: [],
      addonsRsd: 0,
      pieceRsd: 200,
      lineTotalRsd: 200,
    });
  });

  test("the price of the chosen variant", () => {
    const mali = price(SOK, { variantKey: "mali" });
    const veliki = price(SOK, { variantKey: "veliki" });
    expect(mali).toMatchObject({ unitPriceRsd: 150, variantName: "Mali", pieceRsd: 150 });
    expect(veliki).toMatchObject({ unitPriceRsd: 250, variantName: "Veliki", pieceRsd: 250 });
  });

  test("add-on deltas are summed into the piece", () => {
    const result = price(BURGER, { addonKeys: ["salata", "sir", "slanina"] });
    expect(result).toMatchObject({ unitPriceRsd: 700, addonsRsd: 200, pieceRsd: 900, lineTotalRsd: 900 });
    expect(result?.addons.map((addon) => addon.optionKey)).toEqual(["salata", "sir", "slanina"]);
  });

  test("an add-on with a zero delta changes nothing", () => {
    expect(price(BURGER, { addonKeys: ["pomfrit"] })).toMatchObject({ addonsRsd: 0, pieceRsd: 700 });
  });

  test("the quantity multiplies the whole piece, add-ons included", () => {
    const result = price(BURGER, { addonKeys: ["salata", "sir"], quantity: 3 });
    expect(result).toMatchObject({ pieceRsd: 810, lineTotalRsd: 2430 });
  });

  test("a variant with add-ons and a quantity", () => {
    const sok = article({
      key: "sok",
      name: "Sok",
      variants: [{ key: "veliki", name: "Veliki", priceRsd: 250 }],
      addonGroups: [SAUCE],
    });
    expect(price(sok, { variantKey: "veliki", addonKeys: ["majonez"], quantity: 2 })).toMatchObject({
      unitPriceRsd: 250,
      addonsRsd: 20,
      pieceRsd: 270,
      lineTotalRsd: 540,
    });
  });

  test("returns null for a selection that cannot be ordered", () => {
    expect(price(SOK)).toBeNull();
    expect(price(KAFA, { variantKey: "mali" })).toBeNull();
    expect(price(DNEVNA_PONUDA)).toBeNull();
    expect(price(BURGER)).toBeNull();
    expect(price(BURGER, { addonKeys: ["salata", "nema"] })).toBeNull();
  });

  describe("promotions on a standard order", () => {
    test("an active percent promotion lowers the unit (450 - 15 % = 383, half up)", () => {
      const result = price(promoted(PALACINKE, percent(15)));
      expect(result).toMatchObject({
        unitPriceRsd: 383,
        regularPriceRsd: 450,
        promoApplied: true,
        pieceRsd: 383,
        lineTotalRsd: 383,
      });
    });

    test("an active price promotion lowers the unit to that price", () => {
      const result = price(promoted(PALACINKE, promoPrice(400)), { quantity: 2 });
      expect(result).toMatchObject({
        unitPriceRsd: 400,
        regularPriceRsd: 450,
        promoApplied: true,
        lineTotalRsd: 800,
      });
    });

    test("a percent promotion applies to the chosen variant's price", () => {
      const sok = promoted(SOK, percent(10));
      expect(price(sok, { variantKey: "veliki" })).toMatchObject({ unitPriceRsd: 225, regularPriceRsd: 250, promoApplied: true });
      expect(price(sok, { variantKey: "mali" })).toMatchObject({ unitPriceRsd: 135, regularPriceRsd: 150, promoApplied: true });
    });

    test("a price promotion on an article with variants is invalid and does not apply", () => {
      const result = price(promoted(SOK, promoPrice(100)), { variantKey: "veliki" });
      expect(result).toMatchObject({ unitPriceRsd: 250, regularPriceRsd: null, promoApplied: false });
    });

    test("add-ons are not discounted", () => {
      const result = price(promoted(BURGER, percent(10)), { addonKeys: ["salata"], quantity: 2 });
      expect(result).toMatchObject({
        unitPriceRsd: 630,
        regularPriceRsd: 700,
        promoApplied: true,
        addonsRsd: 50,
        pieceRsd: 680,
        lineTotalRsd: 1360,
      });
    });

    test("a promotion that ended before now does not apply", () => {
      const ended = promoted(PALACINKE, percent(15, { endsAt: NOW - 1 }));
      expect(price(ended)).toMatchObject({ unitPriceRsd: 450, regularPriceRsd: null, promoApplied: false });
    });

    test("a promotion ends exactly at its endsAt", () => {
      expect(price(promoted(PALACINKE, percent(15, { endsAt: NOW })))).toMatchObject({ promoApplied: false, unitPriceRsd: 450 });
      expect(price(promoted(PALACINKE, percent(15, { endsAt: NOW + 1 })))).toMatchObject({ promoApplied: true, unitPriceRsd: 383 });
    });

    test("a promotion that starts after now does not apply yet", () => {
      const later = promoted(PALACINKE, percent(15, { startsAt: NOW + 1 }));
      expect(price(later)).toMatchObject({ unitPriceRsd: 450, regularPriceRsd: null, promoApplied: false });
    });

    test("a promotion applies from its startsAt on", () => {
      const running = promoted(PALACINKE, percent(15, { startsAt: NOW, endsAt: NOW + 60_000 }));
      expect(price(running)).toMatchObject({ unitPriceRsd: 383, promoApplied: true });
    });

    test("the same article is priced by the moment it is read", () => {
      const scheduled = promoted(PALACINKE, percent(15, { startsAt: NOW - 1000, endsAt: NOW + 1000 }));
      expect(price(scheduled, { nowMs: NOW - 2000 })).toMatchObject({ promoApplied: false });
      expect(price(scheduled, { nowMs: NOW })).toMatchObject({ promoApplied: true });
      expect(price(scheduled, { nowMs: NOW + 2000 })).toMatchObject({ promoApplied: false });
    });

    test("a switched-off promotion does not apply", () => {
      const off = promoted(PALACINKE, percent(15, { active: false }));
      expect(price(off)).toMatchObject({ unitPriceRsd: 450, regularPriceRsd: null, promoApplied: false });
    });

    test("a percent promotion that rounds back to the regular price does not count as applied", () => {
      const cheap = article({ key: "bombona", name: "Bombona", priceRsd: 10, promo: percent(1) });
      expect(price(cheap)).toMatchObject({ unitPriceRsd: 10, regularPriceRsd: null, promoApplied: false });
    });
  });

  describe("Room service", () => {
    test("ignores an active percent promotion entirely", () => {
      const result = price(promoted(PALACINKE, percent(15)), { channel: "room_service" });
      expect(result).toMatchObject({ unitPriceRsd: 450, regularPriceRsd: null, promoApplied: false, pieceRsd: 450 });
    });

    test("ignores an active price promotion", () => {
      const result = price(promoted(PALACINKE, promoPrice(400)), { channel: "room_service", quantity: 2 });
      expect(result).toMatchObject({ unitPriceRsd: 450, promoApplied: false, lineTotalRsd: 900 });
    });

    test("prices a variant as given", () => {
      expect(price(promoted(SOK, percent(10)), { channel: "room_service", variantKey: "veliki" })).toMatchObject({
        unitPriceRsd: 250,
        regularPriceRsd: null,
        promoApplied: false,
      });
    });

    test("still adds the add-ons and still refuses an invalid selection", () => {
      expect(price(BURGER, { channel: "room_service", addonKeys: ["salata"] })).toMatchObject({ pieceRsd: 750 });
      expect(price(BURGER, { channel: "room_service" })).toBeNull();
    });
  });
});

// =============================================================================
// orderTotals
// =============================================================================

describe("orderTotals", () => {
  const lines = [
    { pieceRsd: 500, quantity: 2 },
    { pieceRsd: 300, quantity: 3 },
  ];

  test("a standard order has no delivery fee", () => {
    expect(orderTotals(lines, "standard", null)).toEqual({ subtotalRsd: 1900, deliveryFeeRsd: 0, totalRsd: 1900 });
  });

  test("a standard order ignores a fee it is given", () => {
    expect(orderTotals(lines, "standard", 150)).toEqual({ subtotalRsd: 1900, deliveryFeeRsd: 0, totalRsd: 1900 });
  });

  test("Room service adds the fee exactly once, not per line", () => {
    expect(orderTotals(lines, "room_service", 150)).toEqual({ subtotalRsd: 1900, deliveryFeeRsd: 150, totalRsd: 2050 });
  });

  test("an empty Room service order has no fee", () => {
    expect(orderTotals([], "room_service", 150)).toEqual({ subtotalRsd: 0, deliveryFeeRsd: 0, totalRsd: 0 });
  });

  test("an empty standard order is zero", () => {
    expect(orderTotals([], "standard", null)).toEqual({ subtotalRsd: 0, deliveryFeeRsd: 0, totalRsd: 0 });
  });

  test("a null fee on Room service is zero", () => {
    expect(orderTotals(lines, "room_service", null)).toEqual({ subtotalRsd: 1900, deliveryFeeRsd: 0, totalRsd: 1900 });
  });

  test("a zero fee on Room service is zero", () => {
    expect(orderTotals(lines, "room_service", 0)).toEqual({ subtotalRsd: 1900, deliveryFeeRsd: 0, totalRsd: 1900 });
  });
});

// =============================================================================
// The cart on the phone
// =============================================================================

function lineInput(fields: Partial<Omit<CartLine, "id">> = {}): Omit<CartLine, "id"> {
  return {
    pageKey: "pice",
    articleKey: "kafa",
    variantKey: null,
    addonKeys: [],
    quantity: 1,
    note: null,
    name: "Kafa",
    variantName: null,
    addonNames: [],
    pieceRsd: 200,
    ...fields,
  };
}

function cartLine(fields: Partial<Omit<CartLine, "id">> = {}): CartLine {
  const input = lineInput(fields);
  return { ...input, id: cartLineId(input) };
}

describe("cartLineId", () => {
  test("joins page, article, variant, sorted add-ons and note", () => {
    expect(
      cartLineId({ pageKey: "pice", articleKey: "kafa", variantKey: "velika", addonKeys: ["mleko", "med"], note: "bez secera" }),
    ).toBe("pice|kafa|velika|med+mleko|bez secera");
  });

  test("a Room service line (no page) is marked _rs", () => {
    expect(cartLineId({ pageKey: null, articleKey: "kafa", variantKey: null, addonKeys: [], note: null })).toBe("_rs|kafa|||");
  });

  test("does not depend on the order of the add-ons and does not reorder the input", () => {
    const addonKeys = ["sir", "jaje"];
    const first = cartLineId({ pageKey: "pice", articleKey: "burger", variantKey: null, addonKeys, note: null });
    const second = cartLineId({ pageKey: "pice", articleKey: "burger", variantKey: null, addonKeys: ["jaje", "sir"], note: null });
    expect(first).toBe(second);
    expect(addonKeys).toEqual(["sir", "jaje"]);
  });
});

describe("addCartLine", () => {
  test("adds a line to an empty cart", () => {
    const result = addCartLine([], lineInput());
    expect(result.outcome).toBe("added");
    expect(result.lines).toEqual([{ ...lineInput(), id: "pice|kafa|||" }]);
  });

  test("stores the add-on keys sorted", () => {
    const result = addCartLine([], lineInput({ articleKey: "burger", addonKeys: ["sir", "jaje"] }));
    expect(result.lines[0].addonKeys).toEqual(["jaje", "sir"]);
    expect(result.lines[0].id).toBe("pice|burger||jaje+sir|");
  });

  test("merges the same choice by adding the quantities", () => {
    const first = addCartLine([], lineInput({ quantity: 2 }));
    const second = addCartLine(first.lines, lineInput({ quantity: 3 }));
    expect(second.outcome).toBe("merged");
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0].quantity).toBe(5);
  });

  test("merges regardless of the order the add-ons were picked in", () => {
    const first = addCartLine([], lineInput({ articleKey: "burger", addonKeys: ["jaje", "sir"], quantity: 1 }));
    const second = addCartLine(first.lines, lineInput({ articleKey: "burger", addonKeys: ["sir", "jaje"], quantity: 1 }));
    expect(second.outcome).toBe("merged");
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0].quantity).toBe(2);
  });

  test("a merge takes the newest piece price and keeps the rest of the line", () => {
    const first = addCartLine([], lineInput({ pieceRsd: 200, name: "Kafa" }));
    const second = addCartLine(first.lines, lineInput({ pieceRsd: 230, name: "Kafa (nova cena)" }));
    expect(second.lines[0]).toMatchObject({ pieceRsd: 230, name: "Kafa", quantity: 2 });
  });

  test("caps the merged quantity at 50", () => {
    const first = addCartLine([], lineInput({ quantity: 45 }));
    const second = addCartLine(first.lines, lineInput({ quantity: 10 }));
    expect(second.outcome).toBe("merged");
    expect(second.lines[0].quantity).toBe(50);
  });

  test("caps a new line's quantity at 50 and lifts it to at least 1", () => {
    expect(addCartLine([], lineInput({ quantity: 80 })).lines[0].quantity).toBe(50);
    expect(addCartLine([], lineInput({ quantity: 0 })).lines[0].quantity).toBe(1);
  });

  test("a different note makes a separate line", () => {
    const plain = addCartLine([], lineInput({ articleKey: "burger", note: null }));
    const noted = addCartLine(plain.lines, lineInput({ articleKey: "burger", note: "bez luka" }));
    expect(noted.outcome).toBe("added");
    expect(noted.lines).toHaveLength(2);
    const another = addCartLine(noted.lines, lineInput({ articleKey: "burger", note: "bez paradajza" }));
    expect(another.lines).toHaveLength(3);
    const same = addCartLine(another.lines, lineInput({ articleKey: "burger", note: "bez luka" }));
    expect(same.outcome).toBe("merged");
    expect(same.lines).toHaveLength(3);
  });

  test("a different variant or a different page makes a separate line", () => {
    const base = addCartLine([], lineInput({ articleKey: "sok", variantKey: "mali" }));
    const otherVariant = addCartLine(base.lines, lineInput({ articleKey: "sok", variantKey: "veliki" }));
    expect(otherVariant.lines).toHaveLength(2);
    const otherPage = addCartLine(otherVariant.lines, lineInput({ articleKey: "sok", variantKey: "mali", pageKey: "kuhinja" }));
    expect(otherPage.outcome).toBe("added");
    expect(otherPage.lines).toHaveLength(3);
  });

  test("the 31st distinct line is refused as full and the lines stay as they were", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => cartLine({ articleKey: `a${index}` }));
    const result = addCartLine(thirty, lineInput({ articleKey: "novi" }));
    expect(result.outcome).toBe("full");
    expect(result.lines).toEqual(thirty);
  });

  test("the 30th distinct line still fits", () => {
    const twentyNine = Array.from({ length: 29 }, (_, index) => cartLine({ articleKey: `a${index}` }));
    const result = addCartLine(twentyNine, lineInput({ articleKey: "poslednji" }));
    expect(result.outcome).toBe("added");
    expect(result.lines).toHaveLength(30);
  });

  test("a full cart still merges the same choice", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => cartLine({ articleKey: `a${index}` }));
    const result = addCartLine(thirty, lineInput({ articleKey: "a7", quantity: 2 }));
    expect(result.outcome).toBe("merged");
    expect(result.lines).toHaveLength(30);
    expect(result.lines[7].quantity).toBe(3);
  });

  test("does not change the lines it is given", () => {
    const lines = [cartLine({ quantity: 2 })];
    const snapshot = JSON.parse(JSON.stringify(lines));
    addCartLine(lines, lineInput({ quantity: 3 }));
    addCartLine(lines, lineInput({ articleKey: "sok" }));
    expect(lines).toEqual(snapshot);
  });
});

describe("setCartQuantity", () => {
  const lines = [cartLine({ articleKey: "kafa", quantity: 2 }), cartLine({ articleKey: "sok", quantity: 1 })];
  const kafaId = lines[0].id;

  test("sets the quantity of one line", () => {
    const result = setCartQuantity(lines, kafaId, 7);
    expect(result.map((row) => row.quantity)).toEqual([7, 1]);
  });

  test("0 removes the line", () => {
    const result = setCartQuantity(lines, kafaId, 0);
    expect(result.map((row) => row.articleKey)).toEqual(["sok"]);
  });

  test("a negative quantity removes the line too", () => {
    expect(setCartQuantity(lines, kafaId, -3).map((row) => row.articleKey)).toEqual(["sok"]);
  });

  test("caps at 50", () => {
    expect(setCartQuantity(lines, kafaId, 51)[0].quantity).toBe(50);
    expect(setCartQuantity(lines, kafaId, 5000)[0].quantity).toBe(50);
  });

  test("floors a decimal quantity", () => {
    expect(setCartQuantity(lines, kafaId, 3.9)[0].quantity).toBe(3);
  });

  test("an unknown id changes nothing", () => {
    expect(setCartQuantity(lines, "nema", 9)).toEqual(lines);
  });

  test("does not change the lines it is given", () => {
    setCartQuantity(lines, kafaId, 9);
    expect(lines[0].quantity).toBe(2);
  });
});

describe("removeCartLine and cartCount", () => {
  const lines = [cartLine({ articleKey: "kafa", quantity: 2 }), cartLine({ articleKey: "sok", quantity: 4 })];

  test("removeCartLine drops only that line", () => {
    expect(removeCartLine(lines, lines[0].id).map((row) => row.articleKey)).toEqual(["sok"]);
    expect(removeCartLine(lines, "nema")).toEqual(lines);
  });

  test("cartCount sums the quantities", () => {
    expect(cartCount(lines)).toBe(6);
    expect(cartCount([])).toBe(0);
  });
});

describe("cartStorageKey", () => {
  test("is smm_korpa:<slug>:<channel>", () => {
    expect(cartStorageKey("kafana-test", "standard")).toBe("smm_korpa:kafana-test:standard");
    expect(cartStorageKey("kafana-test", "room_service")).toBe("smm_korpa:kafana-test:room_service");
  });
});

describe("cleanLineNote", () => {
  test("trims and collapses whitespace", () => {
    expect(cleanLineNote("  bez   luka \n i  sira ")).toBe("bez luka i sira");
  });

  test("an empty or missing note is null", () => {
    expect(cleanLineNote(null)).toBeNull();
    expect(cleanLineNote(undefined)).toBeNull();
    expect(cleanLineNote("")).toBeNull();
    expect(cleanLineNote("   \n  ")).toBeNull();
  });

  test("280 characters pass, 281 are null", () => {
    expect(cleanLineNote("a".repeat(280))).toBe("a".repeat(280));
    expect(cleanLineNote("a".repeat(281))).toBeNull();
  });

  test("the length is counted after cleaning", () => {
    expect(cleanLineNote(`   ${"a".repeat(280)}   `)).toBe("a".repeat(280));
  });
});

// =============================================================================
// readStoredCart
// =============================================================================

describe("readStoredCart", () => {
  const STORED = {
    pageKey: "pice",
    articleKey: "kafa",
    variantKey: null,
    addonKeys: [],
    quantity: 2,
    note: null,
    name: "Kafa",
    variantName: null,
    addonNames: [],
    pieceRsd: 200,
  };
  const only = (rows: unknown[]) => readStoredCart(JSON.stringify(rows));

  test.each([
    ["null", null],
    ["an empty string", ""],
    ["text that is not JSON", "ovo nije json"],
    ["a broken JSON", '[{"articleKey":'],
    ["a JSON object", '{"articleKey":"kafa"}'],
    ["a JSON string", '"korpa"'],
    ["a JSON number", "42"],
    ["JSON null", "null"],
    ["an empty array", "[]"],
  ])("%s gives an empty cart", (_name, raw) => {
    expect(readStoredCart(raw)).toEqual([]);
  });

  test("reads a valid line and recomputes its id", () => {
    expect(only([STORED])).toEqual([{ ...STORED, id: "pice|kafa|||" }]);
  });

  test("ignores a stored id and computes its own", () => {
    const [line] = only([{ ...STORED, id: "podmetnut" }]);
    expect(line.id).toBe("pice|kafa|||");
    expect(line.id).toBe(cartLineId(line));
  });

  test("fills the optional fields of a minimal line", () => {
    const [line] = only([{ articleKey: "kafa", name: "Kafa", quantity: 1, pieceRsd: 200 }]);
    expect(line).toEqual({
      id: "_rs|kafa|||",
      pageKey: null,
      articleKey: "kafa",
      variantKey: null,
      addonKeys: [],
      quantity: 1,
      note: null,
      name: "Kafa",
      variantName: null,
      addonNames: [],
      pieceRsd: 200,
    });
  });

  test("keeps a free piece (price 0), quantity 1 and quantity 50", () => {
    const lines = only([
      { ...STORED, articleKey: "a", pieceRsd: 0 },
      { ...STORED, articleKey: "b", quantity: 1 },
      { ...STORED, articleKey: "c", quantity: 50 },
    ]);
    expect(lines.map((row) => row.articleKey)).toEqual(["a", "b", "c"]);
  });

  test.each<[string, unknown[]]>([
    ["rows that are not objects", [null, 7, "kafa", true]],
    ["a numeric articleKey", [{ ...STORED, articleKey: 5 }]],
    ["a missing articleKey", [{ ...STORED, articleKey: undefined }]],
    ["a missing name", [{ ...STORED, name: undefined }]],
    ["a numeric name", [{ ...STORED, name: 5 }]],
    ["quantity 0", [{ ...STORED, quantity: 0 }]],
    ["a negative quantity", [{ ...STORED, quantity: -1 }]],
    ["a fractional quantity", [{ ...STORED, quantity: 1.5 }]],
    ["quantity above 50", [{ ...STORED, quantity: 51 }]],
    ["a string quantity", [{ ...STORED, quantity: "2" }]],
    ["a missing quantity", [{ ...STORED, quantity: undefined }]],
    ["a negative piece price", [{ ...STORED, pieceRsd: -1 }]],
    ["a fractional piece price", [{ ...STORED, pieceRsd: 12.5 }]],
    ["a string piece price", [{ ...STORED, pieceRsd: "200" }]],
    ["a missing piece price", [{ ...STORED, pieceRsd: undefined }]],
  ])("drops %s and keeps the valid line next to it", (_name, bad) => {
    const lines = only([STORED, ...bad, { ...STORED, articleKey: "sok", name: "Sok" }]);
    expect(lines.map((row) => row.articleKey)).toEqual(["kafa", "sok"]);
  });

  test("keeps only the first 30 lines", () => {
    const rows = Array.from({ length: 35 }, (_, index) => ({ ...STORED, articleKey: `a${index}` }));
    const lines = only(rows);
    expect(lines).toHaveLength(30);
    expect(lines[0].articleKey).toBe("a0");
    expect(lines[29].articleKey).toBe("a29");
  });

  test("sorts the add-on keys, drops non-string ones and recomputes the id from them", () => {
    const [line] = only([{ ...STORED, articleKey: "burger", addonKeys: ["sir", 5, "jaje", null] }]);
    expect(line.addonKeys).toEqual(["jaje", "sir"]);
    expect(line.id).toBe("pice|burger||jaje+sir|");
  });

  test("a non-array addonKeys or addonNames becomes empty; non-string names are dropped", () => {
    const [line] = only([{ ...STORED, addonKeys: "sir", addonNames: ["Sir", 7, "Jaje"] }]);
    expect(line.addonKeys).toEqual([]);
    expect(line.addonNames).toEqual(["Sir", "Jaje"]);
    const [other] = only([{ ...STORED, addonNames: "Sir" }]);
    expect(other.addonNames).toEqual([]);
  });

  test("cleans the note, and an empty, too long or non-string note becomes null", () => {
    expect(only([{ ...STORED, note: "  bez   luka " }])[0].note).toBe("bez luka");
    expect(only([{ ...STORED, note: "   " }])[0].note).toBeNull();
    expect(only([{ ...STORED, note: "a".repeat(281) }])[0].note).toBeNull();
    expect(only([{ ...STORED, note: 12 }])[0].note).toBeNull();
  });

  test("the note is part of the recomputed id", () => {
    expect(only([{ ...STORED, note: "bez  luka" }])[0].id).toBe("pice|kafa|||bez luka");
  });

  test("non-string page, variant and variant name become null", () => {
    const [line] = only([{ ...STORED, pageKey: 3, variantKey: 4, variantName: 5 }]);
    expect(line).toMatchObject({ pageKey: null, variantKey: null, variantName: null });
    expect(line.id).toBe("_rs|kafa|||");
  });

  test("round-trips a cart built with addCartLine", () => {
    let lines: CartLine[] = [];
    lines = addCartLine(lines, lineInput({ articleKey: "burger", addonKeys: ["sir", "jaje"], quantity: 2, note: "bez luka", addonNames: ["Sir", "Jaje"] })).lines;
    lines = addCartLine(lines, lineInput({ articleKey: "sok", variantKey: "mali", variantName: "Mali", pageKey: null, pieceRsd: 150 })).lines;
    expect(readStoredCart(JSON.stringify(lines))).toEqual(lines);
  });
});

// =============================================================================
// orderLinesOf and applyServerPrices
// =============================================================================

describe("orderLinesOf", () => {
  test("sends only references, quantity and note, never names or prices", () => {
    const [sent] = orderLinesOf([
      cartLine({
        articleKey: "burger",
        variantKey: null,
        addonKeys: ["jaje", "sir"],
        addonNames: ["Jaje", "Sir"],
        quantity: 3,
        note: "bez luka",
        name: "Burger",
        pieceRsd: 810,
      }),
    ]);
    expect(sent).toEqual({
      pageKey: "pice",
      articleKey: "burger",
      variantKey: null,
      addonKeys: ["jaje", "sir"],
      quantity: 3,
      note: "bez luka",
    });
    expect(Object.keys(sent).sort()).toEqual(["addonKeys", "articleKey", "note", "pageKey", "quantity", "variantKey"]);
  });

  test("copies the add-on keys", () => {
    const line = cartLine({ addonKeys: ["jaje"] });
    const [sent] = orderLinesOf([line]);
    sent.addonKeys.push("sir");
    expect(line.addonKeys).toEqual(["jaje"]);
  });

  test("keeps the order of the lines and handles an empty cart", () => {
    expect(orderLinesOf([cartLine({ articleKey: "kafa" }), cartLine({ articleKey: "sok" })]).map((row) => row.articleKey)).toEqual(["kafa", "sok"]);
    expect(orderLinesOf([])).toEqual([]);
  });
});

describe("applyServerPrices", () => {
  const lines = [cartLine({ articleKey: "kafa", pieceRsd: 200 }), cartLine({ articleKey: "sok", pieceRsd: 150 }), cartLine({ articleKey: "burger", pieceRsd: 700 })];

  test("puts today's piece prices on the lines they name by index", () => {
    const result = applyServerPrices(lines, [
      { index: 0, pieceRsd: 220 },
      { index: 2, pieceRsd: 650 },
    ]);
    expect(result.map((row) => row.pieceRsd)).toEqual([220, 150, 650]);
  });

  test("keeps everything else on the line", () => {
    const [first] = applyServerPrices(lines, [{ index: 0, pieceRsd: 220 }]);
    expect(first).toEqual({ ...lines[0], pieceRsd: 220 });
  });

  test("ignores an index that matches no line and does not change the given lines", () => {
    const result = applyServerPrices(lines, [{ index: 9, pieceRsd: 1 }]);
    expect(result).toEqual(lines);
    applyServerPrices(lines, [{ index: 0, pieceRsd: 5 }]);
    expect(lines[0].pieceRsd).toBe(200);
  });

  test("without prices the lines stay as they are", () => {
    expect(applyServerPrices(lines, [])).toEqual(lines);
  });
});

// =============================================================================
// checkOrderShape
// =============================================================================

type ShapeInput = Parameters<typeof checkOrderShape>[0];
type ShapeLine = ShapeInput["lines"][number];

const shapeLine = (fields: Partial<ShapeLine> = {}): ShapeLine => ({
  pageKey: "pice",
  articleKey: "kafa",
  variantKey: null,
  addonKeys: [],
  quantity: 1,
  note: null,
  ...fields,
});
const standardOrder = (lines: ShapeLine[], seenTotalRsd = 200) =>
  checkOrderShape({ channel: "standard", lines, seenTotalRsd });
const roomServiceOrder = (lines: ShapeLine[], seenTotalRsd = 200) =>
  checkOrderShape({ channel: "room_service", lines, seenTotalRsd });
const INVALID = { ok: false, code: "request/invalid_input" };

describe("checkOrderShape: valid orders", () => {
  test("a valid standard order", () => {
    expect(standardOrder([shapeLine()])).toEqual({
      ok: true,
      lines: [{ pageKey: "pice", articleKey: "kafa", variantKey: null, addonKeys: [], quantity: 1, note: null }],
      pageKeys: ["pice"],
    });
  });

  test("a valid Room service order has no pages", () => {
    expect(roomServiceOrder([shapeLine({ pageKey: null })])).toEqual({
      ok: true,
      lines: [{ pageKey: null, articleKey: "kafa", variantKey: null, addonKeys: [], quantity: 1, note: null }],
      pageKeys: [],
    });
  });

  test("a Room service line may leave the page out altogether", () => {
    const result = roomServiceOrder([shapeLine({ pageKey: undefined, variantKey: undefined, note: undefined })]);
    expect(result).toMatchObject({ ok: true, lines: [{ pageKey: null, variantKey: null, note: null }] });
  });

  test("a standard line may leave the variant and note out", () => {
    const result = standardOrder([shapeLine({ variantKey: undefined, note: undefined })]);
    expect(result).toMatchObject({ ok: true, lines: [{ variantKey: null, note: null }] });
  });

  test("keeps variant, add-ons and quantity", () => {
    const result = standardOrder([shapeLine({ articleKey: "burger", variantKey: "veliki", addonKeys: ["sir", "jaje"], quantity: 4 })]);
    expect(result).toMatchObject({
      ok: true,
      lines: [{ articleKey: "burger", variantKey: "veliki", addonKeys: ["sir", "jaje"], quantity: 4 }],
    });
  });

  test("returns the distinct page keys", () => {
    const result = standardOrder([
      shapeLine({ pageKey: "pice", articleKey: "a" }),
      shapeLine({ pageKey: "hrana", articleKey: "b" }),
      shapeLine({ pageKey: "pice", articleKey: "c" }),
    ]);
    expect(result).toMatchObject({ ok: true, pageKeys: ["pice", "hrana"] });
  });

  test("five different pages are allowed", () => {
    const lines = ["p1", "p2", "p3", "p4", "p5"].map((pageKey) => shapeLine({ pageKey }));
    expect(standardOrder(lines)).toMatchObject({ ok: true, pageKeys: ["p1", "p2", "p3", "p4", "p5"] });
  });

  test("30 lines, quantity 1 and 50, 20 add-ons and a 280 character note are the limits that still pass", () => {
    expect(standardOrder(Array.from({ length: 30 }, (_, index) => shapeLine({ articleKey: `a${index}` })))).toMatchObject({ ok: true });
    expect(standardOrder([shapeLine({ quantity: 1 })])).toMatchObject({ ok: true });
    expect(standardOrder([shapeLine({ quantity: 50 })])).toMatchObject({ ok: true });
    expect(standardOrder([shapeLine({ addonKeys: Array.from({ length: 20 }, (_, index) => `ad${index}`) })])).toMatchObject({ ok: true });
    expect(standardOrder([shapeLine({ note: "a".repeat(280) })])).toMatchObject({ ok: true });
  });

  test("keys of exactly 40 characters and with - and _ pass", () => {
    const forty = "k".repeat(40);
    expect(standardOrder([shapeLine({ articleKey: forty, variantKey: forty, pageKey: forty, addonKeys: [forty, "a-b_C9"] })])).toMatchObject({ ok: true });
  });

  test("a seen total of 0 and of the largest allowed value pass", () => {
    expect(standardOrder([shapeLine()], 0)).toMatchObject({ ok: true });
    expect(standardOrder([shapeLine()], 100_000_000)).toMatchObject({ ok: true });
  });

  test("cleans the whitespace of a note and turns an empty note into null", () => {
    const result = standardOrder([
      shapeLine({ articleKey: "a", note: "  bez   luka \n" }),
      shapeLine({ articleKey: "b", note: "   " }),
      shapeLine({ articleKey: "c", note: "" }),
    ]);
    expect(result).toMatchObject({
      ok: true,
      lines: [{ note: "bez luka" }, { note: null }, { note: null }],
    });
  });

  test("a note is measured after cleaning", () => {
    expect(standardOrder([shapeLine({ note: `  ${"a".repeat(280)}  ` })])).toMatchObject({ ok: true });
  });

  test("copies the add-on keys", () => {
    const addonKeys = ["sir"];
    const result = standardOrder([shapeLine({ addonKeys })]);
    if (!result.ok) throw new Error("expected a valid order");
    result.lines[0].addonKeys.push("jaje");
    expect(addonKeys).toEqual(["sir"]);
  });
});

describe("checkOrderShape: refusals are request/invalid_input", () => {
  const cases: [string, () => ReturnType<typeof checkOrderShape>][] = [
    ["0 lines", () => standardOrder([])],
    ["0 lines on Room service", () => roomServiceOrder([])],
    ["31 lines", () => standardOrder(Array.from({ length: 31 }, (_, index) => shapeLine({ articleKey: `a${index}` })))],
    ["quantity 0", () => standardOrder([shapeLine({ quantity: 0 })])],
    ["a negative quantity", () => standardOrder([shapeLine({ quantity: -1 })])],
    ["quantity 51", () => standardOrder([shapeLine({ quantity: 51 })])],
    ["quantity 1.5", () => standardOrder([shapeLine({ quantity: 1.5 })])],
    ["a NaN quantity", () => standardOrder([shapeLine({ quantity: Number.NaN })])],
    ["21 add-ons", () => standardOrder([shapeLine({ addonKeys: Array.from({ length: 21 }, (_, index) => `ad${index}`) })])],
    ["duplicate add-on keys", () => standardOrder([shapeLine({ addonKeys: ["sir", "sir"] })])],
    ["an article key with a space", () => standardOrder([shapeLine({ articleKey: "a b" })])],
    ["an empty article key", () => standardOrder([shapeLine({ articleKey: "" })])],
    ["a 41 character article key", () => standardOrder([shapeLine({ articleKey: "a".repeat(41) })])],
    ["an article key with a slash", () => standardOrder([shapeLine({ articleKey: "a/b" })])],
    ["a variant key with a space", () => standardOrder([shapeLine({ variantKey: "a b" })])],
    ["an empty variant key", () => standardOrder([shapeLine({ variantKey: "" })])],
    ["a 41 character variant key", () => standardOrder([shapeLine({ variantKey: "v".repeat(41) })])],
    ["an add-on key with a space", () => standardOrder([shapeLine({ addonKeys: ["a b"] })])],
    ["an empty add-on key", () => standardOrder([shapeLine({ addonKeys: [""] })])],
    ["a 41 character add-on key", () => standardOrder([shapeLine({ addonKeys: ["x".repeat(41)] })])],
    ["a page key with a space", () => standardOrder([shapeLine({ pageKey: "a b" })])],
    ["a 41 character page key", () => standardOrder([shapeLine({ pageKey: "p".repeat(41) })])],
    ["a 281 character note", () => standardOrder([shapeLine({ note: "a".repeat(281) })])],
    ["a page key on Room service", () => roomServiceOrder([shapeLine({ pageKey: "pice" })])],
    ["a page key on only one Room service line", () => roomServiceOrder([shapeLine({ pageKey: null }), shapeLine({ articleKey: "sok", pageKey: "pice" })])],
    ["no page key on a standard order", () => standardOrder([shapeLine({ pageKey: null })])],
    ["no page key (undefined) on a standard order", () => standardOrder([shapeLine({ pageKey: undefined })])],
    ["no page key on one standard line", () => standardOrder([shapeLine(), shapeLine({ articleKey: "sok", pageKey: null })])],
    ["6 different pages", () => standardOrder(["p1", "p2", "p3", "p4", "p5", "p6"].map((pageKey) => shapeLine({ pageKey })))],
    ["a negative seen total", () => standardOrder([shapeLine()], -1)],
    ["a fractional seen total", () => standardOrder([shapeLine()], 199.5)],
    ["a NaN seen total", () => standardOrder([shapeLine()], Number.NaN)],
    ["an infinite seen total", () => standardOrder([shapeLine()], Number.POSITIVE_INFINITY)],
    ["a seen total above 100 000 000", () => standardOrder([shapeLine()], 100_000_001)],
  ];

  test.each(cases)("%s", (_name, run) => {
    expect(run()).toEqual(INVALID);
  });
});

// =============================================================================
// priceOrder
// =============================================================================

describe("priceOrder", () => {
  const KATALOG = new Map<string, CartArticle>(
    [KAFA, SOK, BURGER, PALACINKE, DNEVNA_PONUDA].map((row) => [row.key, row]),
  );
  const findArticle = (line: OrderLineInput) => KATALOG.get(line.articleKey) ?? null;

  const ref = (fields: Partial<OrderLineInput> = {}): OrderLineInput => ({
    pageKey: "pice",
    articleKey: "kafa",
    variantKey: null,
    addonKeys: [],
    quantity: 1,
    note: null,
    ...fields,
  });

  type Over = Partial<Parameters<typeof priceOrder>[0]>;
  const order = (lines: OrderLineInput[], seenTotalRsd: number, over: Over = {}) =>
    priceOrder({
      channel: "standard",
      lines,
      seenTotalRsd,
      findArticle,
      unavailable: new Set<string>(),
      deliveryFeeRsd: null,
      nowMs: NOW,
      ...over,
    });

  // kafa x2 = 400, burger with fries x1 = 700 -> 1100
  const twoLines = () => [ref({ quantity: 2 }), ref({ articleKey: "burger", addonKeys: ["pomfrit"] })];

  describe("a valid order", () => {
    test("prices every line from the article and returns the totals", () => {
      const lines = [
        ref({ articleKey: "burger", addonKeys: ["salata", "sir"], quantity: 2 }),
        ref({ articleKey: "kafa" }),
      ];
      const result = order(lines, 1820);
      expect(result).toMatchObject({
        ok: true,
        totals: { subtotalRsd: 1820, deliveryFeeRsd: 0, totalRsd: 1820 },
        lines: [
          { articleKey: "burger", name: "Burger", quantity: 2, price: { pieceRsd: 810, lineTotalRsd: 1620 } },
          { articleKey: "kafa", name: "Kafa", quantity: 1, price: { pieceRsd: 200, lineTotalRsd: 200 } },
        ],
      });
    });

    test("takes the name from the article, not from the line", () => {
      const result = order([ref({ articleKey: "sok", variantKey: "veliki" })], 250);
      expect(result).toMatchObject({ ok: true, lines: [{ name: "Sok", price: { variantName: "Veliki", unitPriceRsd: 250 } }] });
    });

    test("keeps the references of each line", () => {
      const line = ref({ articleKey: "burger", addonKeys: ["pomfrit"], note: "bez luka", quantity: 3 });
      const result = order([line], 2100);
      expect(result).toMatchObject({ ok: true, lines: [{ pageKey: "pice", variantKey: null, addonKeys: ["pomfrit"], note: "bez luka", quantity: 3 }] });
    });

    test("a note is accepted where the article has notes on", () => {
      expect(order([ref({ articleKey: "burger", addonKeys: ["pomfrit"], note: "bez luka" })], 700)).toMatchObject({ ok: true });
    });

    test("an active promotion lowers the standard price", () => {
      const catalog = new Map<string, CartArticle>([["palacinke", promoted(PALACINKE, percent(15))]]);
      const over = { findArticle: (line: OrderLineInput) => catalog.get(line.articleKey) ?? null };
      expect(order([ref({ articleKey: "palacinke", quantity: 2 })], 766, over)).toMatchObject({
        ok: true,
        lines: [{ price: { unitPriceRsd: 383, regularPriceRsd: 450, promoApplied: true } }],
        totals: { totalRsd: 766 },
      });
    });

    test("asks the resolver for each line", () => {
      const asked: string[] = [];
      order(twoLines(), 1100, {
        findArticle: (line) => {
          asked.push(`${line.pageKey}/${line.articleKey}`);
          return findArticle(line);
        },
      });
      expect(asked).toEqual(["pice/kafa", "pice/burger"]);
    });
  });

  describe("a stale order", () => {
    test("an article that is gone", () => {
      expect(order([ref({ articleKey: "nestalo" })], 200)).toEqual({
        ok: false,
        code: "request/cart_stale",
        staleLines: [0],
      });
    });

    test("a selection that is no longer valid (a required add-on, an unknown variant, an unknown add-on)", () => {
      expect(order([ref({ articleKey: "burger" })], 700)).toMatchObject({ code: "request/cart_stale", staleLines: [0] });
      expect(order([ref({ articleKey: "sok", variantKey: "ogromni" })], 700)).toMatchObject({ code: "request/cart_stale", staleLines: [0] });
      expect(order([ref({ articleKey: "sok" })], 700)).toMatchObject({ code: "request/cart_stale", staleLines: [0] });
      expect(order([ref({ addonKeys: ["sir"] })], 700)).toMatchObject({ code: "request/cart_stale", staleLines: [0] });
      expect(order([ref({ articleKey: "dnevna" })], 700)).toMatchObject({ code: "request/cart_stale", staleLines: [0] });
    });

    test("a note on an article that has notes switched off", () => {
      expect(order([ref({ note: "bez secera" })], 200)).toEqual({
        ok: false,
        code: "request/cart_stale",
        staleLines: [0],
      });
    });

    test("lists the indexes of every stale line", () => {
      const lines = [
        ref(),
        ref({ articleKey: "nestalo" }),
        ref({ note: "bez secera" }),
        ref({ articleKey: "burger" }),
        ref({ articleKey: "sok", variantKey: "mali" }),
      ];
      expect(order(lines, 0)).toEqual({ ok: false, code: "request/cart_stale", staleLines: [1, 2, 3] });
    });

    test("is checked before unavailable", () => {
      const result = order([ref(), ref({ articleKey: "nestalo" })], 200, { unavailable: new Set(["kafa"]) });
      expect(result).toEqual({ ok: false, code: "request/cart_stale", staleLines: [1] });
    });

    test("is checked before a changed price", () => {
      const result = order([ref(), ref({ articleKey: "nestalo" })], 9999);
      expect(result).toMatchObject({ code: "request/cart_stale" });
    });
  });

  describe("an unavailable article", () => {
    test("refuses the order and names the article", () => {
      expect(order(twoLines(), 1100, { unavailable: new Set(["burger"]) })).toEqual({
        ok: false,
        code: "request/cart_unavailable",
        unavailableKeys: ["burger"],
      });
    });

    test("lists each unavailable key once, in the order of the lines", () => {
      const lines = [ref({ quantity: 1 }), ref({ articleKey: "burger", addonKeys: ["pomfrit"] }), ref({ quantity: 2 }), ref({ articleKey: "sok", variantKey: "mali" })];
      const result = order(lines, 0, { unavailable: new Set(["burger", "kafa"]) });
      expect(result).toEqual({ ok: false, code: "request/cart_unavailable", unavailableKeys: ["kafa", "burger"] });
    });

    test("an unavailable key that is not in the order changes nothing", () => {
      expect(order(twoLines(), 1100, { unavailable: new Set(["palacinke"]) })).toMatchObject({ ok: true });
    });

    test("is checked before a changed price", () => {
      expect(order(twoLines(), 1, { unavailable: new Set(["kafa"]) })).toMatchObject({
        code: "request/cart_unavailable",
        unavailableKeys: ["kafa"],
      });
    });
  });

  describe("a changed price", () => {
    test("asks for a confirmation with today's prices per line and the new totals", () => {
      expect(order(twoLines(), 1000)).toEqual({
        ok: false,
        code: "request/cart_price_changed",
        prices: [
          { index: 0, pieceRsd: 200, lineTotalRsd: 400 },
          { index: 1, pieceRsd: 700, lineTotalRsd: 700 },
        ],
        totals: { subtotalRsd: 1100, deliveryFeeRsd: 0, totalRsd: 1100 },
      });
    });

    test("a seen total that is higher than today's is a change too", () => {
      expect(order(twoLines(), 1200)).toMatchObject({ code: "request/cart_price_changed", totals: { totalRsd: 1100 } });
    });

    test("a promotion that ended since the guest looked changes the price", () => {
      const catalog = new Map<string, CartArticle>([["palacinke", promoted(PALACINKE, percent(15, { endsAt: NOW - 1 }))]]);
      const result = order([ref({ articleKey: "palacinke" })], 383, { findArticle: (line) => catalog.get(line.articleKey) ?? null });
      expect(result).toMatchObject({
        code: "request/cart_price_changed",
        prices: [{ index: 0, pieceRsd: 450, lineTotalRsd: 450 }],
        totals: { totalRsd: 450 },
      });
    });
  });

  describe("Room service", () => {
    const rs = (seenTotalRsd: number, deliveryFeeRsd: number | null = 150, over: Over = {}) =>
      order(
        [ref({ pageKey: null, quantity: 2 }), ref({ pageKey: null, articleKey: "burger", addonKeys: ["pomfrit"] })],
        seenTotalRsd,
        { channel: "room_service", deliveryFeeRsd, ...over },
      );

    test("the seen total must include the delivery fee once", () => {
      expect(rs(1250)).toMatchObject({
        ok: true,
        totals: { subtotalRsd: 1100, deliveryFeeRsd: 150, totalRsd: 1250 },
      });
    });

    test("a seen total without the fee is a changed price, with the fee in the new totals", () => {
      expect(rs(1100)).toEqual({
        ok: false,
        code: "request/cart_price_changed",
        prices: [
          { index: 0, pieceRsd: 200, lineTotalRsd: 400 },
          { index: 1, pieceRsd: 700, lineTotalRsd: 700 },
        ],
        totals: { subtotalRsd: 1100, deliveryFeeRsd: 150, totalRsd: 1250 },
      });
    });

    test("a fee counted once per line is not the total", () => {
      expect(rs(1400)).toMatchObject({ code: "request/cart_price_changed", totals: { totalRsd: 1250 } });
    });

    test("a venue without a fee charges none", () => {
      expect(rs(1100, null)).toMatchObject({ ok: true, totals: { deliveryFeeRsd: 0, totalRsd: 1100 } });
    });

    test("the standard channel never adds the fee, even when one is given", () => {
      expect(order(twoLines(), 1100, { deliveryFeeRsd: 150 })).toMatchObject({
        ok: true,
        totals: { deliveryFeeRsd: 0, totalRsd: 1100 },
      });
    });

    test("an active promotion is ignored: the guest pays the Room service price as published", () => {
      const catalog = new Map<string, CartArticle>([["palacinke", promoted(PALACINKE, percent(15))]]);
      const over: Over = { channel: "room_service", deliveryFeeRsd: 100, findArticle: (line) => catalog.get(line.articleKey) ?? null };
      const lines = [ref({ pageKey: null, articleKey: "palacinke", quantity: 2 })];
      expect(order(lines, 1000, over)).toMatchObject({
        ok: true,
        lines: [{ price: { unitPriceRsd: 450, promoApplied: false } }],
        totals: { subtotalRsd: 900, deliveryFeeRsd: 100, totalRsd: 1000 },
      });
    });
  });
});

describe("the send key of an order (K21 hardening: a lost answer never makes a second order)", () => {
  const linija = (articleKey: string, quantity = 1): OrderLineInput => ({
    pageKey: "pg_glavna00000",
    articleKey,
    variantKey: null,
    addonKeys: [],
    quantity,
    note: null,
  });

  test("isOrderAttemptKey: 8–64 characters of letters, digits, _ and -", () => {
    expect(isOrderAttemptKey("AbC_12-x")).toBe(true);
    expect(isOrderAttemptKey("a".repeat(64))).toBe(true);
    for (const value of ["", "kratak7", "a".repeat(65), "ima razmak", "ćevapi12", 12345678, null, undefined]) {
      expect(isOrderAttemptKey(value), String(value)).toBe(false);
    }
  });

  test("orderFingerprint: the same cart gives the same fingerprint, any change a different one", () => {
    const korpa = [linija("ar_cevapi00000", 2), linija("ar_limunada000")];
    expect(orderFingerprint(korpa)).toBe(orderFingerprint([linija("ar_cevapi00000", 2), linija("ar_limunada000")]));
    expect(orderFingerprint(korpa)).not.toBe(orderFingerprint([linija("ar_cevapi00000", 3), linija("ar_limunada000")]));
    expect(orderFingerprint(korpa)).not.toBe(orderFingerprint([linija("ar_cevapi00000", 2)]));
    // It fits a send key: `<random>-<fingerprint>` stays within 64 characters.
    expect(isOrderAttemptKey(`abcdefghijklmnop-${orderFingerprint(korpa)}`)).toBe(true);
  });
});
