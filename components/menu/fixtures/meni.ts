// Izlog fixtures: three invented menus (mali / srednji / veliki) as real
// MenuDraftSnapshots, so the preview renders exactly what the editor and the
// publisher would hold. All venues, dishes and prices are fictional.
//
// The data is written as compact tables (SectionSpec rows) and turned into the
// snapshot by one builder. Everything is deterministic: keys come from a seeded
// PRNG (rng.ts), there is no clock and no Math.random, and every call builds a
// brand-new object.

import type { MenuAllergenCode } from "@/lib/menu/allergens";
import type { MenuKeyKind } from "@/lib/menu/keys";
import type { MenuPromo } from "@/lib/menu/promo";
import { DEFAULT_PAGE_SLUG } from "@/lib/menu/slugs";
import {
  MENU_SNAPSHOT_FORMAT,
  type MenuPageNavigation,
  type SnapshotAddonGroup,
  type SnapshotAddonOption,
  type SnapshotAllergens,
  type SnapshotArticle,
  type SnapshotArticleAddonGroup,
  type SnapshotComboComponent,
  type SnapshotPage,
  type SnapshotPlacement,
  type SnapshotRoomServiceCategory,
  type SnapshotRoomServiceConfig,
  type SnapshotRoomServiceItem,
  type SnapshotSection,
  type SnapshotSettings,
  type SnapshotVariant,
} from "@/lib/menu/snapshot";
import type { MenuTagCode } from "@/lib/menu/tags";
import { createRng, fixtureKey, type Rng } from "./rng";
import type { IzlogMenu, IzlogMenuSize } from "./tipovi";

export const IZLOG_MENU_SIZES = ["mali", "srednji", "veliki"] as const;

// =============================================================================
// Spec types (the compact tables the data below is written in)
// =============================================================================

type Allergens = readonly MenuAllergenCode[];

type DishOptions = {
  desc?: string;
  qty?: readonly [value: number, unit: string];
  /** undefined: follows the section's autoAllergens; null: nothing recorded (unknown); a list: recorded. */
  allergens?: Allergens | null;
  mayContain?: Allergens;
  /** In the canonical order of MENU_TAG_CODES. */
  tags?: readonly MenuTagCode[];
  icon?: string;
  /** Turns variants on; the article then has no base price. */
  variants?: readonly (readonly [name: string, priceRsd: number])[];
  promo?: MenuPromo;
  /** Ids of the add-on groups (MenuSpec.groups) this article offers. */
  groups?: readonly string[];
  note?: boolean;
  /** The only placement of the article is hidden ("Sakrij"). */
  hidden?: boolean;
  /** Makes the article a combo of these plain articles (name, quantity). */
  combo?: readonly (readonly [name: string, quantity: number])[];
};

type Row = readonly [name: string, priceRsd: number | null, options?: DishOptions];

type SectionSpec = {
  name: string;
  description?: string;
  icon?: string;
  /** iconKey (mediaMode "icon") of every dish of the section without its own icon. */
  dishIcon?: string;
  /** Default quantity of dishes without variants and without their own quantity. */
  unit?: readonly [value: number, unit: string];
  /** Allergens given to about 60 % of the dishes that state nothing themselves; the rest stay unknown. */
  autoAllergens?: Allergens;
  rows: readonly Row[];
};

/** A section of another page: the same articles as whole sections of the default page, or by name. */
type SharedSectionSpec = {
  name: string;
  from?: readonly string[];
  names?: readonly string[];
};

type PageSpec = {
  name: string;
  slug: string;
  publicTitle: string;
  sections: readonly SharedSectionSpec[];
};

type GroupSpec = {
  id: string;
  name: string;
  selection: "single" | "multiple";
  required: boolean;
  minSelect?: number;
  maxSelect?: number;
  options: readonly (readonly [name: string, priceDeltaRsd: number])[];
};

/** An article name, or [name, manual Room service price]. */
type RoomServiceEntry = string | readonly [name: string, manualPriceRsd: number];

type RoomServiceSpec = {
  config: SnapshotRoomServiceConfig;
  categories: readonly { name: string; items: readonly RoomServiceEntry[] }[];
};

type MenuSpec = {
  size: IzlogMenuSize;
  seed: number;
  venueName: string;
  slug: string;
  navigation: MenuPageNavigation;
  settings: SnapshotSettings;
  groups: readonly GroupSpec[];
  /** The sections (with dishes) of the default page "Kompletan meni". */
  sections: readonly SectionSpec[];
  pages: readonly PageSpec[];
  /** Article name -> confirmed English name. */
  translationsEn?: Readonly<Record<string, string>>;
  roomService?: RoomServiceSpec;
  /** Articles that are "nema više" right now. */
  unavailable: readonly string[];
};

// =============================================================================
// The builder
// =============================================================================

function recordAllergens(
  options: DishOptions,
  section: SectionSpec,
  rng: Rng,
): SnapshotAllergens | null {
  if (options.allergens === null) return null;
  if (options.allergens !== undefined) {
    return {
      contains: [...options.allergens],
      mayContain: [...(options.mayContain ?? [])],
      otherText: null,
    };
  }
  if (section.autoAllergens !== undefined && rng.next() < 0.6) {
    return { contains: [...section.autoAllergens], mayContain: [], otherText: null };
  }
  return null;
}

