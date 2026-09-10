import { describe, expect, test } from "vitest";
import {
  encodePurchaseSelection,
  encodeSelection,
  parsePurchaseSelection,
  parseSelection,
  type PurchaseSelection,
} from "./offer-url";
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

// ---------------------------------------------------------------------------
// V5 purchase codec (RFC-002 §2.3, TASK-33). The four-step flow's state is a
// DIFFERENT shape — a set of the five services + an account plan — carried by
// its own encode/parse pair. The V1–V4 discipline above must stay intact: a
// link someone already shared keeps parsing through `parseSelection`.
// ---------------------------------------------------------------------------

describe("v1–v4 links still parse after v5 lands (frozen wire, RFC-002 §2.8)", () => {
  const FROZEN: ReadonlyArray<{ version: string; query: string }> = [
    {
      version: "1",
      query:
        "?v=1&service=review&tier=starter&period=annual&design=custom&logo=1&items=nalepnica%3A%3A5",
    },
    {
      version: "2",
      query:
        "?v=2&service=links&tier=premium&period=annual&items=%5B%7B%22productId%22%3A%22two-piece-stand%22%2C%22quantity%22%3A3%2C%22design%22%3A%7B%22kind%22%3A%22custom%22%2C%22brief%22%3A%22%22%7D%2C%22orientation%22%3A%22landscape%22%2C%22dimension%22%3A%22a4%22%7D%5D",
    },
    {
      version: "3",
      query:
        "?v=3&service=review&tier=starter&period=monthly&items=%5B%7B%22productId%22%3A%22two-piece-stand%22%2C%22quantity%22%3A2%2C%22design%22%3A%7B%22kind%22%3A%22template%22%2C%22templateId%22%3A%22template-1%22%7D%2C%22orientation%22%3A%22portrait%22%2C%22dimension%22%3A%22a5%22%7D%5D",
    },
    {
      version: "4",
      query:
        "?v=4&service=links&tier=premium&period=annual&items=%5B%7B%22productId%22%3A%22two-piece-stand%22%2C%22quantity%22%3A2%2C%22design%22%3A%7B%22kind%22%3A%22template%22%2C%22templateId%22%3A%22template-1%22%7D%2C%22orientation%22%3A%22portrait%22%2C%22dimension%22%3A%22a5%22%7D%5D",
    },
  ];

  for (const { version, query } of FROZEN) {
    test(`a frozen v${version} link parses to a valid OrderSelection`, () => {
      const parsed = parseSelection(new URLSearchParams(query));
      expect(parsed, `v${version} must not fail to parse`).not.toBeNull();
      expect(parsed!.products.length).toBeGreaterThan(0);
    });
  }

  test("the v5 parser rejects every old version, and parseSelection rejects v5", () => {
    for (const { query } of FROZEN) {
      expect(parsePurchaseSelection(new URLSearchParams(query))).toBeNull();
    }
    const v5 = encodePurchaseSelection({
      services: [{ service: "venue", period: "annual" }],
      plan: "basic",
      products: [],
      step: 1,
    });
    expect(parseSelection(new URLSearchParams(v5.toString()))).toBeNull();
  });
});

describe("v5 purchase codec round-trips", () => {
  const SELECTIONS: ReadonlyArray<{ name: string; selection: PurchaseSelection }> = [
    {
      name: "empty cart on step 1, basic plan",
      selection: { services: [], plan: "basic", products: [], step: 1 },
    },
    {
      name: "two services, premium annual, one product",
      selection: {
        services: [
          { service: "venue", period: "annual" },
          { service: "memories", period: "annual" },
        ],
        plan: "premium",
        planPeriod: "annual",
        products: [createDefaultProductSelection("two-piece-stand")],
        step: 3,
      },
    },
    {
      name: "mixed periods, enterprise plan, logo, step 2",
      selection: {
        services: [
          { service: "links", period: "monthly" },
          { service: "review", period: "annual" },
          { service: "menu", period: "monthly" },
        ],
        plan: "enterprise",
        products: [],
        logoUploadId: "logo-session-abc123",
        step: 2,
      },
    },
    {
      name: "all five services, premium monthly, step 4, two products",
      selection: {
        services: [
          { service: "links", period: "monthly" },
          { service: "venue", period: "monthly" },
          { service: "memories", period: "monthly" },
          { service: "menu", period: "monthly" },
          { service: "review", period: "monthly" },
        ],
        plan: "premium",
        planPeriod: "monthly",
        products: [
          createDefaultProductSelection("stickers"),
          createDefaultProductSelection("compact-stand"),
        ],
        step: 4,
      },
    },
    {
      name: "per-line service bindings, one single and one splitter (TASK-36)",
      selection: {
        services: [
          { service: "links", period: "annual" },
          { service: "venue", period: "annual" },
          { service: "memories", period: "annual" },
        ],
        plan: "basic",
        products: [
          createDefaultProductSelection("stickers"),
          createDefaultProductSelection("two-piece-stand"),
        ],
        bindings: {
          stickers: ["venue", "memories"], // splitter card
          "two-piece-stand": ["links"], // single-service card
        },
        step: 3,
      },
    },
  ];

  for (const { name, selection } of SELECTIONS) {
    test(name, () => {
      const encoded = encodePurchaseSelection(selection);
      expect(encoded.get("v")).toBe("5");
      const reparsed = parsePurchaseSelection(new URLSearchParams(encoded.toString()));
      expect(reparsed).toEqual(selection);
    });
  }
});

describe("v5 strict validation rejects malformed state", () => {
  const base: PurchaseSelection = {
    services: [{ service: "venue", period: "annual" }],
    plan: "premium",
    planPeriod: "annual",
    products: [createDefaultProductSelection("two-piece-stand")],
    step: 3,
  };

  function withParam(mutate: (p: URLSearchParams) => void): URLSearchParams {
    const p = encodePurchaseSelection(base);
    mutate(p);
    return p;
  }

  test.each<[string, (p: URLSearchParams) => void]>([
    ["unknown service", (p) => p.set("services", "venue:annual,ghost:annual")],
    ["unknown period", (p) => p.set("services", "venue:weekly")],
    ["duplicate service", (p) => p.set("services", "venue:annual,venue:monthly")],
    ["malformed chunk (missing period)", (p) => p.set("services", "venue")],
    ["unknown plan", (p) => p.set("plan", "gold")],
    [
      "premium without planPeriod",
      (p) => {
        p.set("plan", "premium");
        p.delete("planPeriod");
      },
    ],
    [
      "basic with forbidden planPeriod",
      (p) => {
        p.set("plan", "basic");
        p.set("planPeriod", "annual");
      },
    ],
    ["step out of range", (p) => p.set("step", "5")],
    ["non-integer step", (p) => p.set("step", "2.5")],
    ["malformed product line", (p) => p.set("items", '[{"productId":"ghost"}]')],
    ["missing items param", (p) => p.delete("items")],
    ["binding to unknown product", (p) => p.set("bind", "ghost:venue")],
    ["binding to unknown service", (p) => p.set("bind", "stickers:ghost")],
    ["binding chunk missing services", (p) => p.set("bind", "stickers")],
    ["binding with empty service list", (p) => p.set("bind", "stickers:")],
    ["binding repeats a service", (p) => p.set("bind", "stickers:venue|venue")],
    ["binding repeats a product", (p) => p.set("bind", "stickers:venue,stickers:links")],
    ["empty bind param", (p) => p.set("bind", "")],
  ])("%s -> null", (_name, mutate) => {
    expect(parsePurchaseSelection(withParam(mutate))).toBeNull();
  });
});
