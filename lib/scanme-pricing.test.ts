import { describe, expect, test } from "vitest";
import {
  PHYSICAL_PRODUCTS,
  applyQuantityDelta,
  cheapestUnitPrice,
  computeCardPrice,
  computeOrderBreakdown,
  createDefaultProductSelection,
  formatRsd,
  saasFirstTermPrice,
  productUnitPrice,
  quantityDiscountRate,
  quantityFromInput,
  roundRsd,
  type OrderSelection,
} from "./scanme-pricing";

describe("formatiranje i tiraž", () => {
  test.each([
    [0, "0"],
    [1000, "1.000"],
    [11990, "11.990"],
    [1234567, "1.234.567"],
  ])("formatira %i -> %s", (value, expected) => {
    expect(formatRsd(value)).toBe(expected);
  });

  test.each([
    [1, -5, 1],
    [1, -1, 1],
    [6, -5, 1],
    [2, -1, 1],
    [1, 1, 2],
    [1, 5, 6],
  ] as const)("%i uz promenu %i daje %i", (quantity, delta, expected) => {
    expect(applyQuantityDelta(quantity, delta)).toBe(expected);
  });

  test.each([
    ["25", 25],
    ["3 kom", 3],
    ["", 1],
    ["0", 1],
  ])("direktan unos %s daje %i", (raw, expected) => {
    expect(quantityFromInput(raw)).toBe(expected);
  });
});

describe("količinski popust", () => {
  test.each([
    [1, 0],
    [2, 0.08],
    [5, 0.17],
    [10, 0.25],
    [20, 0.3],
    [100, 0.3],
  ])("tiraž %i -> stopa %d", (quantity, expected) => {
    expect(quantityDiscountRate(quantity)).toBe(expected);
  });

  test("više proizvoda dobija nezavisne popuste", () => {
    const selection: OrderSelection = {
      service: "links",
      tier: "starter",
      period: "annual",
      products: [
        { ...createDefaultProductSelection("stickers"), quantity: 5 },
        { ...createDefaultProductSelection("premium-engraved-stand"), quantity: 1 },
      ],
    };
    const [stickers, premium] = computeOrderBreakdown(selection).productItems;
    expect(stickers.discountRate).toBe(0.17);
    expect(stickers.lineTotal).toBe(480 * 5 - roundRsd(480 * 5 * 0.17));
    expect(premium.discountRate).toBe(0);
    expect(premium.lineTotal).toBe(1500);
  });
});