function buildMenu(spec: MenuSpec): IzlogMenu {
  const rng = createRng(spec.seed);
  const key = (kind: MenuKeyKind) => fixtureKey(kind, rng);

  const pages: SnapshotPage[] = [];
  const sections: SnapshotSection[] = [];
  const articles: SnapshotArticle[] = [];
  const placements: SnapshotPlacement[] = [];
  const variants: SnapshotVariant[] = [];
  const addonGroups: SnapshotAddonGroup[] = [];
  const addonOptions: SnapshotAddonOption[] = [];
  const articleAddonGroups: SnapshotArticleAddonGroup[] = [];
  const comboComponents: SnapshotComboComponent[] = [];

  const articleByName = new Map<string, SnapshotArticle>();
  const visibleKeysBySection = new Map<string, string[]>();
  const pendingCombos: { comboKey: string; parts: NonNullable<DishOptions["combo"]> }[] = [];

  const requireArticle = (name: string): SnapshotArticle => {
    const article = articleByName.get(name);
    if (!article) throw new Error(`Izlog fixture "${spec.size}": unknown article "${name}"`);
    return article;
  };

  // --- add-on groups ---------------------------------------------------------
  const groupKeyById = new Map<string, string>();
  for (const group of spec.groups) {
    const groupKey = key("addonGroup");
    groupKeyById.set(group.id, groupKey);
    addonGroups.push({
      key: groupKey,
      name: group.name,
      selection: group.selection,
      required: group.required,
      minSelect: group.minSelect ?? null,
      maxSelect: group.maxSelect ?? null,
      translations: null,
    });
    group.options.forEach(([name, priceDeltaRsd], order) => {
      addonOptions.push({
        key: key("addonOption"),
        groupKey,
        name,
        priceDeltaRsd,
        order,
        translations: null,
      });
    });
  }

  // --- the default page and its dishes ---------------------------------------
  const defaultPageKey = key("page");
  pages.push({
    key: defaultPageKey,
    slug: DEFAULT_PAGE_SLUG,
    name: "Kompletan meni",
    publicTitle: null,
    isDefault: true,
    order: 0,
    visibility: "visible",
    archivedAt: null,
    iconKey: null,
    navigation: spec.navigation,
    translations: null,
  });

  spec.sections.forEach((section, sectionOrder) => {
    const sectionKey = key("section");
    sections.push({
      key: sectionKey,
      pageKey: defaultPageKey,
      name: section.name,
      description: section.description ?? null,
      iconKey: section.icon ?? null,
      order: sectionOrder,
      visibility: "visible",
      translations: null,
    });
    const visibleKeys: string[] = [];

    section.rows.forEach((row, rowOrder) => {
      const [name, priceRsd] = row;
      const options: DishOptions = row[2] ?? {};
      if (articleByName.has(name)) {
        throw new Error(`Izlog fixture "${spec.size}": duplicate article name "${name}"`);
      }
      const articleKey = key("article");
      const rowVariants = options.variants ?? [];
      const groupIds = options.groups ?? [];
      const iconKey = options.icon ?? section.dishIcon ?? null;
      const quantity =
        options.qty ?? (rowVariants.length === 0 ? section.unit : undefined) ?? null;

      const article: SnapshotArticle = {
        key: articleKey,
        kind: options.combo ? "combo" : "item",
        name,
        description: options.desc ?? null,
        quantityValue: quantity ? quantity[0] : null,
        quantityUnit: quantity ? quantity[1] : null,
        basePriceRsd: priceRsd,
        mediaMode: iconKey === null ? "none" : "icon",
        imageMediaId: null,
        iconKey,
        variantsEnabled: rowVariants.length > 0,
        addonsEnabled: groupIds.length > 0,
        noteEnabled: options.note ?? false,
        allergens: recordAllergens(options, section, rng),
        tags: options.tags ? [...options.tags] : null,
        promo: options.promo ? { ...options.promo } : null,
        priceCheck: null,
        translations: null,
      };
      articles.push(article);
      articleByName.set(name, article);

      placements.push({
        pageKey: defaultPageKey,
        sectionKey,
        articleKey,
        order: rowOrder,
        visibility: options.hidden ? "hidden" : "visible",
      });
      if (!options.hidden) visibleKeys.push(articleKey);

      rowVariants.forEach(([variantName, variantPrice], variantOrder) => {
        variants.push({
          key: key("variant"),
          articleKey,
          name: variantName,
          priceRsd: variantPrice,
          order: variantOrder,
          translations: null,
        });
      });
      groupIds.forEach((groupId, order) => {
        const groupKey = groupKeyById.get(groupId);
        if (!groupKey) throw new Error(`Izlog fixture "${spec.size}": unknown group "${groupId}"`);
        articleAddonGroups.push({ articleKey, groupKey, order });
      });
      if (options.combo) pendingCombos.push({ comboKey: articleKey, parts: options.combo });
    });

    visibleKeysBySection.set(section.name, visibleKeys);
  });

  // --- the other pages: the same articles again, never new copies ------------
  spec.pages.forEach((pageSpec, pageIndex) => {
    const pageKey = key("page");
    pages.push({
      key: pageKey,
      slug: pageSpec.slug,
      name: pageSpec.name,
      publicTitle: pageSpec.publicTitle,
      isDefault: false,
      order: pageIndex + 1,
      visibility: "visible",
      archivedAt: null,
      iconKey: null,
      navigation: spec.navigation,
      translations: null,
    });
    pageSpec.sections.forEach((shared, sectionOrder) => {
      const sectionKey = key("section");
      sections.push({
        key: sectionKey,
        pageKey,
        name: shared.name,
        description: null,
        iconKey: null,
        order: sectionOrder,
        visibility: "visible",
        translations: null,
      });
      const articleKeys = [
        ...(shared.from ?? []).flatMap((sectionName) => {
          const keys = visibleKeysBySection.get(sectionName);
          if (!keys) throw new Error(`Izlog fixture "${spec.size}": unknown section "${sectionName}"`);
          return keys;
        }),
        ...(shared.names ?? []).map((name) => requireArticle(name).key),
      ];
      articleKeys.forEach((articleKey, order) => {
        placements.push({ pageKey, sectionKey, articleKey, order, visibility: "visible" });
      });
    });
  });

  // --- combos ------------------------------------------------------------------
  for (const combo of pendingCombos) {
    combo.parts.forEach(([partName, quantity], order) => {
      const part = requireArticle(partName);
      if (part.kind !== "item") {
        throw new Error(`Izlog fixture "${spec.size}": combo component "${partName}" is not a plain item`);
      }
      comboComponents.push({ comboKey: combo.comboKey, componentKey: part.key, quantity, order });
    });
  }

  // --- translations -------------------------------------------------------------
  for (const [name, english] of Object.entries(spec.translationsEn ?? {})) {
    requireArticle(name).translations = { en: { name: english, status: "confirmed" } };
  }

  // --- Room service ---------------------------------------------------------------
  const roomServiceCategories: SnapshotRoomServiceCategory[] = [];
  const roomServiceItems: SnapshotRoomServiceItem[] = [];
  if (spec.roomService) {
    const inRoomService = new Set<string>();
    spec.roomService.categories.forEach((category, categoryOrder) => {
      const categoryKey = key("roomServiceCategory");
      roomServiceCategories.push({
        key: categoryKey,
        name: category.name,
        order: categoryOrder,
        translations: null,
      });
      category.items.forEach((entry, order) => {
        const [name, manualPriceRsd]: readonly [string, number | null] =
          typeof entry === "string" ? [entry, null] : entry;
        const article = requireArticle(name);
        if (inRoomService.has(article.key)) {
          throw new Error(`Izlog fixture "${spec.size}": "${name}" is in Room service twice`);
        }
        inRoomService.add(article.key);
        roomServiceItems.push({
          articleKey: article.key,
          categoryKey,
          order,
          markupApplies: true,
          manualPriceRsd,
          priceWarning: null,
          manualVariantPrices: null,
        });
      });
    });
  }

  return {
    size: spec.size,
    venueName: spec.venueName,
    slug: spec.slug,
    snapshot: {
      formatVersion: MENU_SNAPSHOT_FORMAT,
      settings: {
        languages: spec.settings.languages
          ? {
              source: spec.settings.languages.source,
              translations: [...spec.settings.languages.translations],
            }
          : null,
        allergensEnabled: spec.settings.allergensEnabled,
      },
      presentation: null,
      pages,
      sections,
      articles,
      placements,
      variants,
      addonGroups,
      addonOptions,
      articleAddonGroups,
      comboComponents,
      roomService: {
        config: spec.roomService ? { ...spec.roomService.config } : null,
        categories: roomServiceCategories,
        items: roomServiceItems,
      },
    },
    unavailableArticleKeys: spec.unavailable.map((name) => requireArticle(name).key),
  };
}

// =============================================================================
// Shared pieces
// =============================================================================

const promoPercent = (percent: number): MenuPromo => ({
  active: true,
  mode: "percent",
  percent,
  label: "promo",
});
const promoPrice = (priceRsd: number): MenuPromo => ({
  active: true,
  mode: "price",
  priceRsd,
  label: "promo",
});

const GROUP_COFFEE_EXTRAS: GroupSpec = {
  id: "kafa",
  name: "Dodaci uz kafu",
  selection: "multiple",
  required: false,
  options: [
    ["Šlag", 40],
    ["Biljno mleko", 50],
    ["Sirup od vanile", 40],
  ],
};

const GROUP_DONENESS: GroupSpec = {
  id: "pecenje",
  name: "Stepen pečenja",
  selection: "single",
  required: false,
  options: [
    ["Slabo pečeno", 0],
    ["Srednje pečeno", 0],
    ["Dobro pečeno", 0],
  ],
};

const GROUP_SIDES: GroupSpec = {
  id: "prilozi",
  name: "Izaberite dva priloga",
  selection: "multiple",
  required: true,
  minSelect: 2,
  maxSelect: 2,
  options: [
    ["Pomfrit", 0],
    ["Pečeni krompir", 0],
    ["Pirinač sa povrćem", 0],
    ["Grilovano povrće", 60],
    ["Kajmak", 80],
  ],
};

/** A glass costs about a seventh of the bottle, rounded to ten dinars. */
const glassPrice = (bottleRsd: number): number => Math.round(bottleRsd / 70) * 10;

function wineByGlass(name: string, bottleRsd: number, desc: string): Row {
  return [
    name,
    null,
    {
      desc,
      variants: [
        ["Čaša 0,15 l", glassPrice(bottleRsd)],
        ["Flaša 0,75 l", bottleRsd],
      ],
      allergens: ["sulphites"],
    },
  ];
}

function wineBottle(name: string, bottleRsd: number, desc: string): Row {
  return [name, bottleRsd, { desc, qty: [0.75, "l"], allergens: ["sulphites"] }];
}

// =============================================================================
// MALI: "Kafana kod Mike", a simple cafe
// =============================================================================

