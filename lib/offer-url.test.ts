import { describe, expect, test } from "vitest";
import { encodeSelection, parseSelection } from "./offer-url";
import type { OrderSelection } from "./scanme-pricing";

describe("encode/parse round-trip", () => {
  const cases: Array<[string, OrderSelection]> = [
    [
      "custom dizajn, više stavki",
      {
        service: "review",
        tier: "premium",
        period: "annual",
        products: [
          { productId: "nalepnica", materialId: "pvc", quantity: 3 },
          { productId: "stalak", materialId: "metal", quantity: 1 },
        ],
        design: { kind: "custom", addOwnLogo: true },
      },
    ],
    [
      "template dizajn, bez logoa",
      {
        service: "links",
        tier: "starter",
        period: "monthly",
        products: [{ productId: "privezak", materialId: "drvo", quantity: 10 }],
        design: { kind: "template", templateId: "editorial-1", addOwnLogo: false },
      },
    ],
    [
      "bez proizvoda",
      {
        service: "links",
        tier: "premium",
        period: "annual",
        products: [],
        design: { kind: "template", templateId: "minimal", addOwnLogo: true },
      },
    ],
  ];

  test.each(cases)("%s", (_label, selection) => {
    const parsed = parseSelection(encodeSelection(selection));
    expect(parsed).toEqual(selection);
  });
});

describe("parseSelection odbija nevalidan query", () => {
  test.each([
    ["nepoznata usluga", "service=foo&tier=starter&period=annual&design=custom&logo=0"],
    ["enterprise nije public tier", "service=review&tier=enterprise&period=annual&design=custom&logo=0"],
    ["nepoznat period", "service=review&tier=starter&period=weekly&design=custom&logo=0"],
    ["nepostojeći proizvod", "service=review&tier=starter&period=annual&items=nema:pvc:1&design=custom&logo=0"],
    ["nepostojeći materijal", "service=review&tier=starter&period=annual&items=nalepnica:zlato:1&design=custom&logo=0"],
    ["tiraž nula", "service=review&tier=starter&period=annual&items=nalepnica:pvc:0&design=custom&logo=0"],
    ["tiraž nije ceo broj", "service=review&tier=starter&period=annual&items=nalepnica:pvc:1.5&design=custom&logo=0"],
    ["prazan template id", "service=review&tier=starter&period=annual&design=template:&logo=0"],
    ["nepoznat design", "service=review&tier=starter&period=annual&design=nesto&logo=0"],
    ["logo van 0/1", "service=review&tier=starter&period=annual&design=custom&logo=2"],
    ["nedostaje design", "service=review&tier=starter&period=annual&logo=0"],
    ["nedostaje logo", "service=review&tier=starter&period=annual&design=custom"],
  ])("%s -> null", (_label, query) => {
    expect(parseSelection(new URLSearchParams(query))).toBeNull();
  });
});
