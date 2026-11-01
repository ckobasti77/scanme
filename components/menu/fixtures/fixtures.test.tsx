// Izlog fixtures: the invented data must be valid (real menu keys, a snapshot
// that passes the publication check), deterministic, internally consistent
// (request totals, floor plan) and free of anything that looks private.

import { describe, expect, test } from "vitest";
import { MENU_ALLERGEN_CODES } from "@/lib/menu/allergens";
import { isMenuKey, type MenuKeyKind } from "@/lib/menu/keys";
import { checkPublication } from "@/lib/menu/publish-checks";
import { MENU_TAG_CODES, normalizeTags } from "@/lib/menu/tags";
import {
  createRng,
  fixtureKey,
  fixtureMenu,
  fixtureRequests,
  fixtureReservations,
  fixtureTeam,
  fixtureVenue,
  IZLOG_MENU_SIZES,
  IZLOG_SADA,
  type IzlogMenuSize,
  type IzlogVenue,
} from "./index";

// Built dynamically so this test file itself stays clean under a raw
// substring scan for the other products' namespaces.
const VENUE_NS = ["--", "venue", "-"].join("");
const LINKS_NS = ["--", "links", "-"].join("");

const VENUE_KINDS = ["cafe", "restaurant", "hotel"] as const;
const FIFTEEN_MINUTES = 15 * 60_000;

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`missing: ${what}`);
  return value;
}

function allUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function checkContext(size: IzlogMenuSize) {
  return {
    roomServiceSwitch: size === "veliki",
    capabilities: { roomService: true, scheduledPromos: true, maxLanguages: 10 },
  };
}

// -----------------------------------------------------------------------------
// The seeded PRNG
// -----------------------------------------------------------------------------

