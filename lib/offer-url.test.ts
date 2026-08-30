import { describe, expect, test } from "vitest";
import { encodeSelection, parseSelection } from "./offer-url";
import { createDefaultProductSelection, type OrderSelection } from "./scanme-pricing";

describe("v2 URL round-trip", () => {
  test("nosi više proizvoda, template/custom, SaaS i logo upload", () => {
    const selection: OrderSelection = {
      service: "links",
      tier: "premium",
      period: "monthly",
      products: [
        {
          ...createDefaultProductSelection("stickers"),
          quantity: 8,
          shape: "circle",
          dimension: "large",
          design: { kind: "template", templateId: "template-4" },
        },
        {
          ...createDefaultProductSelection("two-piece-stand"),
          quantity: 2,
          design: { kind: "custom", brief: "Tamna varijanta sa većim naslovom." },
        },
      ],
      logoUploadId: "j57examplelogo",
    };
    expect(parseSelection(encodeSelection(selection))).toEqual(selection);
  });

  test("nosi PVC završnicu, kompaktnu pozadinu i materijal i premium tip drveta", () => {
    const selection: OrderSelection = {
      service: "review",
      tier: "starter",
      period: "annual",
      products: [
        {
          ...createDefaultProductSelection("window-film"),
          background: "white",
          finish: "gloss",
          dimension: "small",
        },
        {
          ...createDefaultProductSelection("compact-stand"),
          background: "black",
          material: "metal",
        },
        {
          ...createDefaultProductSelection("premium-engraved-stand"),
          shape: "circle",
          woodType: "walnut",
          dimension: "large",
        },
      ],
    };
    expect(parseSelection(encodeSelection(selection))).toEqual(selection);
  });

  test("radi bez logoa i bez proizvoda", () => {
    const selection: OrderSelection = {
      service: "review",
      tier: "starter",
      period: "annual",
      products: [],
    };
    expect(parseSelection(encodeSelection(selection))).toEqual(selection);
  });
});

describe("v1 kompatibilnost", () => {
  test("stari URL se parsira u bezbedne nove default opcije", () => {
    const parsed = parseSelection(
      new URLSearchParams(
        "service=review&tier=starter&period=annual&items=nalepnica:pvc:3,stalak:metal:1&design=custom&logo=1",
      ),
    );
    expect(parsed?.products).toEqual([
      {
        ...createDefaultProductSelection("stickers"),
        quantity: 3,
        design: { kind: "custom", brief: "" },
      },
      {
        ...createDefaultProductSelection("premium-engraved-stand"),
        design: { kind: "custom", brief: "" },
      },
    ]);
  });

  test("v2 URL se bezbedno prevodi na nove opcije po proizvodu", () => {
    const legacyV2 = new URLSearchParams({
      v: "2",
      service: "review",
      tier: "starter",
      period: "annual",
      items: JSON.stringify([
        {
          productId: "stickers",
          quantity: 2,
          orientation: "landscape",
          dimension: "a4",
          design: { kind: "template", templateId: "template-1" },
        },
        {
          productId: "two-piece-stand",
          quantity: 1,
          orientation: "landscape",
          dimension: "a4",
          design: { kind: "template", templateId: "template-2" },
        },
      ]),
    });
    expect(parseSelection(legacyV2)?.products).toEqual([
      { ...createDefaultProductSelection("stickers"), quantity: 2 },
      {
        ...createDefaultProductSelection("two-piece-stand"),
        orientation: "landscape",
        dimension: "a4",
        design: { kind: "template", templateId: "template-2" },
      },
    ]);
  });

  test("postojeći v3 kompaktni stalak bez materijala dobija plastiku", () => {
    const compact = createDefaultProductSelection("compact-stand");
    const legacyCompact = { ...compact, material: undefined };
    const legacyV3 = new URLSearchParams({
      v: "3",
      service: "review",
      tier: "starter",
      period: "annual",
      items: JSON.stringify([legacyCompact]),
    });
    expect(parseSelection(legacyV3)?.products[0]).toMatchObject({
      productId: "compact-stand",
      material: "plastic",
    });
  });
});

describe("nevalidni parametri", () => {
  test.each([
    "service=foo&tier=starter&period=annual&design=custom&logo=0",
    "service=review&tier=enterprise&period=annual&design=custom&logo=0",
    "v=2&service=review&tier=starter&period=annual&items=not-json",
    `v=2&service=review&tier=starter&period=annual&items=${encodeURIComponent(
      JSON.stringify([
        {
          productId: "stickers",
          quantity: 0,
          orientation: "portrait",
          dimension: "a5",
          design: { kind: "template", templateId: "template-1" },
        },
      ]),
    )}`,
    "service=review&tier=starter&period=annual&items=nema:pvc:1&design=custom&logo=0",
  ])("%s -> null", (query) => {
    expect(parseSelection(new URLSearchParams(query))).toBeNull();
  });
});