describe("katalog i obračun", () => {
  test("nove bazne cene su zaključane u katalogu", () => {
    expect(PHYSICAL_PRODUCTS.map(({ id, baseUnitPrice }) => [id, baseUnitPrice])).toEqual([
      ["stickers", 300],
      ["window-film", 348],
      ["two-piece-stand", 1200],
      ["compact-stand", 660],
      ["premium-engraved-stand", 1500],
    ]);
    expect(cheapestUnitPrice()).toEqual({ unitPrice: 300, productId: "stickers" });
  });

  test("template i logo ne menjaju cenu, custom ostaje bez izmišljene naknade", () => {
    const template = createDefaultProductSelection("two-piece-stand");
    const custom = {
      ...createDefaultProductSelection("stickers"),
      design: { kind: "custom", brief: "Crno-beli raspored." } as const,
    };
    const breakdown = computeOrderBreakdown({
      service: "review",
      tier: "starter",
      period: "monthly",
      products: [template, custom],
      logoUploadId: "logo-id",
    });
    expect(breakdown.oneTimeTotal).toBe(breakdown.productsTotal);
    expect(breakdown.requiresCustomDesignQuote).toBe(true);
    expect(breakdown.totalDueNow).toBe(breakdown.productsTotal + breakdown.saasFirstTerm);
  });

  test("kompaktni stalak koristi cenu iz matrice materijala, boje i formata", () => {
    const white = createDefaultProductSelection("compact-stand");
    const black = { ...white, background: "black" as const, quantity: 2 };
    const breakdown = computeOrderBreakdown({
      service: "review",
      tier: "starter",
      period: "monthly",
      products: [black],
    });
    const [item] = breakdown.productItems;

    expect(item.baseUnitPrice).toBe(660);
    expect(item.optionSurcharge).toBe(0);
    expect(item.unitPrice).toBe(1140);
    expect(item.discountRate).toBe(0.08);
    expect(item.lineTotal).toBe(2098);
    expect(
      computeOrderBreakdown({
        service: "review",
        tier: "starter",
        period: "monthly",
        products: [white],
      }).productItems[0].unitPrice,
    ).toBe(900);
  });

  test.each([
    ["plastic", "white", "a6", 660],
    ["plastic", "black", "a5", 1140],
    ["acrylic", "white", "a4", 2028],
    ["acrylic", "transparent", "a6", 1020],
    ["metal", "white", "a5", 1668],
    ["metal", "black", "a4", 2868],
  ] as const)("%s/%s/%s -> %i RSD sa PDV-om", (material, background, dimension, price) => {
    expect(
      productUnitPrice({
        ...createDefaultProductSelection("compact-stand"),
        material,
        background,
        dimension,
      }),
    ).toBe(price);
  });

  test.each([
    ["rectangle", "small", 300],
    ["square", "medium", 480],
    ["circle", "large", 840],
  ] as const)("muflon %s/%s -> %i RSD sa PDV-om", (shape, dimension, price) => {
    expect(
      productUnitPrice({ ...createDefaultProductSelection("stickers"), shape, dimension }),
    ).toBe(price);
  });

  test.each([
    ["white", "small", 348],
    ["white", "large", 1548],
    ["transparent", "medium", 900],
  ] as const)("PVC %s/%s -> %i RSD sa PDV-om", (background, dimension, price) => {
    expect(
      productUnitPrice({
        ...createDefaultProductSelection("window-film"),
        background,
        dimension,
      }),
    ).toBe(price);
  });

  test("svaki proizvod dobija samo svoje podrazumevane opcije", () => {
    expect(createDefaultProductSelection("stickers")).toMatchObject({
      shape: "square",
      dimension: "medium",
    });
    expect(createDefaultProductSelection("window-film")).toMatchObject({
      background: "transparent",
      finish: "matte",
      dimension: "medium",
    });
    expect(createDefaultProductSelection("compact-stand")).toMatchObject({
      background: "white",
      material: "plastic",
      dimension: "a5",
    });
    expect(createDefaultProductSelection("premium-engraved-stand")).toMatchObject({
      shape: "rectangle",
      woodType: "oak",
      dimension: "medium",
    });
  });

  test("konfiguracija jednog proizvoda ne menja ostale", () => {
    const first = createDefaultProductSelection("two-piece-stand");
    const second = createDefaultProductSelection("compact-stand");
    const products = [
      { ...first, dimension: "a4" as const, quantity: 8 },
      second,
    ];
    expect(products[1]).toEqual(createDefaultProductSelection("compact-stand"));
  });

  test("pretplata dolazi iz motora — jedan izvor cene (RFC-002 §2.1)", () => {
    const base: OrderSelection = {
      service: "review",
      tier: "premium",
      period: "annual",
      products: [createDefaultProductSelection()],
    };
    const annual = saasFirstTermPrice("review", "premium", "annual");
    expect(computeOrderBreakdown(base).saasFirstTerm).toBe(annual);
    expect(computeOrderBreakdown({ ...base, period: "monthly" }).saasFirstTerm).toBe(
      saasFirstTermPrice("review", "premium", "monthly"),
    );
    expect(computeCardPrice("review", "premium", "annual").renewalAmount).toBe(
      roundRsd(annual / 12),
    );
    // The two paid tiers are the account-plan axis now (RFC-002 §2.2): Premium
    // adds the plan line over the same per-service price, so it is strictly
    // dearer than Starter (the free Basic plan).
    expect(saasFirstTermPrice("review", "premium", "monthly")).toBeGreaterThan(
      saasFirstTermPrice("review", "starter", "monthly"),
    );
  });
});