const MALI: MenuSpec = {
  size: "mali",
  seed: 1101,
  venueName: "Kafana kod Mike",
  slug: "kafana-kod-mike",
  navigation: "standalone",
  settings: { languages: null, allergensEnabled: null },
  groups: [GROUP_COFFEE_EXTRAS],
  sections: [
    {
      name: "Kafa",
      icon: "kafa",
      rows: [
        ["Espresso", null, { icon: "kafa", variants: [["Mali", 160], ["Veliki", 200]] }],
        ["Produžena kafa", 180],
        [
          "Domaća kafa",
          170,
          { desc: "Kuvana u džezvi, uz čašu vode.", icon: "domaca kafa", tags: ["homemade"] },
        ],
        ["Nes kafa", 190],
        ["Kafa sa mlekom", 210, { desc: "Espresso sa toplim mlekom.", groups: ["kafa"] }],
        ["Cappuccino", 230, { groups: ["kafa"] }],
        ["Topla čokolada", 260, { desc: "Gusta, kuvana na mleku." }],
      ],
    },
    {
      name: "Sokovi",
      rows: [
        ["Domaća limunada", 250, { desc: "Sa limunom i svežom nanom.", qty: [0.3, "l"] }],
        ["Ceđena pomorandža", 320, { qty: [0.25, "l"] }],
        ["Sok od jabuke", 230, { qty: [0.2, "l"] }],
        ["Mineralna voda", 190, { qty: [0.33, "l"], icon: "voda" }],
        ["Negazirana voda", 170, { qty: [0.5, "l"] }],
      ],
    },
    {
      name: "Doručak",
      rows: [
        ["Kajgana sa slaninom", 520, { desc: "Tri jajeta, hrskava slanina i hleb." }],
        ["Tost sa sirom i šunkom", 380],
        ["Burek sa sirom", 340, { icon: "burek" }],
        ["Sendvič sa pršutom i sirom", 560, { desc: "Pršut, sir i paradajz u lepinji." }],
      ],
    },
    {
      name: "Slatko",
      rows: [
        ["Palačinke sa čokoladom", 390, { icon: "palacinke" }],
        ["Štrudla sa jabukama", 330],
        ["Domaća baklava", 280],
        ["Sladoled, kugla", 120, { icon: "sladoled" }],
      ],
    },
  ],
  pages: [],
  unavailable: ["Ceđena pomorandža"],
};

// =============================================================================
// SREDNJI: "Demo restoran", two pages (the whole menu + a wine list)
// =============================================================================

