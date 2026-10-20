// K21 — the Room service part of a published version as the public renderer
// reads it (lib/menu/room-service-view.ts): a category becomes a section, an
// article keeps what it shares with the menu and carries the Room service
// price, the build-time `priceOrigin` never reaches the guest, and a promotion
// of the standard menu never applies. Invented data only.

import { describe, expect, test } from "vitest";
import { ROOM_SERVICE_PAGE_KEY, roomServicePage, roomServiceSections } from "./room-service-view";
import { MENU_PART_ROOM_SERVICE, type PublicRoomServiceArticle, type PublicRoomServiceDoc } from "./snapshot";

function artikal(over: Partial<PublicRoomServiceArticle> = {}): PublicRoomServiceArticle {
  return {
    key: "ar_probni",
    kind: "item",
    name: "Probno jelo",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 690,
    priceOrigin: "computed",
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

const GRUPA_DODATAKA = {
  key: "ag_probna",
  name: "Grupa dodataka",
  selection: "multiple" as const,
  required: false,
  minSelect: 0,
  maxSelect: 2,
  options: [
    { key: "ao_1", name: "Dodatak A", priceDeltaRsd: 0 },
    { key: "ao_2", name: "Dodatak B", priceDeltaRsd: 60 },
  ],
};

function dokument(): PublicRoomServiceDoc {
  return {
    deliveryFeeRsd: 300,
    categories: [
      {
        key: "kat_prva",
        name: "Prva kategorija",
        articles: [
          // Computed price, a promotion of the standard menu on top, variants with their own origins.
          artikal({
            key: "ar_sa_varijantama",
            name: "Jelo sa varijantama",
            description: "Opis probnog jela.",
            priceRsd: null,
            priceOrigin: "inherited",
            variants: [
              { key: "va_mala", name: "Mala", priceRsd: 810, priceOrigin: "computed" },
              { key: "va_velika", name: "Velika", priceRsd: 1150, priceOrigin: "manual" },
            ],
            addonGroups: [GRUPA_DODATAKA],
            noteEnabled: true,
            tags: ["vegan"],
            promo: { active: true, mode: "price", priceRsd: 500 },
          }),
          artikal({ key: "ar_ruchno", name: "Ručno određena cena", priceRsd: 950, priceOrigin: "manual" }),
        ],
      },
      { key: "kat_prazna", name: "Prazna kategorija", articles: [] },
      {
        key: "kat_druga",
        name: "Druga kategorija",
        articles: [
          artikal({
            key: "ar_sa_akcijom",
            name: "Jelo sa akcijom",
            priceRsd: 400,
            promo: { active: true, mode: "percent", percent: 20 },
          }),
        ],
      },
    ],
  };
}

describe("roomServiceSections", () => {
  test("a category becomes a section, in order; an empty category is dropped", () => {
    const sekcije = roomServiceSections(dokument());
    expect(sekcije.map((sekcija) => sekcija.key)).toEqual(["kat_prva", "kat_druga"]);
    expect(sekcije.map((sekcija) => sekcija.name)).toEqual(["Prva kategorija", "Druga kategorija"]);
    expect(sekcije.map((sekcija) => sekcija.articles.map((article) => article.key))).toEqual([
      ["ar_sa_varijantama", "ar_ruchno"],
      ["ar_sa_akcijom"],
    ]);
    for (const sekcija of sekcije) {
      expect(sekcija.description).toBeNull();
      expect(sekcija.iconKey).toBeNull();
    }
  });

  test("no categories, or only empty ones, give no sections", () => {
    expect(roomServiceSections({ deliveryFeeRsd: null, categories: [] })).toEqual([]);
    expect(
      roomServiceSections({ deliveryFeeRsd: 300, categories: [{ key: "kat_prazna", name: "Prazna", articles: [] }] }),
    ).toEqual([]);
  });

  test("the Room service prices are kept: the article's and every variant's", () => {
    const [prva, druga] = roomServiceSections(dokument());
    const [saVarijantama, rucno] = prva.articles;
    expect(saVarijantama.priceRsd).toBeNull();
    expect(saVarijantama.variants).toEqual([
      { key: "va_mala", name: "Mala", priceRsd: 810 },
      { key: "va_velika", name: "Velika", priceRsd: 1150 },
    ]);
    expect(rucno.priceRsd).toBe(950);
    expect(druga.articles[0].priceRsd).toBe(400);
  });

  test("priceOrigin is a build-time detail: it is on no article and no variant", () => {
    const izvor = dokument();
    // The source really carries it (so the check below proves something).
    expect(JSON.stringify(izvor)).toContain("priceOrigin");
    const sekcije = roomServiceSections(izvor);
    expect(JSON.stringify(sekcije)).not.toContain("priceOrigin");
    for (const sekcija of sekcije) {
      for (const article of sekcija.articles) {
        expect(Object.keys(article)).not.toContain("priceOrigin");
        for (const variant of article.variants) expect(Object.keys(variant).sort()).toEqual(["key", "name", "priceRsd"]);
      }
    }
  });

  test("a promotion of the standard menu is dropped, even when the source article carries one", () => {
    const izvor = dokument();
    const izvorniArtikli = izvor.categories.flatMap((kategorija) => kategorija.articles);
    expect(izvorniArtikli.filter((article) => article.promo !== null)).toHaveLength(2);
    const artikli = roomServiceSections(izvor).flatMap((sekcija) => sekcija.articles);
    expect(artikli).toHaveLength(3);
    for (const article of artikli) expect(article.promo).toBeNull();
  });

  test("everything shared with the menu is kept as it is", () => {
    const [prva] = roomServiceSections(dokument());
    expect(prva.articles[0]).toEqual({
      key: "ar_sa_varijantama",
      kind: "item",
      name: "Jelo sa varijantama",
      description: "Opis probnog jela.",
      quantityValue: null,
      quantityUnit: null,
      priceRsd: null,
      variants: [
        { key: "va_mala", name: "Mala", priceRsd: 810 },
        { key: "va_velika", name: "Velika", priceRsd: 1150 },
      ],
      addonGroups: [GRUPA_DODATAKA],
      noteEnabled: true,
      media: { mode: "none", imageMediaId: null, iconKey: null },
      allergens: null,
      tags: ["vegan"],
      promo: null,
      combo: null,
    });
  });

  test("the source document is not changed", () => {
    const izvor = dokument();
    const pre = JSON.stringify(izvor);
    roomServiceSections(izvor);
    expect(JSON.stringify(izvor)).toBe(pre);
  });
});

describe("roomServicePage", () => {
  test("a standalone page with the pseudo key _rs, the room-service path and the given title", () => {
    expect(roomServicePage("Room service")).toEqual({
      key: "_rs",
      slug: "room-service",
      title: "Room service",
      isDefault: false,
      navigation: "standalone",
      iconKey: null,
    });
    expect(ROOM_SERVICE_PAGE_KEY).toBe("_rs");
    // The page key is the version part Room service is stored under.
    expect(ROOM_SERVICE_PAGE_KEY).toBe(MENU_PART_ROOM_SERVICE);
  });

  test("the title is whatever the caller localized", () => {
    expect(roomServicePage("Probni naslov").title).toBe("Probni naslov");
    expect(roomServicePage("Probni naslov").slug).toBe("room-service");
  });
});