describe("createRng / fixtureKey", () => {
  test("the same seed gives the same sequence, another seed a different one", () => {
    const first = createRng(7);
    const second = createRng(7);
    const other = createRng(8);
    const a = Array.from({ length: 20 }, () => first.next());
    const b = Array.from({ length: 20 }, () => second.next());
    const c = Array.from({ length: 20 }, () => other.next());
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  test("int is inclusive on both ends and pick stays inside the list", () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let index = 0; index < 400; index += 1) seen.add(rng.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
    const list = ["a", "b", "c"] as const;
    for (let index = 0; index < 50; index += 1) expect(list).toContain(rng.pick(list));
    expect(() => rng.pick([])).toThrow();
  });

  test("fixtureKey gives valid keys of every kind and never repeats", () => {
    const rng = createRng(11);
    const kinds: MenuKeyKind[] = [
      "page",
      "section",
      "article",
      "roomServiceCategory",
      "variant",
      "addonGroup",
      "addonOption",
    ];
    const keys: string[] = [];
    for (let round = 0; round < 300; round += 1) {
      for (const kind of kinds) {
        const key = fixtureKey(kind, rng);
        expect(isMenuKey(key, kind)).toBe(true);
        keys.push(key);
      }
    }
    expect(allUnique(keys)).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// Menus
// -----------------------------------------------------------------------------

describe("fixtureMenu", () => {
  const ARTICLES: Record<IzlogMenuSize, [number, number]> = {
    mali: [18, 22],
    srednji: [75, 85],
    veliki: [390, 410],
  };
  const UNAVAILABLE: Record<IzlogMenuSize, number> = { mali: 1, srednji: 2, veliki: 4 };

  test("the three sizes are named and counted as agreed", () => {
    expect([...IZLOG_MENU_SIZES]).toEqual(["mali", "srednji", "veliki"]);
    const mali = fixtureMenu("mali");
    const srednji = fixtureMenu("srednji");
    const veliki = fixtureMenu("veliki");

    expect([mali.venueName, mali.slug]).toEqual(["Kafana kod Mike", "kafana-kod-mike"]);
    expect([srednji.venueName, srednji.slug]).toEqual(["Demo restoran", "demo-restoran"]);
    expect([veliki.venueName, veliki.slug]).toEqual(["Hotel Primer", "hotel-primer"]);

    for (const size of IZLOG_MENU_SIZES) {
      const menu = fixtureMenu(size);
      const [min, max] = ARTICLES[size];
      expect(menu.size).toBe(size);
      expect(menu.snapshot.articles.length).toBeGreaterThanOrEqual(min);
      expect(menu.snapshot.articles.length).toBeLessThanOrEqual(max);
      expect(menu.unavailableArticleKeys).toHaveLength(UNAVAILABLE[size]);
      const articleKeys = new Set(menu.snapshot.articles.map((article) => article.key));
      for (const key of menu.unavailableArticleKeys) expect(articleKeys.has(key)).toBe(true);
    }

    // The exact sizes of the fixtures as written (the ranges above are the contract).
    expect(mali.snapshot.articles).toHaveLength(20);
    expect(srednji.snapshot.articles).toHaveLength(80);
    expect(veliki.snapshot.articles).toHaveLength(402);

    expect(mali.snapshot.pages).toHaveLength(1);
    expect(mali.snapshot.sections.length).toBeGreaterThanOrEqual(4);
    expect(mali.snapshot.sections.length).toBeLessThanOrEqual(5);
    expect(srednji.snapshot.pages).toHaveLength(2);
    expect(srednji.snapshot.sections.length).toBeGreaterThanOrEqual(8);
    expect(srednji.snapshot.sections.length).toBeLessThanOrEqual(10);
    expect(veliki.snapshot.pages.length).toBeGreaterThanOrEqual(3);
    expect(veliki.snapshot.pages.length).toBeLessThanOrEqual(4);
    expect(veliki.snapshot.sections.length).toBeGreaterThanOrEqual(20);
  });

  for (const size of IZLOG_MENU_SIZES) {
    describe(size, () => {
      const { snapshot } = fixtureMenu(size);

      test("every key is valid for its kind and unique in the fixture", () => {
        const groups: [MenuKeyKind, string[]][] = [
          ["page", snapshot.pages.map((row) => row.key)],
          ["section", snapshot.sections.map((row) => row.key)],
          ["article", snapshot.articles.map((row) => row.key)],
          ["variant", snapshot.variants.map((row) => row.key)],
          ["addonGroup", snapshot.addonGroups.map((row) => row.key)],
          ["addonOption", snapshot.addonOptions.map((row) => row.key)],
          ["roomServiceCategory", snapshot.roomService.categories.map((row) => row.key)],
        ];
        for (const [kind, keys] of groups) {
          for (const key of keys) expect(isMenuKey(key, kind)).toBe(true);
        }
        expect(allUnique(groups.flatMap(([, keys]) => keys))).toBe(true);
        expect(allUnique(snapshot.articles.map((article) => article.name))).toBe(true);
      });

      test("every reference points at an existing row", () => {
        const pages = new Map(snapshot.pages.map((row) => [row.key, row]));
        const sections = new Map(snapshot.sections.map((row) => [row.key, row]));
        const articles = new Map(snapshot.articles.map((row) => [row.key, row]));
        const groups = new Map(snapshot.addonGroups.map((row) => [row.key, row]));
        const categories = new Map(snapshot.roomService.categories.map((row) => [row.key, row]));

        for (const section of snapshot.sections) expect(pages.has(section.pageKey)).toBe(true);
        for (const placement of snapshot.placements) {
          expect(pages.has(placement.pageKey)).toBe(true);
          expect(articles.has(placement.articleKey)).toBe(true);
          expect(must(sections.get(placement.sectionKey), "section").pageKey).toBe(placement.pageKey);
        }
        for (const variant of snapshot.variants) expect(articles.has(variant.articleKey)).toBe(true);
        for (const option of snapshot.addonOptions) expect(groups.has(option.groupKey)).toBe(true);
        for (const link of snapshot.articleAddonGroups) {
          expect(articles.has(link.articleKey)).toBe(true);
          expect(groups.has(link.groupKey)).toBe(true);
        }
        for (const part of snapshot.comboComponents) {
          expect(must(articles.get(part.comboKey), "combo").kind).toBe("combo");
          expect(must(articles.get(part.componentKey), "component").kind).toBe("item");
        }
        for (const item of snapshot.roomService.items) {
          expect(articles.has(item.articleKey)).toBe(true);
          expect(categories.has(item.categoryKey)).toBe(true);
        }
        expect(allUnique(snapshot.roomService.items.map((item) => item.articleKey))).toBe(true);
      });

      test("every article is placed on the default page and flags match their rows", () => {
        const defaultPage = must(snapshot.pages.find((page) => page.isDefault), "default page");
        const placedOnDefault = new Set(
          snapshot.placements
            .filter((placement) => placement.pageKey === defaultPage.key)
            .map((placement) => placement.articleKey),
        );
        for (const article of snapshot.articles) {
          expect(placedOnDefault.has(article.key)).toBe(true);
          const variants = snapshot.variants.filter((row) => row.articleKey === article.key);
          const links = snapshot.articleAddonGroups.filter((row) => row.articleKey === article.key);
          expect(article.variantsEnabled).toBe(variants.length > 0);
          expect(article.addonsEnabled).toBe(links.length > 0);
          if (article.variantsEnabled) expect(article.basePriceRsd).toBeNull();
          expect(article.mediaMode === "icon").toBe(article.iconKey !== null);
          expect(article.imageMediaId).toBeNull();
          expect((article.quantityValue === null) === (article.quantityUnit === null)).toBe(true);
        }
        const pairs = snapshot.placements.map((row) => `${row.pageKey}|${row.articleKey}`);
        expect(allUnique(pairs)).toBe(true);
      });

      test("orders run 0..n-1 inside their parent", () => {
        const contiguous = (orders: number[]) =>
          [...orders].sort((a, b) => a - b).every((order, index) => order === index);
        const by = <T,>(rows: readonly T[], keyOf: (row: T) => string, orderOf: (row: T) => number) => {
          const groups = new Map<string, number[]>();
          for (const row of rows) {
            const list = groups.get(keyOf(row)) ?? [];
            list.push(orderOf(row));
            groups.set(keyOf(row), list);
          }
          return [...groups.values()];
        };
        expect(contiguous(snapshot.pages.map((row) => row.order))).toBe(true);
        for (const orders of by(snapshot.sections, (row) => row.pageKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
        for (const orders of by(snapshot.placements, (row) => row.sectionKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
        for (const orders of by(snapshot.variants, (row) => row.articleKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
        for (const orders of by(snapshot.addonOptions, (row) => row.groupKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
        for (const orders of by(snapshot.articleAddonGroups, (row) => row.articleKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
        for (const orders of by(snapshot.comboComponents, (row) => row.comboKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
        expect(contiguous(snapshot.roomService.categories.map((row) => row.order))).toBe(true);
        for (const orders of by(snapshot.roomService.items, (row) => row.categoryKey, (row) => row.order)) {
          expect(contiguous(orders)).toBe(true);
        }
      });

      test("prices are whole dinars in a realistic range", () => {
        const prices: number[] = [
          ...snapshot.articles.flatMap((article) => (article.basePriceRsd === null ? [] : [article.basePriceRsd])),
          ...snapshot.variants.flatMap((variant) => (variant.priceRsd === null ? [] : [variant.priceRsd])),
          ...snapshot.roomService.items.flatMap((item) =>
            item.manualPriceRsd === null ? [] : [item.manualPriceRsd],
          ),
        ];
        expect(prices.length).toBeGreaterThan(0);
        for (const price of prices) {
          expect(Number.isInteger(price)).toBe(true);
          expect(price).toBeGreaterThanOrEqual(80);
          expect(price).toBeLessThanOrEqual(4500);
        }
        for (const option of snapshot.addonOptions) {
          expect(Number.isInteger(option.priceDeltaRsd)).toBe(true);
          expect(option.priceDeltaRsd).toBeGreaterThanOrEqual(0);
          expect(option.priceDeltaRsd).toBeLessThanOrEqual(100);
        }
      });

      test("the snapshot is complete: no undefined member anywhere", () => {
        expect(JSON.parse(JSON.stringify(snapshot))).toStrictEqual(snapshot);
        expect(snapshot.formatVersion).toBe(1);
        expect(snapshot.presentation).toBeNull();
        for (const article of snapshot.articles) {
          for (const tag of article.tags ?? []) expect(MENU_TAG_CODES).toContain(tag);
          expect(article.tags === null || normalizeTags(article.tags)?.join() === article.tags.join()).toBe(true);
          for (const code of [...(article.allergens?.contains ?? []), ...(article.allergens?.mayContain ?? [])]) {
            expect(MENU_ALLERGEN_CODES).toContain(code);
          }
        }
      });

      test("passes the publication check without errors", () => {
        const check = checkPublication(snapshot, checkContext(size));
        expect(check.errors).toEqual([]);
        expect(check.ok).toBe(true);
        expect(check.warnings.filter((warning) => warning.code === "promo_invalid")).toEqual([]);
        expect(check.roomServicePublished).toBe(size === "veliki");
      });

      test("has exactly one default page: slug glavni, no public title", () => {
        const defaults = snapshot.pages.filter((page) => page.isDefault);
        expect(defaults).toHaveLength(1);
        expect(defaults[0].slug).toBe("glavni");
        expect(defaults[0].publicTitle).toBeNull();
        expect(defaults[0].name).toBe("Kompletan meni");
        const others = snapshot.pages.filter((page) => !page.isDefault);
        expect(allUnique(snapshot.pages.map((page) => page.slug))).toBe(true);
        for (const page of others) expect(page.publicTitle).not.toBeNull();
      });

      test("placements never carry a price", () => {
        for (const placement of snapshot.placements) {
          expect(Object.keys(placement).sort()).toEqual(
            ["articleKey", "order", "pageKey", "sectionKey", "visibility"],
          );
        }
      });
    });
  }

  test("mali is a simple cafe: one article with two variants, mostly no media", () => {
    const { snapshot } = fixtureMenu("mali");
    expect(snapshot.articles.filter((article) => article.variantsEnabled)).toHaveLength(1);
    expect(snapshot.variants).toHaveLength(2);
    const icons = snapshot.articles.filter((article) => article.mediaMode === "icon");
    const none = snapshot.articles.filter((article) => article.mediaMode === "none");
    expect(none.length).toBeGreaterThan(icons.length);
    expect(icons.some((article) => article.iconKey === "kafa")).toBe(true);
    expect(snapshot.articles.filter((article) => article.description !== null).length).toBeGreaterThan(0);
    expect(snapshot.settings).toEqual({ languages: null, allergensEnabled: null });
    expect(snapshot.roomService).toEqual({ config: null, categories: [], items: [] });
  });

  test("srednji has two pages and the wine list shares the wine articles", () => {
    const { snapshot } = fixtureMenu("srednji");
    const [main, wines] = [...snapshot.pages].sort((a, b) => a.order - b.order);
    expect(main.isDefault).toBe(true);
    expect([wines.slug, wines.publicTitle, wines.isDefault]).toEqual(["vinska-karta", "Vinska karta", false]);

    const vranac = must(snapshot.articles.find((article) => article.name === "Vranac"), "Vranac");
    const placed = snapshot.placements.filter((placement) => placement.articleKey === vranac.key);
    expect(placed.map((placement) => placement.pageKey).sort()).toEqual([main.key, wines.key].sort());
    for (const placement of placed) expect(Object.keys(placement)).not.toContain("priceRsd");

    // Every article on the wine page is also on the default page: shared, never copied.
    const onMain = new Set(
      snapshot.placements.filter((row) => row.pageKey === main.key).map((row) => row.articleKey),
    );
    const onWines = snapshot.placements.filter((row) => row.pageKey === wines.key);
    expect(onWines.length).toBeGreaterThan(0);
    for (const placement of onWines) expect(onMain.has(placement.articleKey)).toBe(true);
    expect(snapshot.articles).toHaveLength(80);
  });

  test("srednji covers variants, add-ons, a combo, promos, allergens, tags and a hidden placement", () => {
    const { snapshot } = fixtureMenu("srednji");

    const withVariants = snapshot.articles.filter((article) => article.variantsEnabled);
    expect(withVariants.length).toBeGreaterThanOrEqual(3);
    expect(withVariants.length).toBeLessThanOrEqual(5);

    const linksOf = (groupKey: string) =>
      snapshot.articleAddonGroups.filter((link) => link.groupKey === groupKey).length;
    const singleOptional = snapshot.addonGroups.filter(
      (group) => group.selection === "single" && !group.required,
    );
    expect(singleOptional.some((group) => linksOf(group.key) >= 2)).toBe(true);
    expect(
      snapshot.addonGroups.some((group) => group.selection === "multiple" && group.required),
    ).toBe(true);

    const combos = snapshot.articles.filter((article) => article.kind === "combo");
    expect(combos).toHaveLength(1);
    expect(combos[0].basePriceRsd).not.toBeNull();
    const parts = snapshot.comboComponents.filter((part) => part.comboKey === combos[0].key);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts.length).toBeLessThanOrEqual(3);

    const promos = snapshot.articles.flatMap((article) => (article.promo ? [article.promo] : []));
    expect(promos).toHaveLength(2);
    expect(promos.map((promo) => promo.mode).sort()).toEqual(["percent", "price"]);
    for (const promo of promos) {
      expect(promo.active).toBe(true);
      expect(promo.startsAt).toBeUndefined();
      expect(promo.endsAt).toBeUndefined();
    }

    expect(snapshot.settings.allergensEnabled).toBe(true);
    const recorded = snapshot.articles.filter((article) => article.allergens !== null).length;
    const share = recorded / snapshot.articles.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.7);

    const tagged = snapshot.articles.filter((article) => article.tags !== null);
    expect(tagged.length).toBeGreaterThanOrEqual(3);
    expect(tagged.length).toBeLessThan(snapshot.articles.length / 2);

    expect(snapshot.placements.filter((placement) => placement.visibility === "hidden")).toHaveLength(1);
  });

  test("veliki has four pages, Room service, an English translation and promos", () => {
    const { snapshot } = fixtureMenu("veliki");
    expect(snapshot.pages.map((page) => page.slug)).toEqual(["glavni", "dorucak", "bar", "vinska-karta"]);

    const { config, categories, items } = snapshot.roomService;
    expect(config).toEqual({ markupBps: 1500, markupScope: "all", deliveryFeeRsd: 300 });
    expect(categories).toHaveLength(3);
    expect(items.length).toBeGreaterThanOrEqual(35);
    expect(items.length).toBeLessThanOrEqual(45);
    expect(items.filter((item) => item.manualPriceRsd !== null).length).toBeGreaterThanOrEqual(2);

    expect(snapshot.settings.languages).toEqual({ source: "sr", translations: ["en"] });
    expect(snapshot.settings.allergensEnabled).toBe(true);
    const translated = snapshot.articles.filter((article) => article.translations !== null);
    expect(translated.length).toBeGreaterThanOrEqual(25);
    expect(translated.length).toBeLessThanOrEqual(35);
    for (const article of translated) {
      expect(article.translations?.en?.status).toBe("confirmed");
      expect(article.translations?.en?.name).toBeTruthy();
    }
    expect(snapshot.articles.filter((article) => article.promo !== null).length).toBeGreaterThan(0);
  });

  test("the whole menu is deterministic and every call builds a new object", () => {
    for (const size of IZLOG_MENU_SIZES) {
      const first = fixtureMenu(size);
      const second = fixtureMenu(size);
      expect(second).toEqual(first);
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      expect(second).not.toBe(first);
      expect(second.snapshot.articles).not.toBe(first.snapshot.articles);
      expect(second.snapshot.articles[0]).not.toBe(first.snapshot.articles[0]);
    }
    // Changing one result never leaks into the next call.
    const dirty = fixtureMenu("srednji");
    dirty.snapshot.articles.pop();
    dirty.snapshot.settings.allergensEnabled = false;
    dirty.unavailableArticleKeys.length = 0;
    const clean = fixtureMenu("srednji");
    expect(clean.snapshot.articles).toHaveLength(80);
    expect(clean.snapshot.settings.allergensEnabled).toBe(true);
    expect(clean.unavailableArticleKeys).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------
// Venues
// -----------------------------------------------------------------------------

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("fixtureVenue", () => {
  test("is the restaurant by default", () => {
    expect(fixtureVenue()).toEqual(fixtureVenue("restaurant"));
  });

  test("restaurant: three zones, 15 tables, a bar, occupancy for about ten tables", () => {
    const venue = fixtureVenue("restaurant");
    expect([venue.name, venue.slug, venue.kind, venue.cardCount]).toEqual([
      "Demo restoran",
      "demo-restoran",
      "restaurant",
      18,
    ]);
    expect(venue.zones.map((zone) => zone.name)).toEqual(["Glavna sala", "Terasa", "VIP"]);
    for (const zone of venue.zones) expect(zone.key).toMatch(/^zn_[0-9a-hjkmnp-tv-z]{12}$/);

    const tables = venue.positions.filter((position) => position.kind === "table");
    expect(tables.map((table) => table.label)).toEqual(
      Array.from({ length: 15 }, (_, index) => `Sto ${index + 1}`),
    );
    for (const table of tables) {
      expect(table.seats).toBeGreaterThanOrEqual(2);
      expect(table.seats).toBeLessThanOrEqual(8);
      expect(venue.zones.some((zone) => zone.key === table.zoneKey)).toBe(true);
    }
    const shapes = new Set(tables.map((table) => table.layout?.shape));
    expect(shapes).toEqual(new Set(["rect", "round"]));

    const others = venue.positions.filter((position) => position.kind === "other");
    expect(others.map((position) => position.label)).toEqual(["Šank"]);
    expect(others[0].zoneKey).toBeNull();

    const occupancy = must(venue.occupancy ?? undefined, "occupancy");
    const positionKeys = new Set(venue.positions.map((position) => position.key));
    const entries = Object.entries(occupancy);
    expect(entries.length).toBeGreaterThanOrEqual(8);
    expect(entries.length).toBeLessThanOrEqual(12);
    for (const [key] of entries) expect(positionKeys.has(key)).toBe(true);
    expect(new Set(Object.values(occupancy))).toEqual(
      new Set(["free", "occupied", "reserved", "out_of_service"]),
    );
    expect(entries.length).toBeLessThan(tables.length);
  });

  test("no floor-plan rectangle overlaps another and all sit on the 0-100 x 0-60 grid", () => {
    for (const kind of VENUE_KINDS) {
      const venue = fixtureVenue(kind);
      const rects = venue.positions.flatMap((position) => (position.layout ? [position.layout] : []));
      expect(rects.length).toBeGreaterThan(0);
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(100);
        expect(rect.y + rect.h).toBeLessThanOrEqual(60);
        expect(rect.w).toBeGreaterThan(0);
        expect(rect.h).toBeGreaterThan(0);
        expect(rect.rotation).toBe(0);
      }
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          expect(overlaps(rects[i], rects[j])).toBe(false);
        }
      }
    }
  });

  test("cafe: no zones, eight tables, occupancy module off", () => {
    const venue = fixtureVenue("cafe");
    expect([venue.name, venue.slug, venue.kind, venue.cardCount]).toEqual([
      "Kafana kod Mike",
      "kafana-kod-mike",
      "cafe",
      8,
    ]);
    expect(venue.zones).toEqual([]);
    expect(venue.occupancy).toBeNull();
    expect(venue.positions).toHaveLength(8);
    for (const position of venue.positions) {
      expect(position.kind).toBe("table");
      expect(position.zoneKey).toBeNull();
    }
  });

  test("hotel: two zones, 12 tables and 24 rooms without a plan", () => {
    const venue = fixtureVenue("hotel");
    expect([venue.name, venue.slug, venue.kind, venue.cardCount]).toEqual([
      "Hotel Primer",
      "hotel-primer",
      "hotel",
      40,
    ]);
    expect(venue.zones.map((zone) => zone.name)).toEqual(["Restoran", "Lobi bar"]);
    expect(venue.occupancy).toBeNull();
    expect(venue.positions.filter((position) => position.kind === "table")).toHaveLength(12);
    const rooms = venue.positions.filter((position) => position.kind === "room");
    expect(rooms.map((room) => room.label)).toEqual(
      Array.from({ length: 24 }, (_, index) => `Soba ${101 + index}`),
    );
    for (const room of rooms) {
      expect(room.layout).toBeNull();
      expect(room.seats).toBeNull();
      expect(room.zoneKey).toBeNull();
    }
  });

  test("position keys are unique, stable and shaped ps_<12 base32>; the order runs 0..n-1", () => {
    for (const kind of VENUE_KINDS) {
      const venue = fixtureVenue(kind);
      const keys = venue.positions.map((position) => position.key);
      for (const key of keys) expect(key).toMatch(/^ps_[0-9a-hjkmnp-tv-z]{12}$/);
      expect(allUnique(keys)).toBe(true);
      expect(venue.positions.map((position) => position.order)).toEqual(keys.map((_, index) => index));
      expect(fixtureVenue(kind).positions.map((position) => position.key)).toEqual(keys);
    }
  });
});

// -----------------------------------------------------------------------------
// Requests, reservations, team
// -----------------------------------------------------------------------------

const MENU_OF_VENUE: Record<IzlogVenue["kind"], IzlogMenuSize> = {
  cafe: "mali",
  restaurant: "srednji",
  hotel: "veliki",
};

describe("fixtureRequests", () => {
  for (const kind of VENUE_KINDS) {
    describe(kind, () => {
      const venue = fixtureVenue(kind);
      const requests = fixtureRequests(venue);
      const menu = fixtureMenu(MENU_OF_VENUE[kind]);

      test("about twelve requests with ids rq_01.. on real positions", () => {
        expect(requests).toHaveLength(12);
        expect(requests.map((request) => request.id)).toEqual(
          Array.from({ length: 12 }, (_, index) => `rq_${String(index + 1).padStart(2, "0")}`),
        );
        for (const request of requests) {
          const position = must(
            venue.positions.find((candidate) => candidate.key === request.positionKey),
            "position",
          );
          expect(request.positionLabel).toBe(position.label);
          expect(request.zoneKey).toBe(position.zoneKey);
          expect(request.createdAt).toBeLessThanOrEqual(IZLOG_SADA);
        }
      });

      test("line totals and order totals add up", () => {
        const articleKeys = new Set(menu.snapshot.articles.map((article) => article.key));
        for (const request of requests) {
          if (request.kind !== "order") {
            expect(request.items).toEqual([]);
            expect(request.totalRsd).toBeNull();
            continue;
          }
          expect(request.items.length).toBeGreaterThan(0);
          let sum = 0;
          for (const item of request.items) {
            const addons = item.addons.reduce((total, addon) => total + addon.priceDeltaRsd, 0);
            expect(item.lineTotalRsd).toBe((item.unitPriceRsd + addons) * item.quantity);
            expect(articleKeys.has(item.articleKey)).toBe(true);
            sum += item.lineTotalRsd;
          }
          expect(request.totalRsd).toBe(sum + (request.deliveryFeeRsd ?? 0));
        }
      });

      test("the three fresh requests wait 8:12, 3:10 and 6:10 and the order has a variant and an add-on", () => {
        const byId = (id: string) => must(requests.find((request) => request.id === id), id);
        const call = byId("rq_01");
        expect([call.kind, call.status, call.createdAt]).toEqual(["call", "new", IZLOG_SADA - 492_000]);
        const bill = byId("rq_02");
        expect([bill.kind, bill.status, bill.createdAt, bill.paymentPreference]).toEqual([
          "bill",
          "new",
          IZLOG_SADA - 190_000,
          "card",
        ]);
        const order = byId("rq_03");
        expect([order.kind, order.status, order.createdAt]).toEqual(["order", "new", IZLOG_SADA - 370_000]);
        expect(order.items).toHaveLength(3);
        expect(order.items.some((item) => item.variantName !== null)).toBe(true);
        expect(order.items.some((item) => item.addons.length > 0)).toBe(true);
      });

      test("a table can have two active requests and one new request is older than 15 minutes", () => {
        const active = requests.filter((request) => request.status === "new" || request.status === "accepted");
        const perTable = new Map<string, Set<string>>();
        for (const request of active) {
          const kinds = perTable.get(request.positionKey) ?? new Set<string>();
          kinds.add(request.kind);
          perTable.set(request.positionKey, kinds);
        }
        const doubled = [...perTable.values()].filter((kinds) => kinds.size >= 2);
        expect(doubled.length).toBeGreaterThan(0);
        // A call and an order on the same table.
        expect(doubled.some((kinds) => kinds.has("call") && kinds.has("order"))).toBe(true);

        const stale = requests.filter(
          (request) => request.status === "new" && IZLOG_SADA - request.createdAt > FIFTEEN_MINUTES,
        );
        expect(stale.length).toBeGreaterThan(0);
      });

      test("statuses carry the matching timestamps and a known waiter", () => {
        const staffKeys = new Set(fixtureTeam().staff.map((staff) => staff.key));
        expect(new Set(requests.map((request) => request.status))).toEqual(
          new Set(["new", "accepted", "done", "cancelled"]),
        );
        for (const request of requests) {
          if (request.status === "new") {
            expect(request.acceptedAt).toBeNull();
            expect(request.acceptedByStaffKey).toBeNull();
          }
          if (request.status === "accepted" || request.status === "done") {
            expect(request.acceptedAt).not.toBeNull();
            expect(staffKeys.has(must(request.acceptedByStaffKey ?? undefined, "waiter"))).toBe(true);
            expect(must(request.acceptedAt ?? undefined, "acceptedAt")).toBeGreaterThanOrEqual(request.createdAt);
          }
          if (request.status === "done") {
            expect(must(request.doneAt ?? undefined, "doneAt")).toBeGreaterThanOrEqual(
              must(request.acceptedAt ?? undefined, "acceptedAt"),
            );
          } else {
            expect(request.doneAt).toBeNull();
          }
          if (request.status === "cancelled") {
            expect(request.cancelledBy).not.toBeNull();
            expect(must(request.cancelledAt ?? undefined, "cancelledAt")).toBeGreaterThanOrEqual(
              request.createdAt,
            );
          } else {
            expect(request.cancelledAt).toBeNull();
            expect(request.cancelledBy).toBeNull();
          }
        }
        expect(requests.some((request) => request.cancelledBy === "guest")).toBe(true);
      });

      test("Room service exists only in the hotel, once, with the delivery fee", () => {
        const roomService = requests.filter((request) => request.channel === "room_service");
        if (kind !== "hotel") {
          expect(roomService).toEqual([]);
          for (const request of requests) expect(request.deliveryFeeRsd).toBeNull();
          return;
        }
        expect(roomService).toHaveLength(1);
        const [request] = roomService;
        expect(request.kind).toBe("order");
        expect(request.deliveryFeeRsd).toBe(300);
        expect(request.positionLabel).toMatch(/^Soba 1\d\d$/);
        expect(request.zoneKey).toBeNull();
        const items = request.items.reduce((sum, item) => sum + item.lineTotalRsd, 0);
        expect(request.totalRsd).toBe(items + 300);
        // 15 % markup: the Room service unit price is above the menu price.
        for (const item of request.items) {
          const article = must(
            menu.snapshot.articles.find((candidate) => candidate.key === item.articleKey),
            "article",
          );
          expect(item.unitPriceRsd).toBeGreaterThan(must(article.basePriceRsd ?? undefined, "base price"));
        }
        for (const other of requests.filter((candidate) => candidate.channel === "standard")) {
          expect(other.deliveryFeeRsd).toBeNull();
        }
      });

      test("is deterministic", () => {
        expect(fixtureRequests(fixtureVenue(kind))).toEqual(requests);
      });
    });
  }
});

describe("fixtureReservations", () => {
  for (const kind of VENUE_KINDS) {
    test(`${kind}: eight reservations covering every status`, () => {
      const venue = fixtureVenue(kind);
      const reservations = fixtureReservations(venue);
      expect(reservations).toHaveLength(8);
      expect(allUnique(reservations.map((reservation) => reservation.id))).toBe(true);
      expect(new Set(reservations.map((reservation) => reservation.status))).toEqual(
        new Set(["new", "accepted", "declined", "change_proposed", "arrived", "cancelled"]),
      );

      const positionKeys = new Set(venue.positions.map((position) => position.key));
      for (const reservation of reservations) {
        if (reservation.positionKey !== null) expect(positionKeys.has(reservation.positionKey)).toBe(true);
        expect([null, "gost@example.com"]).toContain(reservation.contactEmail);
        expect([null, "+381 60 000 0000"]).toContain(reservation.contactPhone);
        expect(reservation.partySize).toBeGreaterThan(0);
        expect(reservation.createdAt).toBeLessThanOrEqual(IZLOG_SADA);
      }

      // New: tonight at 19:00 Belgrade, after "now".
      const fresh = must(reservations.find((reservation) => reservation.status === "new"), "new");
      expect(fresh.requestedAt).toBe(Date.UTC(2026, 9, 17, 17, 0, 0));
      expect(fresh.requestedAt).toBeGreaterThan(IZLOG_SADA);

      const proposed = must(
        reservations.find((reservation) => reservation.status === "change_proposed"),
        "change_proposed",
      );
      expect(must(proposed.proposedAt ?? undefined, "proposedAt")).not.toBe(proposed.requestedAt);

      const cancelled = must(
        reservations.find((reservation) => reservation.status === "cancelled"),
        "cancelled",
      );
      expect([cancelled.cancelledBy, cancelled.cancelledAt === null]).toEqual(["guest", false]);

      // One accepted reservation whose time passed 25 minutes ago, held for 15.
      const late = reservations.filter(
        (reservation) =>
          reservation.status === "accepted" &&
          IZLOG_SADA - reservation.requestedAt > reservation.holdMinutes * 60_000,
      );
      expect(late).toHaveLength(1);
      expect(late[0].holdMinutes).toBe(15);
      expect(IZLOG_SADA - late[0].requestedAt).toBe(25 * 60_000);

      expect(fixtureReservations(fixtureVenue(kind))).toEqual(reservations);
    });
  }
});

describe("fixtureTeam", () => {
  test("members and staff cover the roles and states of the team screen", () => {
    const team = fixtureTeam();
    expect(team.members.map((member) => `${member.role}:${member.status}`)).toEqual([
      "owner:active",
      "manager:active",
      "editor:active",
      "editor:invited",
      "editor:removed",
    ]);
    expect(team.members[0].email).toBe("vlasnik@example.com");
    for (const member of team.members) expect(member.email).toMatch(/@example\.com$/);

    expect(team.staff.map((staff) => staff.displayName)).toEqual([
      "Milan",
      "Jelena",
      "Stefan",
      "Ana",
      "Luka",
    ]);
    expect(team.staff.filter((staff) => staff.panelRole === "manager")).toHaveLength(1);
    expect(team.staff.filter((staff) => !staff.active)).toHaveLength(1);
    expect(team.staff.filter((staff) => !staff.hasPin)).toHaveLength(1);
    expect(allUnique(team.staff.map((staff) => staff.key))).toBe(true);
    for (const staff of team.staff) expect(staff.key).toMatch(/^st_[0-9a-hjkmnp-tv-z]{12}$/);

    const zoneKeys = new Set(fixtureVenue("restaurant").zones.map((zone) => zone.key));
    const assigned = team.staff.filter((staff) => staff.activeZoneKey !== null);
    expect(assigned.length).toBeGreaterThanOrEqual(2);
    expect(assigned.length).toBeLessThan(team.staff.length);
    for (const staff of assigned) {
      expect(zoneKeys.has(must(staff.activeZoneKey ?? undefined, "zone"))).toBe(true);
    }
    expect(fixtureTeam()).toEqual(team);
  });
});

// -----------------------------------------------------------------------------
// Privacy: the repository is public, so nothing may look real
// -----------------------------------------------------------------------------

describe("privacy", () => {
  const venues = VENUE_KINDS.map((kind) => fixtureVenue(kind));
  const everything = JSON.stringify({
    menus: IZLOG_MENU_SIZES.map((size) => fixtureMenu(size)),
    venues,
    requests: venues.map((venue) => fixtureRequests(venue)),
    reservations: venues.map((venue) => fixtureReservations(venue)),
    team: fixtureTeam(),
  });

  test("no e-mail other than @example.com and no phone other than the placeholder", () => {
    expect(everything.replace(/@example\.com/g, "")).not.toContain("@");
    const phones = everything.match(/\+\d[\d ]*/g) ?? [];
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone.trim()).toBe("+381 60 000 0000");
  });

  test("only the three invented venues appear", () => {
    expect(venues.map((venue) => venue.name).sort()).toEqual(["Demo restoran", "Hotel Primer", "Kafana kod Mike"]);
    expect(IZLOG_MENU_SIZES.map((size) => fixtureMenu(size).venueName).sort()).toEqual([
      "Demo restoran",
      "Hotel Primer",
      "Kafana kod Mike",
    ]);
  });

  test("no other product's CSS namespace leaks into the data", () => {
    expect(everything).not.toContain(VENUE_NS);
    expect(everything).not.toContain(LINKS_NS);
  });

  test("nothing is random: building everything again gives byte-equal JSON", () => {
    const again = JSON.stringify({
      menus: IZLOG_MENU_SIZES.map((size) => fixtureMenu(size)),
      venues: VENUE_KINDS.map((kind) => fixtureVenue(kind)),
      requests: VENUE_KINDS.map((kind) => fixtureRequests(fixtureVenue(kind))),
      reservations: VENUE_KINDS.map((kind) => fixtureReservations(fixtureVenue(kind))),
      team: fixtureTeam(),
    });
    expect(again).toBe(everything);
  });
});