const SREDNJI: MenuSpec = {
  size: "srednji",
  seed: 2202,
  venueName: "Demo restoran",
  slug: "demo-restoran",
  navigation: "standalone",
  settings: { languages: null, allergensEnabled: true },
  groups: [GROUP_DONENESS, GROUP_SIDES],
  sections: [
    {
      name: "Predjela",
      rows: [
        [
          "Kajmak sa pogačom",
          480,
          {
            desc: "Domaći kajmak i topla pogača.",
            allergens: ["milk", "gluten"],
            tags: ["homemade"],
            icon: "kajmak",
          },
        ],
        [
          "Pršut sa sirom",
          920,
          { desc: "Sušeni pršut, tvrdi sir i masline.", allergens: ["milk"] },
        ],
        [
          "Daska sa mezetom",
          1450,
          {
            desc: "Pršut, kulen, sir, kajmak, ajvar i masline, za dvoje.",
            allergens: ["milk", "gluten"],
            tags: ["recommended"],
            note: true,
          },
        ],
        [
          "Punjene pečurke",
          690,
          { desc: "Pečurke punjene sirom i mladim lukom.", allergens: ["milk"], tags: ["vegetarian"] },
        ],
        ["Prebranac", 520, { tags: ["vegan", "homemade"] }],
        ["Ajvar sa tostom", 360, { allergens: ["gluten"], tags: ["vegan"], icon: "ajvar" }],
        [
          "Pohovani sir",
          640,
          { allergens: ["gluten", "eggs", "milk"], tags: ["vegetarian"] },
        ],
        ["Gibanica", 560, { allergens: ["gluten", "eggs", "milk"], tags: ["homemade"] }],
        ["Domaći kulen", 780],
        ["Urnebes salata", 420, { tags: ["vegetarian", "spicy"] }],
        ["Pržene lignje", 1120, { allergens: ["molluscs", "gluten"] }],
        ["Bruschetta sa paradajzom", 480, { allergens: ["gluten"], tags: ["vegan"] }],
      ],
    },
    {
      name: "Supe i salate",
      rows: [
        [
          "Domaća pileća supa",
          380,
          { allergens: ["gluten", "celery"], icon: "supa", qty: [0.3, "l"] },
        ],
        ["Teleća čorba", 420, { allergens: ["celery"] }],
        ["Paradajz čorba", 360, { tags: ["vegetarian"] }],
        ["Riblja čorba", 520, { allergens: ["fish", "celery"], tags: ["spicy"] }],
        ["Krem supa od pečuraka", 400, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Šopska salata", 420, { allergens: ["milk"], tags: ["vegetarian"], icon: "salata" }],
        ["Srpska salata", 340, { tags: ["vegan"] }],
        ["Grčka salata", 480, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Cezar salata sa piletinom", 690, { allergens: ["gluten", "eggs", "milk", "fish"] }],
        ["Sezonska salata", 280, { tags: ["vegan"] }],
        ["Kupus salata", 260, { tags: ["vegan"] }],
        ["Rukola sa parmezanom", 560, { allergens: ["milk"], tags: ["vegetarian"] }],
      ],
    },
    {
      name: "Sa roštilja",
      description: "Meso sa roštilja služimo uz lepinju i luk.",
      rows: [
        [
          "Ćevapi",
          null,
          {
            desc: "Domaći ćevapi od mešanog mesa.",
            variants: [["5 komada", 520], ["10 komada", 880]],
            allergens: ["gluten"],
            tags: ["house_special"],
            icon: "cevapi",
          },
        ],
        [
          "Pljeskavica sa kajmakom",
          780,
          {
            desc: "Pljeskavica punjena kajmakom.",
            allergens: ["gluten", "milk"],
            icon: "pljeskavica",
          },
        ],
        ["Gurmanska pljeskavica", 920, { allergens: ["gluten", "milk"] }],
        ["Vešalica", 1180, { desc: "Svinjska vešalica sa žara.", groups: ["pecenje"] }],
        [
          "Karađorđeva šnicla",
          1080,
          {
            desc: "Uvijena teleća šnicla punjena kajmakom, pohovana.",
            allergens: ["gluten", "eggs", "milk"],
          },
        ],
        ["Pileći file na žaru", 890, { promo: promoPercent(15), groups: ["prilozi"] }],
        ["Svinjski vrat", 1240, { groups: ["prilozi"] }],
        ["Ražnjići", 860],
        [
          "Mešano meso (za dvoje)",
          2480,
          {
            desc: "Ćevapi, pljeskavica, vešalica i ražnjići, uz dva priloga.",
            allergens: ["gluten", "milk"],
            tags: ["recommended"],
            groups: ["prilozi"],
            note: true,
          },
        ],
        ["Jagnjeći kotleti", 2150, { groups: ["pecenje"] }],
        ["Biftek na žaru", 2980, { desc: "Juneći biftek sa žara.", groups: ["pecenje"], note: true }],
        ["Domaća kobasica", 780, { tags: ["spicy"] }],
      ],
    },
    {
      name: "Glavna jela",
      rows: [
        ["Sarma", 820, { desc: "Domaća sarma sa dimljenim mesom.", tags: ["homemade"] }],
        ["Punjene paprike", 760, { tags: ["homemade"] }],
        ["Gulaš od junetine", 880],
        ["Pasulj sa kobasicom", 640, { tags: ["homemade"] }],
        ["Musaka", 690, { allergens: ["gluten", "eggs", "milk"] }],
        ["Pečena patka sa mlincima", 1680, { allergens: ["gluten", "eggs"] }],
        ["Brancin na žaru", 1780, { allergens: ["fish"], icon: "riba" }],
        ["Špagete karbonara", 780, { allergens: ["gluten", "eggs", "milk"], icon: "testenina" }],
        ["Pileći medaljoni u sosu od pečuraka", 1050, { allergens: ["milk"] }],
        ["Rižoto sa pečurkama", 760, { allergens: ["milk"], tags: ["vegetarian"] }],
        [
          "Ručak dana",
          1150,
          {
            desc: "Teleća čorba, punjene paprike i kupus salata.",
            combo: [["Teleća čorba", 1], ["Punjene paprike", 1], ["Kupus salata", 1]],
          },
        ],
        ["Jagnjetina ispod sača", 2890, { desc: "Sezonsko jelo, na zahtev.", hidden: true }],
      ],
    },
    {
      name: "Prilozi",
      rows: [
        ["Pomfrit", 260, { tags: ["vegan"] }],
        ["Pečeni krompir", 280, { tags: ["vegan"] }],
        ["Kajmak", 220, { allergens: ["milk"], icon: "kajmak" }],
        ["Ajvar", 150, { tags: ["vegan"] }],
        ["Grilovano povrće", 380, { tags: ["vegan"] }],
        ["Pogača", 120, { allergens: ["gluten"] }],
      ],
    },
    {
      name: "Dezerti",
      rows: [
        [
          "Palačinke sa orasima",
          420,
          { allergens: ["gluten", "eggs", "milk", "nuts"], icon: "palacinke" },
        ],
        [
          "Tiramisu",
          480,
          { allergens: ["gluten", "eggs", "milk"], promo: promoPrice(399) },
        ],
        ["Baklava", 360, { allergens: ["gluten", "nuts"] }],
        ["Tufahije", 390, { allergens: ["nuts"] }],
        ["Čokoladni sufle", 520, { allergens: ["gluten", "eggs", "milk"], mayContain: ["nuts"] }],
        ["Sladoled, kugla", 130, { allergens: ["milk"], icon: "sladoled" }],
        ["Voćna salata", 340, { tags: ["vegan"] }],
      ],
    },
    {
      name: "Pića",
      rows: [
        ["Espresso", null, { icon: "kafa", variants: [["Mali", 170], ["Veliki", 210]] }],
        ["Domaća kafa", 180, { icon: "domaca kafa" }],
        ["Kafa sa mlekom", 210],
        ["Točeno pivo", null, { icon: "pivo", variants: [["0,3 l", 230], ["0,5 l", 330]] }],
        ["Flaširano pivo", 270, { qty: [0.33, "l"] }],
        ["Gazirani sok", 240, { qty: [0.25, "l"], icon: "sok" }],
        ["Ceđena pomorandža", 340, { qty: [0.25, "l"] }],
        ["Domaća limunada", 310, { qty: [0.4, "l"] }],
        ["Mineralna voda", 200, { qty: [0.33, "l"], icon: "voda" }],
        ["Negazirana voda", 190, { qty: [0.33, "l"] }],
      ],
    },
    {
      name: "Vina",
      dishIcon: "vino",
      rows: [
        wineBottle("Tamjanika", 2200, "Aromatično belo vino, note ruže i muškata."),
        wineBottle("Sauvignon Blanc", 2100, "Sveže belo vino, note citrusa."),
        wineBottle("Rizling", 1800, "Lagano belo vino sa živom kiselinom."),
        wineBottle("Chardonnay", 2300, "Puno belo vino, note vanile."),
        wineByGlass("Vranac", 2100, "Crno vino punog tela, note tamnog voća."),
        wineBottle("Prokupac", 2400, "Voćno crveno vino, note višnje."),
        wineBottle("Merlot", 2200, "Meko crveno vino, note šljive."),
        wineBottle("Cabernet Sauvignon", 2600, "Strukturirano crveno vino."),
        wineBottle("Pinot Noir", 2800, "Elegantno crveno vino, note jagode."),
      ],
    },
  ],
  pages: [
    {
      name: "Vinska karta",
      slug: "vinska-karta",
      publicTitle: "Vinska karta",
      sections: [
        { name: "Bela vina", names: ["Tamjanika", "Sauvignon Blanc", "Rizling", "Chardonnay"] },
        {
          name: "Crvena vina",
          names: ["Vranac", "Prokupac", "Merlot", "Cabernet Sauvignon", "Pinot Noir"],
        },
      ],
    },
  ],
  unavailable: ["Riblja čorba", "Čokoladni sufle"],
};

// =============================================================================
// VELIKI: "Hotel Primer", about 400 articles, four pages, Room service, English
// =============================================================================

// Wines are generated: the same grape in a "Selekcija" and a "Rezerva" bottling.
type GrapeLine = readonly [grape: string, note: string, selekcijaRsd: number, rezervaRsd: number];

const WHITE_GRAPES: readonly GrapeLine[] = [
  ["Sauvignon Blanc", "Sveže, sa notama citrusa i trave.", 2100, 3100],
  ["Chardonnay", "Puno, sa notama vanile i oraha.", 2300, 3400],
  ["Tamjanika", "Aromatično, sa notama ruže i muškata.", 2200, 3300],
  ["Rizling", "Lagano, sa živom kiselinom.", 1900, 2800],
  ["Pinot Grigio", "Suvo, sa notama kruške i badema.", 2100, 3000],
  ["Traminac", "Aromatično, sa notama ruže i začina.", 2400, 3500],
  ["Muskat Ottonel", "Cvetno, polusuvo.", 2000, 2900],
  ["Italijanski rizling", "Sveže, sa notama jabuke.", 1900, 2700],
];

const RED_GRAPES: readonly GrapeLine[] = [
  ["Vranac", "Puno i taninsko, sa notama tamnog voća.", 2200, 3600],
  ["Prokupac", "Voćno, sa notama višnje i bibera.", 2400, 3800],
  ["Merlot", "Meko, sa notama šljive.", 2200, 3500],
  ["Cabernet Sauvignon", "Strukturirano, sa notama crne ribizle.", 2600, 4100],
  ["Pinot Noir", "Elegantno, sa notama jagode i zemlje.", 2800, 4200],
  ["Syrah", "Začinsko, sa notama bibera.", 2500, 3900],
  ["Frankovka", "Sveže, sa notama višnje.", 2000, 3000],
  ["Game", "Lagano crveno vino, voćno.", 2000, 2900],
  ["Cabernet Franc", "Biljne note i meki tanini.", 2400, 3700],
];

const grapeRows = (lines: readonly GrapeLine[]): Row[] =>
  lines.flatMap(([grape, note, selekcijaRsd, rezervaRsd]) => [
    wineByGlass(`${grape} Selekcija 2023`, selekcijaRsd, note),
    wineByGlass(`${grape} Rezerva 2021`, rezervaRsd, note),
  ]);

const VELIKI: MenuSpec = {
  size: "veliki",
  seed: 3303,
  venueName: "Hotel Primer",
  slug: "hotel-primer",
  navigation: "standalone",
  settings: { languages: { source: "sr", translations: ["en"] }, allergensEnabled: true },
  groups: [GROUP_DONENESS, GROUP_SIDES, GROUP_COFFEE_EXTRAS],
  sections: [
    // ----- Doručak -----------------------------------------------------------
    {
      name: "Jaja i omleti",
      autoAllergens: ["eggs"],
      rows: [
        ["Kajgana sa sirom", 520, { tags: ["vegetarian"] }],
        ["Kajgana sa slaninom", 540],
        ["Omlet sa šunkom i sirom", 590, { allergens: ["eggs", "milk"] }],
        ["Omlet sa pečurkama", 560, { tags: ["vegetarian"] }],
        ["Omlet od belanaca sa spanaćem", 620, { tags: ["vegetarian"] }],
        ["Jaja na oko (3 komada)", 480],
        ["Poširana jaja sa avokadom", 790, { tags: ["vegetarian"] }],
        ["Jaja Benedikt", 840, { desc: "Poširana jaja, šunka i holandez sos na tostu.", allergens: ["eggs", "gluten", "milk"] }],
        ["Šakšuka", 690, { desc: "Jaja u sosu od paradajza i paprike.", tags: ["vegetarian", "spicy"] }],
        ["Jaja u gnezdu", 650],
      ],
    },
    {
      name: "Peciva i slatki doručak",
      autoAllergens: ["gluten", "milk"],
      rows: [
        ["Kroasan sa puterom", 240],
        ["Kroasan sa čokoladom", 290, { allergens: ["gluten", "milk"], mayContain: ["nuts"] }],
        ["Burek sa sirom", 340, { icon: "burek" }],
        ["Burek sa mesom", 360, { icon: "burek", allergens: ["gluten"] }],
        ["Pogačice sa sirom (4 komada)", 320],
        ["Domaći hleb sa džemom", 280, { tags: ["homemade"] }],
        ["Palačinke sa džemom", 380],
        ["Vafli sa voćem", 460],
        ["Musli sa jogurtom i voćem", 420, { tags: ["vegetarian"] }],
        ["Ovsena kaša sa cimetom", 380, { tags: ["vegetarian"] }],
        ["Francuski tost", 450, { allergens: ["gluten", "eggs", "milk"] }],
        ["Američke palačinke sa javorovim sirupom", 520],
        ["Jogurt sa medom i orasima", 340, { allergens: ["milk", "nuts"], tags: ["vegetarian"] }],
        ["Štrudla sa višnjama", 350, { tags: ["homemade"] }],
      ],
    },
    {
      name: "Sirevi i suhomesnato",
      autoAllergens: ["milk"],
      unit: [100, "g"],
      rows: [
        ["Daska sa sirevima", 1280, { qty: [350, "g"] }],
        ["Daska sa suhomesnatim", 1480, { qty: [350, "g"], allergens: null }],
        ["Mešana daska za dvoje", 2350, { qty: [600, "g"], allergens: ["milk"], tags: ["recommended"] }],
        ["Domaći kajmak", 360, { qty: [150, "g"], tags: ["homemade"] }],
        ["Pršut", 890, { allergens: null }],
        ["Domaći kulen", 640, { allergens: null }],
        ["Dimljena vratna pečenica", 560, { allergens: null }],
        ["Feta sa maslinama", 520, { qty: [150, "g"] }],
        ["Mladi sir", 380, { qty: [150, "g"] }],
        ["Tvrdi sir", 590],
        ["Pečeni kozji sir sa medom", 720, { qty: [150, "g"] }],
        ["Pršut sa dinjom", 960, { qty: [200, "g"], allergens: null }],
      ],
    },
    // ----- Hrana -------------------------------------------------------------
    {
      name: "Hladna predjela",
      rows: [
        ["Kajmak sa pogačom", 480, { allergens: ["milk", "gluten"], tags: ["homemade"] }],
        ["Pršut sa sirom", 920, { allergens: ["milk"] }],
        ["Ajvar sa tostom", 360, { allergens: ["gluten"], tags: ["vegan"] }],
        ["Urnebes salata", 420, { tags: ["vegetarian", "spicy"] }],
        ["Bruschetta sa paradajzom", 480, { allergens: ["gluten"], tags: ["vegan"] }],
        ["Humus sa pitom", 460, { allergens: ["sesame", "gluten"], tags: ["vegan"] }],
        ["Carpaccio od govedine", 1320],
        ["Tatar od lososa", 1450, { allergens: ["fish"] }],
        ["Carpaccio od lososa", 1280, { allergens: ["fish"] }],
        ["Rolnice od tikvica sa sirom", 680, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Punjena jaja", 420, { allergens: ["eggs", "mustard"] }],
        ["Paštet od jetre sa džemom", 640],
        ["Mezze tanjir", 1190, { desc: "Humus, tzatziki, baba ganuš, masline i topla pita.", allergens: ["sesame", "gluten", "milk"] }],
        ["Tzatziki sa pitom", 480, { allergens: ["milk", "gluten"] }],
        ["Namaz od pečene paprike", 440, { tags: ["vegan"] }],
        ["Salata od hobotnice", 1390, { allergens: ["molluscs"] }],
      ],
    },
    {
      name: "Topla predjela",
      autoAllergens: ["gluten"],
      rows: [
        ["Pohovani sir", 640, { allergens: ["gluten", "eggs", "milk"], tags: ["vegetarian"] }],
        ["Punjene pečurke", 690, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Prebranac", 520, { allergens: null, tags: ["vegan", "homemade"] }],
        ["Pržene lignje", 1120, { allergens: ["molluscs", "gluten"] }],
        ["Gibanica", 560, { allergens: ["gluten", "eggs", "milk"], tags: ["homemade"] }],
        ["Pohovane pečurke", 590, { tags: ["vegetarian"] }],
        ["Krokete od sira (6 komada)", 640, { tags: ["vegetarian"] }],
        ["Pečeni patlidžan sa belim lukom", 520, { allergens: null, tags: ["vegan"] }],
        ["Pileća krilca (8 komada)", 780, { tags: ["spicy"] }],
        ["Pohovane tikvice", 520, { tags: ["vegetarian"] }],
        ["Pita sa spanaćem", 380, { tags: ["vegetarian"] }],
        ["Kobasice na žaru", 680, { allergens: null }],
        ["Crni luk u tempuri", 460, { tags: ["vegetarian"] }],
        ["Gambori na belom luku", 1680, { allergens: ["crustaceans"] }],
      ],
    },
    {
      name: "Supe i čorbe",
      dishIcon: "supa",
      autoAllergens: ["celery"],
      unit: [0.3, "l"],
      rows: [
        ["Domaća pileća supa", 380, { allergens: ["gluten", "celery"], tags: ["homemade"] }],
        ["Teleća čorba", 420],
        ["Paradajz čorba", 360, { tags: ["vegetarian"] }],
        ["Riblja čorba", 520, { allergens: ["fish", "celery"], tags: ["spicy"] }],
        ["Krem supa od pečuraka", 400, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Krem supa od bundeve", 390, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Gulaš čorba", 480, { tags: ["spicy"] }],
        ["Čorba od povrća", 340, { tags: ["vegan"] }],
        ["Čorba od sočiva", 360, { tags: ["vegan"] }],
        ["Supa sa knedlama od griza", 420, { allergens: ["gluten", "eggs", "celery"] }],
      ],
    },
    {
      name: "Salate",
      dishIcon: "salata",
      rows: [
        ["Šopska salata", 420, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Srpska salata", 340, { tags: ["vegan"] }],
        ["Grčka salata", 480, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Cezar salata sa piletinom", 690, { allergens: ["gluten", "eggs", "milk", "fish"] }],
        ["Sezonska salata", 280, { tags: ["vegan"] }],
        ["Kupus salata", 260, { tags: ["vegan"] }],
        ["Rukola sa parmezanom", 560, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Salata od cvekle", 320, { tags: ["vegan"] }],
        ["Caprese salata", 640, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Salata sa kozjim sirom", 720, { allergens: ["milk", "nuts"], tags: ["vegetarian"] }],
        ["Salata sa tunjevinom", 690, { allergens: ["fish", "eggs"] }],
        ["Salata sa piletinom i avokadom", 740],
        ["Quinoa salata", 690, { tags: ["vegan"] }],
        ["Tabule", 560, { allergens: ["gluten"], tags: ["vegan"] }],
        ["Salata od sočiva", 480, { tags: ["vegan"] }],
        ["Salata sa lososom", 980, { allergens: ["fish"] }],
      ],
    },
    {
      name: "Sendviči i burgeri",
      autoAllergens: ["gluten"],
      rows: [
        ["Club sendvič", 780, { desc: "Piletina, slanina, jaje, paradajz i salata na tostu.", allergens: ["gluten", "eggs"] }],
        ["Tost sa sirom i šunkom", 380, { allergens: ["gluten", "milk"] }],
        ["Panini sa pršutom", 690, { allergens: ["gluten", "milk"] }],
        ["Sendvič sa piletinom", 640],
        ["Vegetarijanski sendvič", 560, { tags: ["vegetarian"] }],
        ["Sendvič sa tunjevinom", 620, { allergens: ["gluten", "fish"] }],
        ["Klasični burger", 890, { desc: "Juneća pljeskavica, sir, kiseli krastavac i luk.", allergens: ["gluten", "milk"] }],
        ["Čizburger", 950, { allergens: ["gluten", "milk"] }],
        ["Burger sa slaninom", 1050, { allergens: ["gluten", "milk"] }],
        ["Pileći burger", 850],
        ["Vegetarijanski burger", 820, { tags: ["vegetarian"] }],
        ["Pljeskavica u lepinji", 560],
        ["Viršla u lepinji", 420],
        ["Wrap sa piletinom", 680],
      ],
    },
    {
      name: "Pice",
      autoAllergens: ["gluten", "milk"],
      rows: [
        ["Pica Margarita", 720, { promo: promoPercent(15), tags: ["vegetarian"] }],
        ["Pica Capricciosa", 880],
        ["Pica Funghi", 820, { tags: ["vegetarian"] }],
        ["Pica Quattro formaggi", 960, { tags: ["vegetarian"] }],
        ["Pica Prosciutto", 940],
        ["Pica Diavola", 900, { tags: ["spicy"] }],
        ["Pica Vegetariana", 840, { tags: ["vegetarian"] }],
        ["Pica Napolitana", 860, { allergens: ["gluten", "milk", "fish"] }],
        ["Pica Quattro stagioni", 920],
        ["Pica Tonno", 900, { allergens: ["gluten", "milk", "fish"] }],
        ["Pica sa rukolom i parmezanom", 960],
        ["Calzone", 880],
        ["Pica sa kulenom", 940, { tags: ["spicy"] }],
        ["Bela pica sa mocarelom", 840, { tags: ["vegetarian"] }],
      ],
    },
    {
      name: "Testenine i rižoto",
      dishIcon: "testenina",
      autoAllergens: ["gluten"],
      rows: [
        ["Špagete karbonara", 780, { allergens: ["gluten", "eggs", "milk"] }],
        ["Špagete bolonjeze", 740],
        ["Špagete aglio e olio", 560, { tags: ["vegan", "spicy"] }],
        ["Pene arabijata", 620, { tags: ["vegan", "spicy"] }],
        ["Pene sa piletinom i pečurkama", 780, { allergens: ["gluten", "milk"] }],
        ["Tagliatele sa lososom", 1050, { allergens: ["gluten", "fish", "milk"] }],
        ["Tagliatele sa tartufima", 1480, { allergens: ["gluten", "eggs", "milk"], tags: ["recommended"] }],
        ["Lazanje", 820, { allergens: ["gluten", "eggs", "milk"] }],
        ["Njoke sa gorgonzolom", 860, { allergens: ["gluten", "milk"] }],
        ["Njoke sa paradajzom", 720, { tags: ["vegetarian"] }],
        ["Ravioli sa spanaćem", 840, { allergens: ["gluten", "eggs", "milk"], tags: ["vegetarian"] }],
        ["Fusilli sa povrćem", 700, { tags: ["vegan"] }],
        ["Rižoto sa pečurkama", 760, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Rižoto sa piletinom", 790, { allergens: ["milk"] }],
        ["Rižoto sa morskim plodovima", 1380, { allergens: ["molluscs", "crustaceans"] }],
        ["Rižoto sa šparogama", 880, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Makarone sa sirom", 540, { allergens: ["gluten", "milk"], tags: ["vegetarian"] }],
        ["Makarone sa orasima", 420, { allergens: ["gluten", "nuts"], tags: ["vegetarian"] }],
      ],
    },
    {
      name: "Sa roštilja",
      description: "Meso sa roštilja služimo uz lepinju i luk.",
      dishIcon: "rostilj",
      rows: [
        [
          "Ćevapi",
          null,
          {
            desc: "Domaći ćevapi od mešanog mesa.",
            variants: [["5 komada", 520], ["10 komada", 880]],
            allergens: ["gluten"],
            tags: ["house_special"],
            icon: "cevapi",
          },
        ],
        ["Pljeskavica sa kajmakom", 780, { desc: "Pljeskavica punjena kajmakom.", allergens: ["gluten", "milk"], icon: "pljeskavica" }],
        ["Gurmanska pljeskavica", 920, { allergens: ["gluten", "milk"], icon: "pljeskavica" }],
        ["Vešalica", 1180, { groups: ["pecenje"] }],
        ["Karađorđeva šnicla", 1080, { desc: "Uvijena teleća šnicla punjena kajmakom, pohovana.", allergens: ["gluten", "eggs", "milk"] }],
        ["Pileći file na žaru", 890],
        ["Svinjski vrat", 1240, { groups: ["prilozi"] }],
        ["Ražnjići", 860],
        [
          "Mešano meso (za dvoje)",
          2480,
          {
            desc: "Ćevapi, pljeskavica, vešalica i ražnjići, uz dva priloga.",
            allergens: ["gluten", "milk"],
            tags: ["recommended"],
            groups: ["prilozi"],
            note: true,
          },
        ],
        ["Jagnjeći kotleti", 2150, { groups: ["pecenje"] }],
        ["Biftek na žaru", 2980, { groups: ["pecenje"], note: true }],
        ["Domaća kobasica", 780, { tags: ["spicy"] }],
        ["Rebarca na žaru", 1380],
        ["Pileći batak i zabatak", 840],
        ["Svinjska rebra u BBQ sosu", 1420, { allergens: ["mustard", "celery"] }],
        ["Teleći medaljoni", 1980, { groups: ["pecenje"] }],
        ["Ribeye steak", 3980, { groups: ["pecenje"], note: true, tags: ["recommended"] }],
        ["T-bone steak", 4200, { groups: ["pecenje"], note: true }],
        ["Ćuretina na žaru", 880],
        ["Punjena pljeskavica sa sirom", 860, { allergens: ["gluten", "milk"] }],
        ["Mix roštilj za četiri osobe", 4300, { desc: "Ćevapi, pljeskavice, vešalica, ražnjići, kobasice i prilozi.", allergens: ["gluten", "milk"] }],
        ["Jagnjeći ražnjići", 1680],
      ],
    },
    {
      name: "Glavna jela",
      rows: [
        ["Sarma", 820, { desc: "Domaća sarma sa dimljenim mesom.", tags: ["homemade"] }],
        ["Punjene paprike", 760, { tags: ["homemade"] }],
        ["Gulaš od junetine", 880],
        ["Pasulj sa kobasicom", 640, { tags: ["homemade"] }],
        ["Musaka", 690, { allergens: ["gluten", "eggs", "milk"] }],
        ["Pečena patka sa mlincima", 1680, { allergens: ["gluten", "eggs"] }],
        ["Pileći medaljoni u sosu od pečuraka", 1050, { allergens: ["milk"] }],
        ["Teleći paprikaš", 1280],
        ["Pileći paprikaš", 980],
        ["Bečka šnicla", 1180, { allergens: ["gluten", "eggs"] }],
        ["Pileća šnicla u sezamu", 920, { allergens: ["gluten", "eggs", "sesame"] }],
        ["Svinjski file u sosu od pečuraka", 1160, { allergens: ["milk"] }],
        ["Teleće rebro ispod sača", 2480, { desc: "Sporo pečeno, uz pečeni krompir.", tags: ["house_special"] }],
        ["Jagnjetina ispod sača", 2890, { desc: "Sporo pečena, uz pečeni krompir." }],
        ["Pečeno prase (porcija)", 1680],
        ["Punjena piletina", 1020, { allergens: ["milk"] }],
        ["Dinstano povrće sa pirinčem", 640, { tags: ["vegan"] }],
        ["Pečena pileća bedra", 860],
        ["Pržena džigerica", 720],
        ["Ćuftice u paradajz sosu", 780, { allergens: ["gluten", "eggs"] }],
        ["Domaći gulaš sa njokama", 920, { allergens: ["gluten", "eggs"] }],
        ["Pileći curry sa pirinčem", 860, { tags: ["spicy"] }],
        ["Svinjsko koleno", 1420, { desc: "Pečeno u pivu, uz kiseli kupus." }],
        ["Punjeni plavi patlidžan", 720, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Krompir paprikaš", 540, { tags: ["vegan"] }],
        ["Grašak sa teletinom", 880],
      ],
    },
    {
      name: "Ribe i morski plodovi",
      dishIcon: "riba",
      autoAllergens: ["fish"],
      rows: [
        ["Brancin na žaru", 1780],
        ["Orada na žaru", 1820],
        ["Pastrmka sa žara", 1390],
        ["Losos na žaru", 1980],
        ["Smuđ u sosu od belog vina", 1680, { allergens: ["fish", "sulphites"] }],
        ["Oslić pohovani", 1240, { allergens: ["fish", "gluten", "eggs"] }],
        ["Som na žaru", 1420],
        ["Lignje na žaru", 1380, { allergens: ["molluscs"] }],
        ["Gambori na žaru", 1880, { allergens: ["crustaceans"] }],
        ["Plata morskih plodova (za dvoje)", 4200, { allergens: ["fish", "molluscs", "crustaceans"], tags: ["recommended"] }],
        ["Riblji paprikaš", 1120, { tags: ["spicy"] }],
        ["Dagnje u belom vinu", 1240, { allergens: ["molluscs", "sulphites"] }],
      ],
    },
    {
      name: "Prilozi",
      rows: [
        ["Pomfrit", 260, { tags: ["vegan"] }],
        ["Pečeni krompir", 280, { tags: ["vegan"] }],
        ["Kajmak", 220, { allergens: ["milk"], icon: "kajmak" }],
        ["Ajvar", 150, { tags: ["vegan"], icon: "ajvar" }],
        ["Grilovano povrće", 380, { tags: ["vegan"] }],
        ["Pogača", 120, { allergens: ["gluten"] }],
        ["Pirinač sa povrćem", 240, { tags: ["vegan"] }],
        ["Kuvani krompir sa peršunom", 240, { tags: ["vegan"] }],
        ["Pire krompir", 260, { allergens: ["milk"], tags: ["vegetarian"] }],
        ["Pečurke na žaru", 340, { tags: ["vegan"] }],
        ["Prženi krompir", 280, { tags: ["vegan"] }],
        ["Kiseli kupus", 180, { tags: ["vegan"] }],
        ["Turšija", 200, { tags: ["vegan"] }],
        ["Mladi luk", 120, { tags: ["vegan"] }],
        ["Lepinja", 100, { allergens: ["gluten"] }],
        ["Povrće na pari", 320, { tags: ["vegan"] }],
      ],
    },
    {
      name: "Dečiji meni",
      rows: [
        ["Pileći medaljoni za decu", 520, { allergens: ["gluten", "eggs"] }],
        ["Pomfrit sa pohovanim piletinom", 540, { allergens: ["gluten", "eggs"] }],
        ["Mini pljeskavica sa pomfritom", 560],
        ["Špagete sa paradajz sosom", 420, { allergens: ["gluten"], tags: ["vegan"] }],
        ["Mini palačinke", 340, { allergens: ["gluten", "eggs", "milk"] }],
        ["Sladoled, dečija porcija", 220, { allergens: ["milk"], icon: "sladoled" }],
        ["Voćni tanjir za decu", 380, { tags: ["vegan"] }],
        ["Dečiji sok", 160, { qty: [0.2, "l"] }],
      ],
    },
    {
      name: "Dezerti",
      autoAllergens: ["gluten", "eggs", "milk"],
      rows: [
        ["Palačinke sa orasima", 420, { allergens: ["gluten", "eggs", "milk", "nuts"], icon: "palacinke" }],
        ["Tiramisu", 480],
        ["Baklava", 360, { allergens: ["gluten", "nuts"] }],
        ["Tufahije", 390, { allergens: ["nuts"] }],
        ["Čokoladni sufle", 520, { mayContain: ["nuts"] }],
        ["Sladoled, kugla", 130, { allergens: ["milk"], icon: "sladoled" }],
        ["Voćna salata", 340, { allergens: [], tags: ["vegan"] }],
        ["Panna cotta", 440, { allergens: ["milk"] }],
        ["Cheesecake", 460, { promo: promoPrice(390) }],
        ["Čokoladna torta", 420, { mayContain: ["nuts"] }],
        ["Štrudla sa jabukama", 380, { icon: "kolac" }],
        ["Krempita", 340],
        ["Profiterole", 440],
        ["Crème brûlée", 480],
        ["Lava kolač", 520],
        ["Sladoled sa toplim voćem", 460, { allergens: ["milk"] }],
        ["Sorbe od limuna", 320, { allergens: [], tags: ["vegan"] }],
        ["Kadaif", 400, { allergens: ["gluten", "nuts"] }],
        ["Hurmašice", 280, { allergens: ["gluten", "eggs"] }],
        ["Palačinke sa čokoladom i bananom", 440],
      ],
    },
    // ----- Pića --------------------------------------------------------------
    {
      name: "Kafe",
      rows: [
        ["Espresso", null, { icon: "kafa", variants: [["Mali", 170], ["Veliki", 210]] }],
        ["Dupli espresso", 240],
        ["Produžena kafa", 200],
        ["Domaća kafa", 190, { desc: "Kuvana u džezvi, uz čašu vode.", icon: "domaca kafa" }],
        ["Kafa sa mlekom", 220, { groups: ["kafa"] }],
        ["Cappuccino", 250, { groups: ["kafa"] }],
        ["Latte macchiato", 270, { groups: ["kafa"] }],
        ["Flat white", 260, { groups: ["kafa"] }],
        ["Mocha", 290, { groups: ["kafa"] }],
        ["Ledena kafa", 300, { groups: ["kafa"] }],
        ["Frape", 290],
        ["Irska kafa", 520],
        ["Bezkofeinska kafa", 230],
        ["Topla čokolada", 280, { desc: "Gusta, kuvana na mleku." }],
        ["Nes kafa", 200],
        ["Espresso macchiato", 210],
        ["Ristretto", 180],
        ["Affogato", 380],
      ],
    },
    {
      name: "Čajevi",
      rows: [
        ["Crni čaj", 190],
        ["Zeleni čaj", 190],
        ["Čaj od nane", 190],
        ["Čaj od kamilice", 190],
        ["Čaj od hibiskusa", 210],
        ["Voćni čaj", 210],
        ["Čaj od đumbira i limuna", 240],
        ["Čaj od lipe", 190],
        ["Planinski čaj", 210],
        ["Čaj od šipka", 210],
      ],
    },
    {
      name: "Sokovi i voda",
      rows: [
        ["Ceđena pomorandža", 340, { qty: [0.25, "l"] }],
        ["Ceđeni grejp", 360, { qty: [0.25, "l"] }],
        ["Sok od jabuke", 230, { qty: [0.2, "l"] }],
        ["Sok od jagode", 260, { qty: [0.2, "l"] }],
        ["Sok od breskve", 240, { qty: [0.2, "l"] }],
        ["Sok od višnje", 260, { qty: [0.2, "l"] }],
        ["Sok od crne ribizle", 270, { qty: [0.2, "l"] }],
        ["Sok od borovnice", 280, { qty: [0.2, "l"] }],
        ["Domaća limunada", 310, { qty: [0.4, "l"] }],
        ["Limunada sa nanom i đumbirom", 330, { qty: [0.4, "l"] }],
        ["Ledeni čaj od breskve", 250, { qty: [0.33, "l"] }],
        ["Ledeni čaj od limuna", 250, { qty: [0.33, "l"] }],
        ["Gazirani sok kola", 250, { qty: [0.25, "l"], icon: "sok" }],
        ["Gazirani sok narandža", 250, { qty: [0.25, "l"], icon: "sok" }],
        ["Gazirani sok limun", 250, { qty: [0.25, "l"], icon: "sok" }],
        ["Tonik", 260, { qty: [0.25, "l"] }],
        ["Gazirana mineralna voda", 200, { qty: [0.33, "l"], icon: "voda" }],
        ["Mineralna voda", 200, { qty: [0.33, "l"], icon: "voda" }],
        ["Negazirana voda", 190, { qty: [0.33, "l"], icon: "voda" }],
        ["Negazirana voda (velika)", 290, { qty: [0.75, "l"], icon: "voda" }],
        ["Smuti od jagode i banane", 420, { qty: [0.3, "l"], allergens: ["milk"] }],
        ["Energetski napitak", 330, { qty: [0.25, "l"] }],
      ],
    },
    {
      name: "Pivo",
      icon: "pivo",
      dishIcon: "pivo",
      autoAllergens: ["gluten"],
      unit: [0.33, "l"],
      rows: [
        ["Točeno pivo", null, { variants: [["0,3 l", 230], ["0,5 l", 330]], promo: promoPercent(10), allergens: ["gluten"] }],
        ["Točeno tamno pivo", 360, { qty: [0.5, "l"] }],
        ["Nefiltrirano točeno pivo", 380, { qty: [0.5, "l"] }],
        ["Flaširano svetlo pivo", 270],
        ["Flaširano tamno pivo", 290],
        ["Bezalkoholno pivo", 260],
        ["Craft IPA", 420],
        ["Craft Pale Ale", 410],
        ["Craft pšenično pivo", 410],
        ["Craft Stout", 430],
        ["Radler sa limunom", 280, { qty: [0.5, "l"] }],
        ["Radler sa grejpom", 280, { qty: [0.5, "l"] }],
        ["Pivo u limenci", 240, { qty: [0.5, "l"] }],
        ["Pšenično pivo, flaširano", 330, { qty: [0.5, "l"] }],
      ],
    },
    {
      name: "Žestoka pića",
      unit: [0.03, "l"],
      rows: [
        ["Šljivovica", 280, { icon: "rakija" }],
        ["Šljivovica, stara 10 godina", 480, { icon: "rakija" }],
        ["Kajsijevača", 300, { icon: "rakija" }],
        ["Dunjevača", 320, { icon: "rakija" }],
        ["Viljamovka", 320, { icon: "rakija" }],
        ["Lozovača", 280, { icon: "rakija" }],
        ["Medovača", 300, { icon: "rakija" }],
        ["Orahovača", 320, { icon: "rakija" }],
        ["Travarica", 280, { icon: "rakija" }],
        ["Višnjevača", 300, { icon: "rakija" }],
        ["Viski blend", 420],
        ["Viski burbon", 450],
        ["Viski single malt, 12 godina", 780],
        ["Viski single malt, 18 godina", 1480],
        ["Viski irski", 480],
        ["Viski ražani", 520],
        ["Džin London dry", 420],
        ["Džin ružičasti", 440],
        ["Džin sa začinima", 460],
        ["Votka", 360],
        ["Votka sa ukusom limuna", 380],
        ["Votka premium", 520],
        ["Rum beli", 380],
        ["Rum tamni", 420],
        ["Rum začinjeni", 440],
        ["Tekila srebrna", 420],
        ["Tekila zlatna", 460],
        ["Brendi", 380],
        ["Konjak VS", 640],
        ["Konjak XO", 1980],
      ],
    },
    {
      name: "Kokteli",
      description: "Svi kokteli se prave sa 0,05 l žestokog pića.",
      rows: [
        ["Mojito", 820],
        ["Margarita", 860],
        ["Cosmopolitan", 840],
        ["Old Fashioned", 920],
        ["Negroni", 880],
        ["Daiquiri", 800],
        ["Pina Colada", 860, { allergens: ["milk"] }],
        ["Moscow Mule", 840],
        ["Whiskey Sour", 880, { allergens: ["eggs"] }],
        ["Espresso Martini", 920],
        ["Tom Collins", 800],
        ["Long Island Iced Tea", 980],
        ["Caipirinha", 820],
        ["Mai Tai", 940, { allergens: ["nuts"] }],
        ["Manhattan", 940],
        ["Dry Martini", 900],
        ["Spritz", 780, { allergens: ["sulphites"] }],
        ["Bloody Mary", 820, { allergens: ["celery"], tags: ["spicy"] }],
        ["Sex on the Beach", 840],
        ["Cuba Libre", 760],
        ["Gin Tonic", 760],
        ["Hugo", 780, { allergens: ["sulphites"] }],
      ],
    },
    // ----- Vina --------------------------------------------------------------
    { name: "Bela vina", icon: "vino", dishIcon: "vino", rows: grapeRows(WHITE_GRAPES) },
    { name: "Crvena vina", icon: "vino", dishIcon: "vino", rows: grapeRows(RED_GRAPES) },
    {
      name: "Roze i penušava vina",
      icon: "vino",
      dishIcon: "vino",
      rows: [
        wineBottle("Roze Merlot 2024", 1900, "Sveže roze, note jagode."),
        wineBottle("Roze Prokupac 2024", 2000, "Voćno roze, note višnje."),
        wineBottle("Roze Vranac 2024", 1900, "Živo roze, note maline."),
        wineBottle("Roze Cabernet 2024", 2100, "Suvo roze, note crvenog voća."),
        wineBottle("Penušavo brut", 2900, "Suvo penušavo vino sa finim mehurićima."),
        wineBottle("Penušavo demi sec", 2800, "Poluslatko penušavo vino."),
        wineBottle("Penušavo roze brut", 3100, "Suvo roze penušavo, note jagode."),
        wineBottle("Penušavo Chardonnay blanc de blancs", 3400, "Elegantno, od belih sorti."),
        wineBottle("Penušavo Rezerva brut", 3900, "Dugo odležano, kremasto."),
        wineBottle("Penušavo muskat slatko", 2600, "Slatko, aromatično, uz dezert."),
      ],
    },
  ],
  pages: [
    {
      name: "Doručak",
      slug: "dorucak",
      publicTitle: "Doručak",
      sections: [
        { name: "Jaja i omleti", from: ["Jaja i omleti"] },
        { name: "Peciva i slatki doručak", from: ["Peciva i slatki doručak"] },
        { name: "Sirevi i suhomesnato", from: ["Sirevi i suhomesnato"] },
        { name: "Kafe", from: ["Kafe"] },
        { name: "Čajevi", from: ["Čajevi"] },
        { name: "Sokovi i voda", from: ["Sokovi i voda"] },
      ],
    },
    {
      name: "Bar",
      slug: "bar",
      publicTitle: "Bar",
      sections: [
        { name: "Kokteli", from: ["Kokteli"] },
        { name: "Pivo", from: ["Pivo"] },
        { name: "Žestoka pića", from: ["Žestoka pića"] },
      ],
    },
    {
      name: "Vinska karta",
      slug: "vinska-karta",
      publicTitle: "Vinska karta",
      sections: [
        { name: "Bela vina", from: ["Bela vina"] },
        { name: "Crvena vina", from: ["Crvena vina"] },
        { name: "Roze i penušava vina", from: ["Roze i penušava vina"] },
      ],
    },
  ],
  translationsEn: {
    "Kajgana sa sirom": "Scrambled eggs with cheese",
    "Omlet sa šunkom i sirom": "Ham and cheese omelette",
    "Jaja na oko (3 komada)": "Fried eggs (3 pcs)",
    "Jaja Benedikt": "Eggs Benedict",
    "Šakšuka": "Shakshuka",
    "Kroasan sa puterom": "Butter croissant",
    "Burek sa sirom": "Cheese burek",
    "Palačinke sa džemom": "Pancakes with jam",
    "Vafli sa voćem": "Waffles with fruit",
    "Ovsena kaša sa cimetom": "Oatmeal with cinnamon",
    "Francuski tost": "French toast",
    "Domaća pileća supa": "Homemade chicken soup",
    "Paradajz čorba": "Tomato soup",
    "Šopska salata": "Shopska salad",
    "Grčka salata": "Greek salad",
    "Cezar salata sa piletinom": "Chicken Caesar salad",
    "Sezonska salata": "Seasonal salad",
    "Ćevapi": "Cevapi (grilled minced meat)",
    "Pljeskavica sa kajmakom": "Pljeskavica with kajmak",
    "Mešano meso (za dvoje)": "Mixed grill (for two)",
    "Karađorđeva šnicla": "Karadjordje schnitzel",
    "Palačinke sa orasima": "Pancakes with walnuts",
    "Tiramisu": "Tiramisu",
    "Baklava": "Baklava",
    "Espresso": "Espresso",
    "Kafa sa mlekom": "Coffee with milk",
    "Domaća kafa": "Turkish-style coffee",
    "Topla čokolada": "Hot chocolate",
    "Ceđena pomorandža": "Fresh orange juice",
    "Domaća limunada": "Homemade lemonade",
    "Mineralna voda": "Mineral water",
    "Točeno pivo": "Draft beer",
  },
  roomService: {
    config: { markupBps: 1500, markupScope: "all", deliveryFeeRsd: 300 },
    categories: [
      {
        name: "Doručak u sobi",
        items: [
          "Kajgana sa sirom",
          "Kajgana sa slaninom",
          "Omlet sa šunkom i sirom",
          "Omlet sa pečurkama",
          "Jaja Benedikt",
          "Kroasan sa puterom",
          "Kroasan sa čokoladom",
          "Burek sa sirom",
          "Palačinke sa džemom",
          "Musli sa jogurtom i voćem",
          "Ovsena kaša sa cimetom",
          "Francuski tost",
        ],
      },
      {
        name: "Jela i užina",
        items: [
          ["Club sendvič", 950],
          "Klasični burger",
          "Čizburger",
          "Cezar salata sa piletinom",
          "Šopska salata",
          "Sezonska salata",
          "Domaća pileća supa",
          "Pica Margarita",
          "Pica Capricciosa",
          "Špagete karbonara",
          "Špagete bolonjeze",
          "Pileći medaljoni u sosu od pečuraka",
          "Karađorđeva šnicla",
          "Brancin na žaru",
          "Pljeskavica sa kajmakom",
          "Pohovani sir",
        ],
      },
      {
        name: "Pića i dezert",
        items: [
          "Mineralna voda",
          "Negazirana voda",
          "Ceđena pomorandža",
          "Domaća limunada",
          "Gazirani sok kola",
          ["Flaširano svetlo pivo", 350],
          "Bezalkoholno pivo",
          "Tiramisu",
          "Cheesecake",
          "Čokoladna torta",
          "Palačinke sa orasima",
          "Sladoled, kugla",
        ],
      },
    ],
  },
  unavailable: [
    "Teleće rebro ispod sača",
    "Pica Tonno",
    "Craft Stout",
    "Plata morskih plodova (za dvoje)",
  ],
};

// =============================================================================
// Entry point
// =============================================================================

const SPECS: Record<IzlogMenuSize, MenuSpec> = { mali: MALI, srednji: SREDNJI, veliki: VELIKI };

/** A fresh, deterministic menu of the given size. Every call builds a new object. */
export function fixtureMenu(size: IzlogMenuSize): IzlogMenu {
  return buildMenu(SPECS[size]);
}
