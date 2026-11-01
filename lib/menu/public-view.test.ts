// ScanMe Menu V1 (K13) — the pure view logic of the public menu: anchors,
// media choice per layout, price and promotion at a moment, badges, detail,
// category cards. No DOM, no clock: every moment is a number passed in.

import { describe, expect, test } from "vitest";
import type { MenuPromo } from "./promo";
import type { MenuLayout } from "./presentation";
import {
  MENU_OPIS_U_REDU,
  akcijaAktivna,
  brojArtikala,
  cenaPrikaz,
  imaDetalj,
  izborMedija,
  kategorije,
  kategorijaIzHesa,
  kolicinaTekst,
  oznakeArtikla,
  putStranice,
  sidroArtikla,
  sidroKategorije,
  sidroSekcije,
  sledecaKategorija,
  type PublicImage,
} from "./public-view";
import type { PublicAddonGroup, PublicArticle, PublicSection } from "./snapshot";

const START = 1_000_000;
const END = 2_000_000;
const INSIDE = 1_500_000;

function article(over: Partial<PublicArticle> = {}): PublicArticle {
  return {
    key: "ar_test00000001",
    kind: "item",
    name: "Kafa",
    description: null,
    quantityValue: null,
    quantityUnit: null,
    priceRsd: 400,
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

function section(key: string, articles: PublicArticle[], over: Partial<PublicSection> = {}): PublicSection {
  return { key, name: `Sekcija ${key}`, description: null, iconKey: null, articles, ...over };
}

const image = (name: string): PublicImage => ({
  thumbUrl: `https://img.test/${name}-thumb.webp`,
  url: `https://img.test/${name}.webp`,
  width: 800,
  height: 600,
});

const pricePromo = (priceRsd: number, over: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "price",
  priceRsd,
  ...over,
});

const percentPromo = (percent: number, over: Partial<MenuPromo> = {}): MenuPromo => ({
  active: true,
  mode: "percent",
  percent,
  ...over,
});

const addonGroup: PublicAddonGroup = {
  key: "ag_test00000001",
  name: "Dodaci",
  selection: "multiple",
  required: false,
  minSelect: 0,
  maxSelect: 2,
  options: [{ key: "ao_test00000001", name: "Šlag", priceDeltaRsd: 40 }],
};

describe("anchors", () => {
  test("anchors are stable for the same key", () => {
    expect(sidroSekcije("sc_abc")).toBe(sidroSekcije("sc_abc"));
    expect(sidroKategorije("sc_abc")).toBe(sidroKategorije("sc_abc"));
    expect(sidroArtikla("ar_abc")).toBe(sidroArtikla("ar_abc"));
  });

  test("anchors carry the s-, k- and a- prefixes", () => {
    expect(sidroSekcije("sc_abc")).toBe("s-sc_abc");
    expect(sidroKategorije("sc_abc")).toBe("k-sc_abc");
    expect(sidroArtikla("ar_abc")).toBe("a-ar_abc");
  });

  test("different keys give different anchors", () => {
    const keys = ["sc_aaaaaaaaaaaa", "sc_aaaaaaaaaaab", "sc_baaaaaaaaaa", "ar_aaaaaaaaaaaa"];
    for (const make of [sidroSekcije, sidroKategorije, sidroArtikla]) {
      expect(new Set(keys.map(make)).size).toBe(keys.length);
    }
  });

  test("the same key gets a different anchor per kind", () => {
    const anchors = [sidroSekcije("x1"), sidroKategorije("x1"), sidroArtikla("x1")];
    expect(new Set(anchors).size).toBe(3);
  });

  test("unsafe characters become a hyphen, safe ones stay", () => {
    expect(sidroSekcije("a b/c.d")).toBe("s-a-b-c-d");
    expect(sidroArtikla("čaj#1")).toBe("a--aj-1");
    expect(sidroKategorije("Ab_9-z")).toBe("k-Ab_9-z");
    for (const anchor of [sidroSekcije("<x y>"), sidroArtikla("a&b=c?d")]) {
      expect(anchor).toMatch(/^[ska]-[A-Za-z0-9_-]+$/);
    }
  });
});

describe("kategorijaIzHesa", () => {
  const sekcije = [section("sc_one", []), section("sc_two", []), section("sc.odd key", [])];

  test("finds a category by #k-… and by k-… without the hash", () => {
    expect(kategorijaIzHesa("#k-sc_two", sekcije)).toBe("sc_two");
    expect(kategorijaIzHesa("k-sc_two", sekcije)).toBe("sc_two");
  });

  test("returns the original key when the anchor replaced unsafe characters", () => {
    expect(kategorijaIzHesa(`#${sidroKategorije("sc.odd key")}`, sekcije)).toBe("sc.odd key");
  });

  test("returns null for an unknown category", () => {
    expect(kategorijaIzHesa("#k-sc_missing", sekcije)).toBeNull();
    expect(kategorijaIzHesa("#k-sc_two", [])).toBeNull();
  });

  test("returns null for other prefixes and empty input", () => {
    expect(kategorijaIzHesa("#s-sc_two", sekcije)).toBeNull();
    expect(kategorijaIzHesa("#a-sc_two", sekcije)).toBeNull();
    expect(kategorijaIzHesa("#sc_two", sekcije)).toBeNull();
    expect(kategorijaIzHesa("", sekcije)).toBeNull();
    expect(kategorijaIzHesa("#", sekcije)).toBeNull();
  });
});

describe("izborMedija", () => {
  const slike = { m1: image("m1") };
  const modes = {
    image: { mode: "image", imageMediaId: "m1", iconKey: "coffee" },
    icon: { mode: "icon", imageMediaId: null, iconKey: "coffee" },
    none: { mode: "none", imageMediaId: null, iconKey: null },
  } as const;

  test.each(["image", "icon", "none"] as const)("compact layout never shows media (mode %s)", (mode) => {
    expect(izborMedija({ media: modes[mode] }, "compact", slike)).toEqual({ vrsta: "bez" });
  });

  test.each(["flow", "categories"] as const satisfies readonly MenuLayout[])(
    "%s layout: mode none shows nothing",
    (layout) => {
      expect(izborMedija({ media: modes.none }, layout, slike)).toEqual({ vrsta: "bez" });
    },
  );

  test.each(["flow", "categories"] as const satisfies readonly MenuLayout[])(
    "%s layout: a resolved image shows the image",
    (layout) => {
      expect(izborMedija({ media: modes.image }, layout, slike)).toEqual({ vrsta: "slika", slika: slike.m1 });
    },
  );

  test("an image without imageMediaId falls back to the icon", () => {
    const media = { mode: "image", imageMediaId: null, iconKey: "wine" } as const;
    expect(izborMedija({ media }, "flow", slike)).toEqual({ vrsta: "ikonica", iconKey: "wine" });
  });

  test("an image missing from the resolved map falls back to the icon", () => {
    const media = { mode: "image", imageMediaId: "m404", iconKey: "wine" } as const;
    expect(izborMedija({ media }, "categories", slike)).toEqual({ vrsta: "ikonica", iconKey: "wine" });
    expect(izborMedija({ media }, "flow", {})).toEqual({ vrsta: "ikonica", iconKey: "wine" });
  });

  test("a fallback icon without a key gives iconKey null (the default glyph)", () => {
    const media = { mode: "image", imageMediaId: "m404", iconKey: null } as const;
    expect(izborMedija({ media }, "flow", slike)).toEqual({ vrsta: "ikonica", iconKey: null });
  });

  test("icon mode shows the icon, even when an image is resolvable", () => {
    expect(izborMedija({ media: modes.icon }, "flow", slike)).toEqual({ vrsta: "ikonica", iconKey: "coffee" });
    const both = { mode: "icon", imageMediaId: "m1", iconKey: "coffee" } as const;
    expect(izborMedija({ media: both }, "flow", slike)).toEqual({ vrsta: "ikonica", iconKey: "coffee" });
  });

  test("icon mode without a key gives iconKey null", () => {
    const media = { mode: "icon", imageMediaId: null, iconKey: null } as const;
    expect(izborMedija({ media }, "categories", slike)).toEqual({ vrsta: "ikonica", iconKey: null });
  });

  describe("section icon fallback (rezervnaIkonica)", () => {
    const noKey = { mode: "icon", imageMediaId: null, iconKey: null } as const;
    const withKey = { mode: "icon", imageMediaId: null, iconKey: "coffee" } as const;

    test("an icon-mode article without its own key takes the section icon", () => {
      expect(izborMedija({ media: noKey }, "flow", slike, "wine")).toEqual({ vrsta: "ikonica", iconKey: "wine" });
      expect(izborMedija({ media: noKey }, "categories", slike, "wine")).toEqual({
        vrsta: "ikonica",
        iconKey: "wine",
      });
    });

    test("the article's own key wins over the section icon", () => {
      expect(izborMedija({ media: withKey }, "flow", slike, "wine")).toEqual({ vrsta: "ikonica", iconKey: "coffee" });
    });

    test("an unresolved image without its own key takes the section icon", () => {
      const media = { mode: "image", imageMediaId: "m404", iconKey: null } as const;
      expect(izborMedija({ media }, "flow", slike, "wine")).toEqual({ vrsta: "ikonica", iconKey: "wine" });
      const noId = { mode: "image", imageMediaId: null, iconKey: null } as const;
      expect(izborMedija({ media: noId }, "flow", slike, "wine")).toEqual({ vrsta: "ikonica", iconKey: "wine" });
    });

    test("an unresolved image with its own key keeps that key", () => {
      const media = { mode: "image", imageMediaId: "m404", iconKey: "coffee" } as const;
      expect(izborMedija({ media }, "flow", slike, "wine")).toEqual({ vrsta: "ikonica", iconKey: "coffee" });
    });

    test("without a section icon the default glyph shows (iconKey null)", () => {
      expect(izborMedija({ media: noKey }, "flow", slike)).toEqual({ vrsta: "ikonica", iconKey: null });
      expect(izborMedija({ media: noKey }, "flow", slike, null)).toEqual({ vrsta: "ikonica", iconKey: null });
    });

    test("the section icon never replaces an image, nothing, or the compact layout", () => {
      expect(izborMedija({ media: modes.image }, "flow", slike, "wine")).toEqual({ vrsta: "slika", slika: slike.m1 });
      expect(izborMedija({ media: modes.none }, "flow", slike, "wine")).toEqual({ vrsta: "bez" });
      expect(izborMedija({ media: noKey }, "compact", slike, "wine")).toEqual({ vrsta: "bez" });
    });
  });
});

describe("cenaPrikaz", () => {
  test("a base price without a promotion", () => {
    expect(cenaPrikaz(article({ priceRsd: 400 }), INSIDE)).toEqual({
      vrsta: "osnovna",
      rsd: 400,
      akcijska: null,
    });
  });

  test("variants give one line per variant, in order", () => {
    const result = cenaPrikaz(
      article({
        priceRsd: null,
        variants: [
          { key: "va_b", name: "0,3 l", priceRsd: 280 },
          { key: "va_a", name: "0,2 l", priceRsd: 200 },
        ],
      }),
      INSIDE,
    );
    expect(result).toEqual({
      vrsta: "varijante",
      stavke: [
        { key: "va_b", naziv: "0,3 l", rsd: 280, akcijska: null },
        { key: "va_a", naziv: "0,2 l", rsd: 200, akcijska: null },
      ],
    });
  });

  test("variants win over a base price", () => {
    const result = cenaPrikaz(
      article({ priceRsd: 999, variants: [{ key: "va_a", name: "Mala", priceRsd: 200 }] }),
      INSIDE,
    );
    expect(result.vrsta).toBe("varijante");
  });

  test("no price and no variants shows no price", () => {
    expect(cenaPrikaz(article({ priceRsd: null }), INSIDE)).toEqual({ vrsta: "bez" });
  });

  test("a running price promotion gives a lower promotional price", () => {
    const result = cenaPrikaz(article({ priceRsd: 400, promo: pricePromo(300) }), INSIDE);
    expect(result).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
    if (result.vrsta === "osnovna") expect(result.akcijska as number).toBeLessThan(result.rsd);
  });

  test("a running percent promotion rounds to whole dinars, half up", () => {
    // 450 - 15 % = 382,5 -> 383
    expect(cenaPrikaz(article({ priceRsd: 450, promo: percentPromo(15) }), INSIDE)).toEqual({
      vrsta: "osnovna",
      rsd: 450,
      akcijska: 383,
    });
  });

  test("a percent promotion applies to every variant", () => {
    const result = cenaPrikaz(
      article({
        priceRsd: null,
        variants: [
          { key: "va_a", name: "Mala", priceRsd: 200 },
          { key: "va_b", name: "Velika", priceRsd: 300 },
        ],
        promo: percentPromo(10),
      }),
      INSIDE,
    );
    expect(result).toEqual({
      vrsta: "varijante",
      stavke: [
        { key: "va_a", naziv: "Mala", rsd: 200, akcijska: 180 },
        { key: "va_b", naziv: "Velika", rsd: 300, akcijska: 270 },
      ],
    });
  });

  test("a price promotion cannot apply to variants: the regular prices show", () => {
    const result = cenaPrikaz(
      article({
        priceRsd: 400,
        variants: [{ key: "va_a", name: "Mala", priceRsd: 200 }],
        promo: pricePromo(150),
      }),
      INSIDE,
    );
    expect(result).toEqual({
      vrsta: "varijante",
      stavke: [{ key: "va_a", naziv: "Mala", rsd: 200, akcijska: null }],
    });
  });

  test("a promotion that is not lower than the regular price is ignored", () => {
    const result = cenaPrikaz(article({ priceRsd: 400, promo: pricePromo(400) }), INSIDE);
    expect(result).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("before startsAt the regular price shows", () => {
    const promo = pricePromo(300, { startsAt: START, endsAt: END });
    expect(cenaPrikaz(article({ promo }), START - 1)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("at startsAt the promotion runs", () => {
    const promo = pricePromo(300, { startsAt: START, endsAt: END });
    expect(cenaPrikaz(article({ promo }), START)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
  });

  test("at endsAt and after it the regular price comes back", () => {
    const promo = pricePromo(300, { startsAt: START, endsAt: END });
    expect(cenaPrikaz(article({ promo }), END - 1)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: 300 });
    expect(cenaPrikaz(article({ promo }), END)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
    expect(cenaPrikaz(article({ promo }), END + 1)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("a switched-off promotion gives the regular price", () => {
    const promo = pricePromo(300, { active: false });
    expect(cenaPrikaz(article({ promo }), INSIDE)).toEqual({ vrsta: "osnovna", rsd: 400, akcijska: null });
  });

  test("an ended or scheduled percent promotion leaves variants at the regular price", () => {
    const variants = [{ key: "va_a", name: "Mala", priceRsd: 200 }];
    const promo = percentPromo(50, { startsAt: START, endsAt: END });
    for (const now of [START - 1, END]) {
      const result = cenaPrikaz(article({ priceRsd: null, variants, promo }), now);
      expect(result).toEqual({
        vrsta: "varijante",
        stavke: [{ key: "va_a", naziv: "Mala", rsd: 200, akcijska: null }],
      });
    }
  });
});

describe("akcijaAktivna", () => {
  const scheduled = article({ promo: pricePromo(300, { startsAt: START, endsAt: END }) });

  test("no promotion is never active", () => {
    expect(akcijaAktivna(article({ promo: null }), INSIDE)).toBe(false);
  });

  test("the start instant is active, one ms before it is not", () => {
    expect(akcijaAktivna(scheduled, START)).toBe(true);
    expect(akcijaAktivna(scheduled, START - 1)).toBe(false);
  });

  test("the end instant is not active, one ms before it is", () => {
    expect(akcijaAktivna(scheduled, END)).toBe(false);
    expect(akcijaAktivna(scheduled, END - 1)).toBe(true);
  });

  test("an unscheduled promotion runs at any time while switched on", () => {
    const open = article({ promo: pricePromo(300) });
    expect(akcijaAktivna(open, 0)).toBe(true);
    expect(akcijaAktivna(open, END * 1000)).toBe(true);
  });

  test("a promotion with only an end stops at that end", () => {
    const untilEnd = article({ promo: pricePromo(300, { endsAt: END }) });
    expect(akcijaAktivna(untilEnd, 0)).toBe(true);
    expect(akcijaAktivna(untilEnd, END)).toBe(false);
  });

  test("a switched-off promotion is not active inside its window", () => {
    const off = article({ promo: pricePromo(300, { active: false, startsAt: START, endsAt: END }) });
    expect(akcijaAktivna(off, INSIDE)).toBe(false);
  });
});

describe("oznakeArtikla", () => {
  test("no tags and no promotion gives no badges", () => {
    expect(oznakeArtikla(article(), INSIDE)).toEqual([]);
  });

  test("tags keep their order", () => {
    expect(oznakeArtikla(article({ tags: ["spicy", "vegan", "new"] }), INSIDE)).toEqual([
      { vrsta: "oznaka", kod: "spicy" },
      { vrsta: "oznaka", kod: "vegan" },
      { vrsta: "oznaka", kod: "new" },
    ]);
  });

  test("an active promotion labelled promo comes first", () => {
    const promo = pricePromo(300, { label: "promo" });
    expect(oznakeArtikla(article({ promo, tags: ["vegan"] }), INSIDE)).toEqual([
      { vrsta: "akcija" },
      { vrsta: "oznaka", kod: "vegan" },
    ]);
  });

  test("a promo label does not swallow a recommended tag", () => {
    const promo = pricePromo(300, { label: "promo" });
    expect(oznakeArtikla(article({ promo, tags: ["recommended"] }), INSIDE)).toEqual([
      { vrsta: "akcija" },
      { vrsta: "oznaka", kod: "recommended" },
    ]);
  });

  test("recommended as promo label and as tag shows once", () => {
    const promo = pricePromo(300, { label: "recommended" });
    const badges = oznakeArtikla(article({ promo, tags: ["recommended", "new"] }), INSIDE);
    expect(badges).toEqual([
      { vrsta: "oznaka", kod: "recommended" },
      { vrsta: "oznaka", kod: "new" },
    ]);
    expect(badges.filter((badge) => badge.vrsta === "oznaka" && badge.kod === "recommended")).toHaveLength(1);
  });

  test("a recommended promo label alone gives the recommended badge", () => {
    const promo = percentPromo(10, { label: "recommended" });
    expect(oznakeArtikla(article({ promo }), INSIDE)).toEqual([{ vrsta: "oznaka", kod: "recommended" }]);
  });

  test("an inactive promotion adds no badge", () => {
    const off = pricePromo(300, { label: "promo", active: false });
    expect(oznakeArtikla(article({ promo: off, tags: ["vegan"] }), INSIDE)).toEqual([
      { vrsta: "oznaka", kod: "vegan" },
    ]);
  });

  test("a scheduled or ended promotion adds no badge", () => {
    const promo = pricePromo(300, { label: "promo", startsAt: START, endsAt: END });
    expect(oznakeArtikla(article({ promo }), START - 1)).toEqual([]);
    expect(oznakeArtikla(article({ promo }), END)).toEqual([]);
    expect(oznakeArtikla(article({ promo }), START)).toEqual([{ vrsta: "akcija" }]);
  });

  test("a promotion without a label adds no badge", () => {
    expect(oznakeArtikla(article({ promo: pricePromo(300) }), INSIDE)).toEqual([]);
  });

  test("a duplicate tag is shown once", () => {
    expect(oznakeArtikla(article({ tags: ["vegan", "vegan"] }), INSIDE)).toEqual([
      { vrsta: "oznaka", kod: "vegan" },
    ]);
  });
});

describe("imaDetalj", () => {
  const longText = "x".repeat(MENU_OPIS_U_REDU + 1);
  const comboArticle = { components: [{ articleKey: "ar_part", name: "Kafa", quantity: 1 }] };

  test.each(["flow", "categories"] as const)("%s layout always opens the detail", (layout) => {
    expect(imaDetalj(article(), layout, false)).toBe(true);
  });

  test("compact layout has no detail for a plain article", () => {
    expect(imaDetalj(article(), "compact", false)).toBe(false);
    expect(imaDetalj(article({ description: "Kratak opis" }), "compact", false)).toBe(false);
  });

  test("compact layout has a detail with add-on groups", () => {
    expect(imaDetalj(article({ addonGroups: [addonGroup] }), "compact", false)).toBe(true);
  });

  test("compact layout has a detail for a combo with components only", () => {
    expect(imaDetalj(article({ kind: "combo", combo: comboArticle }), "compact", false)).toBe(true);
    expect(imaDetalj(article({ kind: "combo", combo: { components: [] } }), "compact", false)).toBe(false);
  });

  test("compact layout has a detail when allergens are on", () => {
    expect(imaDetalj(article(), "compact", true)).toBe(true);
  });

  test("compact layout has a detail for a description longer than a row holds", () => {
    expect(imaDetalj(article({ description: longText }), "compact", false)).toBe(true);
    expect(imaDetalj(article({ description: "x".repeat(MENU_OPIS_U_REDU) }), "compact", false)).toBe(false);
  });
});

describe("kolicinaTekst", () => {
  test("formats the quantity with a decimal comma", () => {
    expect(kolicinaTekst({ quantityValue: 0.33, quantityUnit: "l" })).toBe("0,33 l");
  });

  test("keeps a whole quantity as it is", () => {
    expect(kolicinaTekst({ quantityValue: 250, quantityUnit: "g" })).toBe("250 g");
  });

  test("is null when the value or the unit is missing", () => {
    expect(kolicinaTekst({ quantityValue: null, quantityUnit: "l" })).toBeNull();
    expect(kolicinaTekst({ quantityValue: 0.5, quantityUnit: null })).toBeNull();
    expect(kolicinaTekst({ quantityValue: 0.5, quantityUnit: "" })).toBeNull();
    expect(kolicinaTekst({ quantityValue: null, quantityUnit: null })).toBeNull();
  });
});

describe("kategorije", () => {
  const slike = { m1: image("m1"), m2: image("m2") };
  const iconArticle = (key: string, iconKey: string | null) =>
    article({ key, media: { mode: "icon", imageMediaId: null, iconKey } });
  const imageArticle = (key: string, imageMediaId: string | null) =>
    article({ key, media: { mode: "image", imageMediaId, iconKey: null } });

  test("skips sections without articles and keeps page order", () => {
    const cards = kategorije(
      [section("sc_a", [article({ key: "a1" })]), section("sc_empty", []), section("sc_b", [article({ key: "b1" })])],
      slike,
    );
    expect(cards.map((card) => card.key)).toEqual(["sc_a", "sc_b"]);
  });

  test("counts the articles and passes name and description through", () => {
    const [card] = kategorije(
      [
        section("sc_a", [article({ key: "a1" }), article({ key: "a2" }), article({ key: "a3" })], {
          name: "Pića",
          description: "Hladna i topla",
        }),
      ],
      slike,
    );
    expect(card).toMatchObject({ key: "sc_a", naziv: "Pića", opis: "Hladna i topla", broj: 3 });
  });

  test("takes the first resolved image of the section", () => {
    const [card] = kategorije(
      [section("sc_a", [iconArticle("a1", "coffee"), imageArticle("a2", "m2"), imageArticle("a3", "m1")])],
      slike,
    );
    expect(card.slika).toEqual(slike.m2);
  });

  test("skips an unresolved image and takes the next resolved one", () => {
    const [card] = kategorije([section("sc_a", [imageArticle("a1", "m404"), imageArticle("a2", "m1")])], slike);
    expect(card.slika).toEqual(slike.m1);
  });

  test("has no image when the section has none", () => {
    const [card] = kategorije([section("sc_a", [iconArticle("a1", "coffee"), imageArticle("a2", null)])], slike);
    expect(card.slika).toBeNull();
  });

  test("the section icon wins over article icons", () => {
    const [card] = kategorije(
      [section("sc_a", [iconArticle("a1", "beer")], { iconKey: "wine" })],
      slike,
    );
    expect(card.iconKey).toBe("wine");
  });

  test("falls back to the first icon-mode article's icon", () => {
    const [card] = kategorije(
      [section("sc_a", [article({ key: "a0" }), iconArticle("a1", "beer"), iconArticle("a2", "wine")])],
      slike,
    );
    expect(card.iconKey).toBe("beer");
  });

  test("an icon key on an article that does not show icons is ignored", () => {
    const leftover = article({ key: "a1", media: { mode: "none", imageMediaId: null, iconKey: "beer" } });
    const [card] = kategorije([section("sc_a", [leftover])], slike);
    expect(card.iconKey).toBeNull();
  });

  test("has no icon when neither section nor articles give one", () => {
    const [card] = kategorije([section("sc_a", [article({ key: "a1" })])], slike);
    expect(card.iconKey).toBeNull();
  });

  test("an empty list of sections gives no cards", () => {
    expect(kategorije([], slike)).toEqual([]);
  });
});

describe("sledecaKategorija", () => {
  const first = section("sc_a", [article({ key: "a1" })]);
  const empty = section("sc_empty", []);
  const last = section("sc_c", [article({ key: "c1" })]);
  const sekcije = [first, empty, last];

  test("returns the next section that has articles", () => {
    expect(sledecaKategorija(sekcije, "sc_a")).toBe(last);
  });

  test("returns null on the last category", () => {
    expect(sledecaKategorija(sekcije, "sc_c")).toBeNull();
  });

  test("returns null for an unknown key or a section without articles", () => {
    expect(sledecaKategorija(sekcije, "sc_missing")).toBeNull();
    expect(sledecaKategorija(sekcije, "sc_empty")).toBeNull();
    expect(sledecaKategorija([], "sc_a")).toBeNull();
  });
});

describe("putStranice", () => {
  const home = { slug: "kompletan-meni" };
  const drinks = { slug: "pica" };

  test("a one-page menu is the menu link itself", () => {
    expect(putStranice("lokal", home, [home])).toBe("/lokal/meni");
  });

  test("a menu with several pages links each page by its slug", () => {
    expect(putStranice("lokal", drinks, [home, drinks])).toBe("/lokal/meni/pica");
    expect(putStranice("lokal", home, [home, drinks])).toBe("/lokal/meni/kompletan-meni");
  });

  test("an empty page list is treated like a one-page menu", () => {
    expect(putStranice("lokal", home, [])).toBe("/lokal/meni");
  });
});

describe("brojArtikala", () => {
  test("sums the articles of every section", () => {
    const sekcije = [
      section("sc_a", [article({ key: "a1" }), article({ key: "a2" })]),
      section("sc_b", []),
      section("sc_c", [article({ key: "c1" })]),
    ];
    expect(brojArtikala(sekcije)).toBe(3);
  });

  test("is 0 without sections", () => {
    expect(brojArtikala([])).toBe(0);
  });
});
