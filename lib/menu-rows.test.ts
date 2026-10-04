import { describe, expect, it } from "vitest";
import {
  itemDefaults,
  type MenuGroup,
  type MenuItem,
  type MenuModel,
} from "./menu-blocks";
import {
  countMenuRows,
  menuModelToRows,
  menuRowsToModel,
  type MenuRows,
} from "./menu-rows";

const MENU_ID = "menu_1";

function item(
  id: string,
  name: string,
  extra: Partial<MenuItem> = {},
): MenuItem {
  return { ...itemDefaults(), id, name, productType: "pice", ...extra };
}

// A full menu: every shape once, variants, pairings that cross groups, an
// optional-field mix (some items carry description/price/icon/photo, some
// none), dayparts, and a daypart override.
function sampleModel(): MenuModel {
  const rakija = item("i-rakija", "Šljivovica", {
    priceRsd: 250,
    variants: [
      { id: "v-03", label: "0.3 l", priceRsd: 250 },
      { id: "v-05", label: "0.5 l", priceRsd: 390 },
    ],
    pairings: [{ id: "p-rakija-meze", pairedItemId: "i-meze" }],
  });
  const kafa = item("i-kafa", "Domaća kafa", {
    productType: "domaca kafa",
    priceRsd: 180,
    description: "Sa ratlukom",
    iconKey: "turska kafa",
  });
  const meze = item("i-meze", "Meze plata", {
    productType: "kajmak",
    priceRsd: 1200,
    photoStorageId: "st_meze",
    pairings: [
      { id: "p-meze-rakija", pairedItemId: "i-rakija" },
      { id: "p-meze-vino", pairedItemId: "i-vino" },
    ],
  });
  const burek = item("i-burek", "Burek sa sirom", {
    productType: "burek",
    priceRsd: 320,
    available: false,
  });
  const cevapi = item("i-cevapi", "Ćevapi 10 kom", {
    productType: "cevapi",
    priceRsd: 890,
    description: "U lepinji, sa lukom",
    photoStorageId: "st_cevapi",
    videoStorageId: "st_cevapi_video",
  });
  const hit = item("i-hit", "Karađorđeva šnicla", {
    productType: "rostilj",
    priceRsd: 1490,
  });
  const vino = item("i-vino", "Prokupac", {
    productType: "vino",
    variants: [
      { id: "v-casa", label: "čaša", priceRsd: 350 },
      { id: "v-flasa", label: "flaša", priceRsd: 1900 },
    ],
  });
  const voda = item("i-voda", "Kisela voda", {
    productType: "voda",
    priceRsd: 150,
  });

  const groups: MenuGroup[] = [
    {
      shape: "lista",
      base: { id: "g-pice", title: "Piće", iconKey: "sok" },
      items: [rakija, kafa, voda],
    },
    {
      shape: "galerija",
      base: { id: "g-jela", title: "Jela" },
      items: [meze, cevapi],
    },
    {
      shape: "traka",
      base: { id: "g-dnevno", title: "Dnevna ponuda", daypartKey: "rucak" },
      items: [burek],
    },
    {
      shape: "istaknuto",
      base: { id: "g-hit", title: "Specijalitet kuće" },
      items: [hit],
    },
    {
      shape: "tabela_varijanti",
      base: { id: "g-vina", title: "Vina", daypartKey: "vecera" },
      items: [vino],
    },
  ];

  return {
    groups,
    dayparts: [
      { id: "d-dorucak", key: "dorucak", label: "Doručak", startMinute: 420, endMinute: 660 },
      { id: "d-rucak", key: "rucak", label: "Ručak", startMinute: 660, endMinute: 1020 },
      { id: "d-vecera", key: "vecera", label: "Večera", startMinute: 1020, endMinute: 1380 },
    ],
    daypartOverride: "rucak",
  };
}

describe("menuModelToRows (inline → §2.13 rows)", () => {
  it("assigns every order column from array position, 0-based per parent", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    expect(rows.groups.map((g) => g.order)).toEqual([0, 1, 2, 3, 4]);
    expect(
      rows.items
        .filter((i) => i.groupId === "g-pice")
        .map((i) => [i.id, i.order]),
    ).toEqual([
      ["i-rakija", 0],
      ["i-kafa", 1],
      ["i-voda", 2],
    ]);
    expect(
      rows.variants.filter((v) => v.itemId === "i-vino").map((v) => v.order),
    ).toEqual([0, 1]);
    expect(
      rows.pairings.filter((p) => p.itemId === "i-meze").map((p) => p.order),
    ).toEqual([0, 1]);
    expect(rows.dayparts.map((d) => d.order)).toEqual([0, 1, 2]);
  });

  it("stamps menuId on the menu-keyed tables and never emits an undefined column", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    for (const row of [...rows.groups, ...rows.items, ...rows.dayparts]) {
      expect(row.menuId).toBe(MENU_ID);
    }
    for (const table of Object.values(rows)) {
      for (const row of table) {
        for (const [key, value] of Object.entries(row)) {
          expect(value, `${key} must be absent, not undefined`).not.toBeUndefined();
        }
      }
    }
    // An absent optional stays absent; a present one is copied.
    const voda = rows.items.find((i) => i.id === "i-voda")!;
    expect("description" in voda).toBe(false);
    const kafa = rows.items.find((i) => i.id === "i-kafa")!;
    expect(kafa.description).toBe("Sa ratlukom");
    expect(kafa.iconKey).toBe("turska kafa");
  });

  it("counts every row a publish would write", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    // 5 groups + 8 items + 4 variants + 3 pairings + 3 dayparts
    expect(countMenuRows(rows)).toBe(5 + 8 + 4 + 3 + 3);
  });
});

