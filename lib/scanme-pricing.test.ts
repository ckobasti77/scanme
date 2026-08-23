import { describe, expect, test } from "vitest";
import {
  CUSTOM_DESIGN_FEE,
  cheapestUnitPrice,
  computeCardPrice,
  computeOrderBreakdown,
  formatRsd,
  getSaasPrice,
  quantityDiscountRate,
  roundRsd,
  type OrderSelection,
} from "./scanme-pricing";

describe("formatRsd", () => {
  test.each([
    [0, "0"],
    [990, "990"],
    [1000, "1.000"],
    [11990, "11.990"],
    [490, "490"],
    [1234567, "1.234.567"],
  ])("formatira %i -> %s", (value, expected) => {
    expect(formatRsd(value)).toBe(expected);
  });
});

describe("roundRsd", () => {
  test.each([
    [440, 440],
    [415.83, 416],
    [415.5, 416], // pola naviše
    [415.49, 415],
    [0.5, 1],
  ])("zaokružuje %d -> %i", (value, expected) => {
    expect(roundRsd(value)).toBe(expected);
  });
});

describe("quantityDiscountRate", () => {
  test.each([
    [1, 0],
    [2, 0.08],
    [4, 0.08],
    [5, 0.17],
    [9, 0.17],
    [10, 0.25],
    [19, 0.25],
    [20, 0.3],
    [100, 0.3],
  ])("tiraž %i -> stopa %d", (qty, expected) => {
    expect(quantityDiscountRate(qty)).toBe(expected);
  });
});

describe("computeCardPrice", () => {
  const cheapest = cheapestUnitPrice().unitPrice;

  test("annual: mesečni ekvivalent prve godine i mesečna obnova", () => {
    const saas = getSaasPrice("review", "starter");
    const card = computeCardPrice("review", "starter", "annual");
    expect(card.fromAmount).toBe(roundRsd((cheapest + saas.annual) / 12));
    expect(card.renewalAmount).toBe(roundRsd(saas.annual / 12));
  });

  test("monthly: prvi mesec i mesečna obnova", () => {
    const saas = getSaasPrice("links", "premium");
    const card = computeCardPrice("links", "premium", "monthly");
    expect(card.fromAmount).toBe(cheapest + saas.monthly);
    expect(card.renewalAmount).toBe(saas.monthly);
  });
});

describe("computeOrderBreakdown", () => {
  const templateDesign = { kind: "template", templateId: "editorial-1", addOwnLogo: false } as const;

  test("annual vs monthly: saasFirstTerm i period obnove", () => {
    const base: OrderSelection = {
      service: "review",
      tier: "premium",
      period: "annual",
      products: [{ productId: "nalepnica", materialId: "pvc", quantity: 1 }],
      design: templateDesign,
    };
    const saas = getSaasPrice("review", "premium");

    const annual = computeOrderBreakdown(base);
    expect(annual.saasFirstTerm).toBe(saas.annual);
    expect(annual.renewal.period).toBe("annual");
    expect(annual.renewal.amount).toBe(saas.annual);
    expect(annual.renewal.monthlyEquivalent).toBe(roundRsd(saas.annual / 12));

    const monthly = computeOrderBreakdown({ ...base, period: "monthly" });
    expect(monthly.saasFirstTerm).toBe(saas.monthly);
    expect(monthly.renewal.period).toBe("monthly");
    expect(monthly.renewal.amount).toBe(saas.monthly);
    expect(monthly.renewal.monthlyEquivalent).toBe(saas.monthly);
  });

  test("više vrsta sa različitim tiražima: svaka linija diskontovana nezavisno", () => {
    const selection: OrderSelection = {
      service: "links",
      tier: "starter",
      period: "annual",
      products: [
        { productId: "nalepnica", materialId: "pvc", quantity: 5 }, // 290 * 5, -17%
        { productId: "stalak", materialId: "metal", quantity: 1 }, // 2200 * 1, 0%
      ],
      design: templateDesign,
    };

    const breakdown = computeOrderBreakdown(selection);
    const [sticker, stand] = breakdown.productItems;

    expect(sticker.discountRate).toBe(0.17);
    expect(sticker.lineSubtotal).toBe(290 * 5);
    expect(sticker.lineDiscount).toBe(roundRsd(290 * 5 * 0.17));
    expect(sticker.lineTotal).toBe(290 * 5 - roundRsd(290 * 5 * 0.17));

    expect(stand.discountRate).toBe(0);
    expect(stand.lineTotal).toBe(2200);

    expect(breakdown.productsTotal).toBe(sticker.lineTotal + stand.lineTotal);
  });

  test("custom dizajn se naplaćuje TAČNO jednom bez obzira na broj stavki", () => {
    const selection: OrderSelection = {
      service: "review",
      tier: "starter",
      period: "monthly",
      products: [
        { productId: "nalepnica", materialId: "pvc", quantity: 12 },
        { productId: "privezak", materialId: "metal", quantity: 3 },
        { productId: "stalak", materialId: "akril", quantity: 7 },
      ],
      design: { kind: "custom", addOwnLogo: true },
    };

    const breakdown = computeOrderBreakdown(selection);
    expect(breakdown.designFee).toBe(CUSTOM_DESIGN_FEE);
    expect(breakdown.oneTimeTotal).toBe(breakdown.productsTotal + CUSTOM_DESIGN_FEE);
  });

  test("template dizajn nema naknadu", () => {
    const breakdown = computeOrderBreakdown({
      service: "links",
      tier: "premium",
      period: "annual",
      products: [{ productId: "nalepnica", materialId: "pvc", quantity: 2 }],
      design: templateDesign,
    });
    expect(breakdown.designFee).toBe(0);
  });

  test("obnova sadrži SAMO SaaS (fizičko i dizajn isključeni)", () => {
    const saas = getSaasPrice("links", "premium");
    const breakdown = computeOrderBreakdown({
      service: "links",
      tier: "premium",
      period: "annual",
      products: [{ productId: "metalna-plocica", materialId: "bakar", quantity: 20 }],
      design: { kind: "custom", addOwnLogo: false },
    });
    expect(breakdown.renewal.amount).toBe(saas.annual);
    expect(breakdown.renewal.monthlyEquivalent).toBe(roundRsd(saas.annual / 12));
  });

  test("mesečni ekvivalent sa razlomkom se zaokružuje na ceo dinar", () => {
    // review.starter.annual = 4990; 4990/12 = 415.83... -> 416
    const breakdown = computeOrderBreakdown({
      service: "review",
      tier: "starter",
      period: "annual",
      products: [],
      design: templateDesign,
    });
    expect(Number.isInteger(breakdown.renewal.monthlyEquivalent)).toBe(true);
    expect(breakdown.renewal.monthlyEquivalent).toBe(416);
  });
});