describe("round trip — the two translators must not diverge (§4 TASK-51)", () => {
  it("inline → rows → inline is lossless", () => {
    const model = sampleModel();
    const rows = menuModelToRows(model, MENU_ID);
    const back = menuRowsToModel(rows, { daypartOverride: model.daypartOverride });
    expect(back).toStrictEqual(model);
  });

  it("rows → inline → rows is lossless for canonical rows", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    const again = menuModelToRows(
      menuRowsToModel(rows, { daypartOverride: "rucak" }),
      MENU_ID,
    );
    expect(again).toStrictEqual(rows);
    expect(countMenuRows(again)).toBe(countMenuRows(rows));
  });

  it("an empty menu round-trips both ways", () => {
    const empty: MenuModel = { groups: [], dayparts: [] };
    const rows = menuModelToRows(empty, MENU_ID);
    expect(countMenuRows(rows)).toBe(0);
    expect(menuRowsToModel(rows)).toStrictEqual(empty);
    expect(menuModelToRows(menuRowsToModel(rows), MENU_ID)).toStrictEqual(rows);
  });

  it("daypartOverride rides beside the rows, absent when not given", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    expect("daypartOverride" in menuRowsToModel(rows)).toBe(false);
    expect(
      menuRowsToModel(rows, { daypartOverride: "vecera" }).daypartOverride,
    ).toBe("vecera");
  });
});

describe("menuRowsToModel (§2.13 rows → inline)", () => {
  it("sorts every table by its order column, whatever the input order or gaps", () => {
    const model = sampleModel();
    const canonical = menuModelToRows(model, MENU_ID);
    // Shuffle rows and spread orders out (5, 15, 25 …) — a table after a few
    // reorders looks like this.
    const scramble = <T extends { order: number }>(table: T[]): T[] =>
      table.map((row) => ({ ...row, order: row.order * 10 + 5 })).reverse();
    const messy: MenuRows = {
      groups: scramble(canonical.groups),
      items: scramble(canonical.items),
      variants: scramble(canonical.variants),
      pairings: scramble(canonical.pairings),
      dayparts: scramble(canonical.dayparts),
    };
    const back = menuRowsToModel(messy, { daypartOverride: "rucak" });
    expect(back).toStrictEqual(model);
    // …and re-flattening renumbers contiguously from 0.
    expect(menuModelToRows(back, MENU_ID)).toStrictEqual(canonical);
  });

  it("drops orphan rows that cannot be placed in the tree", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    rows.items.push({
      id: "i-orphan",
      menuId: MENU_ID,
      groupId: "g-nema",
      name: "Siroče",
      productType: "sok",
      available: true,
      order: 0,
    });
    rows.variants.push({
      id: "v-orphan",
      itemId: "i-nema",
      label: "x",
      priceRsd: 1,
      order: 0,
    });
    rows.pairings.push({
      id: "p-orphan",
      itemId: "i-nema",
      pairedItemId: "i-kafa",
      order: 0,
    });
    const model = menuRowsToModel(rows);
    const allItems = model.groups.flatMap((g) => g.items);
    expect(allItems.find((i) => i.id === "i-orphan")).toBeUndefined();
    expect(
      allItems.flatMap((i) => i.variants).find((v) => v.id === "v-orphan"),
    ).toBeUndefined();
    expect(
      allItems.flatMap((i) => i.pairings).find((p) => p.id === "p-orphan"),
    ).toBeUndefined();
  });

  it("keeps a pairing whose target is not in the rows (the relation is data, not a tree edge)", () => {
    const model = sampleModel();
    model.groups[0].items[0].pairings = [
      { id: "p-dangling", pairedItemId: "i-obrisan" },
    ];
    const rows = menuModelToRows(model, MENU_ID);
    const back = menuRowsToModel(rows);
    expect(back.groups[0].items[0].pairings).toEqual([
      { id: "p-dangling", pairedItemId: "i-obrisan" },
    ]);
  });

  it("nests variants and pairings under their own item only", () => {
    const rows = menuModelToRows(sampleModel(), MENU_ID);
    const model = menuRowsToModel(rows);
    const byId = new Map(
      model.groups.flatMap((g) => g.items).map((i) => [i.id, i]),
    );
    expect(byId.get("i-vino")!.variants.map((v) => v.label)).toEqual([
      "čaša",
      "flaša",
    ]);
    expect(byId.get("i-rakija")!.variants.map((v) => v.label)).toEqual([
      "0.3 l",
      "0.5 l",
    ]);
    expect(byId.get("i-kafa")!.variants).toEqual([]);
    expect(byId.get("i-meze")!.pairings.map((p) => p.pairedItemId)).toEqual([
      "i-rakija",
      "i-vino",
    ]);
    expect(byId.get("i-voda")!.pairings).toEqual([]);
  });
});
