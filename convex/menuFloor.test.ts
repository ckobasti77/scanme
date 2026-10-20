/// <reference types="vite/client" />

// ScanMe Menu V1 — K20: zones, positions and the floor layout (master §9).
// Tables, rooms and other spots are operational data: they apply at once and
// never touch the draft. Everything needs "venue.edit" (owner, manager, ScanMe
// admin); every id from an argument is checked against the caller's tenant.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { FLOOR_ERROR } from "../lib/menu/errors/floor";
import {
  FLOOR_COLUMNS,
  isValidLayout,
  overlaps,
  type FloorLayout,
} from "../lib/menu/floor-layout";
import { isMenuKey, newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_POSITION_BATCH,
  MENU_MAX_POSITIONS,
  MENU_MAX_SEATS,
  MENU_MAX_ZONES,
} from "../lib/menu/limits";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  seedQrLink,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;
type Client = ReturnType<typeof as>;
type PositionKind = Doc<"menuPositions">["kind"];

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function world(t: T) {
  return await t.run(async (ctx) => await seedMenuWorld(ctx));
}

// -----------------------------------------------------------------------------
// Reads straight from the tables
// -----------------------------------------------------------------------------

async function zonesOf(t: T, menuServiceId: Id<"menuServices">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuZones")
      .withIndex("by_menuServiceId_and_nameNormalized", (q) =>
        q.eq("menuServiceId", menuServiceId),
      )
      .collect(),
  );
  return rows.sort((a, b) => a.order - b.order);
}

async function positionsOf(t: T, menuServiceId: Id<"menuServices">) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuPositions")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.sort((a, b) => a.order - b.order);
}

async function positionOf(t: T, positionId: Id<"menuPositions">) {
  const row = await t.run(async (ctx) => ctx.db.get(positionId));
  if (!row) throw new Error("position missing");
  return row;
}

async function zoneOf(t: T, zoneId: Id<"menuZones">) {
  const row = await t.run(async (ctx) => ctx.db.get(zoneId));
  if (!row) throw new Error("zone missing");
  return row;
}

async function stateOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
}

async function auditOf(t: T, menuServiceId: Id<"menuServices">, action: string) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.filter((row) => row.action === action);
}

/** Everything the floor writes for one service, for "nothing changed" checks. */
async function snapshot(t: T, menuServiceId: Id<"menuServices">) {
  return {
    zones: await zonesOf(t, menuServiceId),
    positions: await positionsOf(t, menuServiceId),
    state: await stateOf(t, menuServiceId),
    zoneAudit: await auditOf(t, menuServiceId, "zone.archived"),
    positionAudit: await auditOf(t, menuServiceId, "position.archived"),
  };
}

// -----------------------------------------------------------------------------
// Builders (through the public functions, as the owner of venue A)
// -----------------------------------------------------------------------------

async function newZone(t: T, w: MenuWorldSeed, name: string) {
  const { zoneId } = await as(t, w.ownerId).mutation(api.menuFloor.createZone, {
    slug: SLUG_A,
    name,
  });
  return zoneId;
}

async function newPosition(
  t: T,
  w: MenuWorldSeed,
  label: string,
  options: { kind?: PositionKind; seats?: number | null; zoneId?: Id<"menuZones"> | null } = {},
) {
  const { positionId } = await as(t, w.ownerId).mutation(api.menuFloor.createPosition, {
    slug: SLUG_A,
    kind: options.kind ?? "table",
    label,
    seats: options.seats ?? null,
    zoneId: options.zoneId ?? null,
  });
  return positionId;
}

/** `count` active positions with stored 1x1 layouts, inserted directly (limits, batches). */
async function fillPositions(t: T, menuServiceId: Id<"menuServices">, count: number) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("menuPositions", {
        menuServiceId,
        key: newMenuKey("position"),
        kind: "table",
        label: `Stub ${index}`,
        labelNormalized: `stub ${index}`,
        layout: {
          x: index % FLOOR_COLUMNS,
          y: Math.floor(index / FLOOR_COLUMNS),
          w: 1,
          h: 1,
          shape: "rect",
        },
        order: index,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

/** One active position with NO stored layout (the plan places it by order). */
async function insertUnplaced(t: T, menuServiceId: Id<"menuServices">, label: string, order = 1) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: newMenuKey("position"),
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      order,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

function layoutItems(rows: readonly Doc<"menuPositions">[]) {
  return rows.map((row) => {
    if (!row.layout) throw new Error("test: layout missing");
    return { positionId: row._id, layout: row.layout };
  });
}

/** Every layout is concrete, valid and clear of all the others. */
function expectTidy(layouts: ReadonlyArray<FloorLayout | undefined>) {
  const placed: FloorLayout[] = [];
  for (const layout of layouts) {
    expect(layout).toBeDefined();
    if (layout) placed.push(layout);
  }
  placed.forEach((layout, index) => {
    expect(isValidLayout(layout)).toBe(true);
    for (const other of placed.slice(index + 1)) expect(overlaps(layout, other)).toBe(false);
  });
}

function layoutsIn(rows: readonly Doc<"menuPositions">[], zoneId?: Id<"menuZones">) {
  return rows.filter((row) => row.active && row.zoneId === zoneId).map((row) => row.layout);
}

const SPOT: FloorLayout = { x: 10, y: 10, w: 2, h: 2, shape: "rect" };

// =============================================================================
// overview
// =============================================================================

describe("overview", () => {
  test("is null for the editor, finance, view-only, outsiders, the owner of another business, signed-out callers and unknown slugs", async () => {
    const t = newTest();
    const w = await world(t);
    await newZone(t, w, "Terasa");
    await newPosition(t, w, "Sto 1");
    for (const userId of [w.editorId, w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(await as(t, userId).query(api.menuFloor.overview, { slug: SLUG_A })).toBeNull();
    }
    expect(await t.query(api.menuFloor.overview, { slug: SLUG_A })).toBeNull();
    expect(
      await as(t, w.ownerId).query(api.menuFloor.overview, { slug: "nema-takvog-lokala" }),
    ).toBeNull();
    expect(await as(t, w.ownerId).query(api.menuFloor.overview, { slug: "Nije slug!" })).toBeNull();
  });

  test("the owner, the manager and the ScanMe admin see the same zones and positions", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    await newPosition(t, w, "Sto 1", { seats: 4, zoneId: terasa });
    const seen = [];
    for (const userId of [w.ownerId, w.managerId, w.adminId]) {
      const data = await as(t, userId).query(api.menuFloor.overview, { slug: SLUG_A });
      expect(data).not.toBeNull();
      seen.push(data);
    }
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
    expect(seen[0]?.zones).toHaveLength(1);
    expect(seen[0]?.positions).toHaveLength(1);
  });

  test("lists only active rows, ordered, in the model shape, and never another business's rows", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    const sala = await newZone(t, w, "Sala");
    const basta = await newZone(t, w, "Bašta");
    await as(t, w.ownerId).mutation(api.menuFloor.moveZone, { zoneId: basta, direction: "up" });
    await as(t, w.ownerId).mutation(api.menuFloor.archiveZone, { zoneId: sala });

    const first = await newPosition(t, w, "Sto 1", { seats: 4, zoneId: terasa });
    await newPosition(t, w, "Sto 2", { kind: "room" });
    const gone = await newPosition(t, w, "Sto 3");
    await as(t, w.ownerId).mutation(api.menuFloor.archivePosition, { positionId: gone });

    await as(t, w.otherOwnerId).mutation(api.menuFloor.createZone, { slug: SLUG_B, name: "Tuđa zona" });
    await as(t, w.otherOwnerId).mutation(api.menuFloor.createPosition, {
      slug: SLUG_B,
      kind: "table",
      label: "Tuđ sto",
      seats: null,
      zoneId: null,
    });

    const data = await as(t, w.ownerId).query(api.menuFloor.overview, { slug: SLUG_A });
    expect(data?.zones.map((zone) => zone.name)).toEqual(["Terasa", "Bašta"]);
    expect(data?.zones[0]).toEqual({
      id: terasa,
      key: (await zoneOf(t, terasa)).key,
      name: "Terasa",
      order: 0,
    });
    expect(data?.positions.map((position) => position.label)).toEqual(["Sto 1", "Sto 2"]);
    expect(data?.positions[0]).toMatchObject({
      id: first,
      kind: "table",
      label: "Sto 1",
      seats: 4,
      zoneId: terasa,
    });
    expect(data?.positions[0].layout).not.toBeNull();
    expect(data?.positions[1]).toMatchObject({ kind: "room", seats: null, zoneId: null });
    expect(data?.positions[0].order).toBeLessThan(data?.positions[1].order ?? 0);
  });

  test("shows no layout for a position that has none yet", async () => {
    const t = newTest();
    const w = await world(t);
    await insertUnplaced(t, w.a.menuServiceId, "Sto 9");
    const data = await as(t, w.ownerId).query(api.menuFloor.overview, { slug: SLUG_A });
    expect(data?.positions).toHaveLength(1);
    expect(data?.positions[0]).toMatchObject({ label: "Sto 9", seats: null, zoneId: null, layout: null });
  });
});

// =============================================================================
// zones
// =============================================================================

describe("createZone", () => {
  test("cleans the name, issues a zn_ key and appends after the last active zone", async () => {
    const t = newTest();
    const w = await world(t);
    const first = await newZone(t, w, "  Terasa   gore ");
    const second = await newZone(t, w, "Sala");
    const a = await zoneOf(t, first);
    const b = await zoneOf(t, second);
    expect(a).toMatchObject({
      name: "Terasa gore",
      nameNormalized: "terasa gore",
      active: true,
      order: 0,
      menuServiceId: w.a.menuServiceId,
    });
    expect(isMenuKey(a.key, "zone")).toBe(true);
    expect(b.order).toBe(1);
    expect(b.key).not.toBe(a.key);

    // The last ACTIVE zone decides the order: archiving the second reuses its slot.
    await as(t, w.ownerId).mutation(api.menuFloor.archiveZone, { zoneId: second });
    const third = await zoneOf(t, await newZone(t, w, "Bašta"));
    expect(third.order).toBe(1);
  });

  test("a name is unique among active zones, ignoring case, diacritics and punctuation; archiving frees it", async () => {
    const t = newTest();
    const w = await world(t);
    const basta = await newZone(t, w, "Bašta");
    for (const name of ["BASTA", " basta ", "Bašta!", "Bašta."]) {
      await expect(newZone(t, w, name)).rejects.toThrow(FLOOR_ERROR.zoneNameTaken);
    }
    await newZone(t, w, "Bašta 2");
    // Another venue may use the same name.
    await as(t, w.otherOwnerId).mutation(api.menuFloor.createZone, { slug: SLUG_B, name: "Bašta" });
    expect(await zonesOf(t, w.a.menuServiceId)).toHaveLength(2);

    await as(t, w.ownerId).mutation(api.menuFloor.archiveZone, { zoneId: basta });
    await newZone(t, w, "basta");
    expect((await zonesOf(t, w.a.menuServiceId)).filter((zone) => zone.active)).toHaveLength(2);
  });

  test("refuses an empty, blank, over-long or punctuation-only name and writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await snapshot(t, w.a.menuServiceId);
    for (const name of ["", "   ", "x".repeat(61), "!!!"]) {
      await expect(newZone(t, w, name)).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    await newZone(t, w, "z".repeat(60));
    expect(await zonesOf(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test(`allows at most ${MENU_MAX_ZONES} active zones; a taken name is reported before the limit`, async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_ZONES; index += 1) {
        await ctx.db.insert("menuZones", {
          menuServiceId: w.a.menuServiceId,
          key: newMenuKey("zone"),
          name: `Zona ${index}`,
          nameNormalized: `zona ${index}`,
          order: index,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    await expect(newZone(t, w, "Nova zona")).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(newZone(t, w, "Zona 3")).rejects.toThrow(FLOOR_ERROR.zoneNameTaken);

    const zones = await zonesOf(t, w.a.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuFloor.archiveZone, { zoneId: zones[0]._id });
    await newZone(t, w, "Nova zona");
    expect((await zonesOf(t, w.a.menuServiceId)).filter((zone) => zone.active)).toHaveLength(
      MENU_MAX_ZONES,
    );
  });
});

describe("renameZone", () => {
  test("renames, keeps the key and order, and allows changing only the case of its own name", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    const before = await zoneOf(t, terasa);
    const owner = as(t, w.ownerId);

    expect(await owner.mutation(api.menuFloor.renameZone, { zoneId: terasa, name: " Bašta  gore " })).toBeNull();
    expect(await zoneOf(t, terasa)).toMatchObject({
      name: "Bašta gore",
      nameNormalized: "basta gore",
      key: before.key,
      order: before.order,
    });

    await owner.mutation(api.menuFloor.renameZone, { zoneId: terasa, name: "BAŠTA GORE" });
    expect((await zoneOf(t, terasa)).name).toBe("BAŠTA GORE");

    // The same name again is a no-op: nothing is written.
    const same = await zoneOf(t, terasa);
    await owner.mutation(api.menuFloor.renameZone, { zoneId: terasa, name: "BAŠTA GORE" });
    expect(await zoneOf(t, terasa)).toEqual(same);
  });

  test("refuses another active zone's name, bad names and an archived zone", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    const sala = await newZone(t, w, "Sala");
    const owner = as(t, w.ownerId);
    await expect(
      owner.mutation(api.menuFloor.renameZone, { zoneId: terasa, name: "sala" }),
    ).rejects.toThrow(FLOOR_ERROR.zoneNameTaken);
    for (const name of ["", "  ", "y".repeat(61)]) {
      await expect(
        owner.mutation(api.menuFloor.renameZone, { zoneId: terasa, name }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    await owner.mutation(api.menuFloor.archiveZone, { zoneId: sala });
    await expect(
      owner.mutation(api.menuFloor.renameZone, { zoneId: sala, name: "Nova" }),
    ).rejects.toThrow(FLOOR_ERROR.zoneArchived);
    // An archived zone's name is free again.
    await owner.mutation(api.menuFloor.renameZone, { zoneId: terasa, name: "Sala" });
    expect((await zoneOf(t, terasa)).name).toBe("Sala");
  });
});

describe("moveZone", () => {
  test("swaps with the neighbouring active zone; at the edge nothing happens", async () => {
    const t = newTest();
    const w = await world(t);
    const a = await newZone(t, w, "Prva");
    const b = await newZone(t, w, "Druga");
    const c = await newZone(t, w, "Treća");
    const owner = as(t, w.ownerId);
    const names = async () => (await zonesOf(t, w.a.menuServiceId)).map((zone) => zone.name);

    expect(await owner.mutation(api.menuFloor.moveZone, { zoneId: b, direction: "up" })).toBeNull();
    expect(await names()).toEqual(["Druga", "Prva", "Treća"]);
    await owner.mutation(api.menuFloor.moveZone, { zoneId: c, direction: "up" });
    expect(await names()).toEqual(["Druga", "Treća", "Prva"]);

    const before = await snapshot(t, w.a.menuServiceId);
    await owner.mutation(api.menuFloor.moveZone, { zoneId: b, direction: "up" });
    await owner.mutation(api.menuFloor.moveZone, { zoneId: a, direction: "down" });
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("skips archived zones and refuses an archived zone", async () => {
    const t = newTest();
    const w = await world(t);
    const a = await newZone(t, w, "Prva");
    const b = await newZone(t, w, "Druga");
    const c = await newZone(t, w, "Treća");
    const owner = as(t, w.ownerId);
    await owner.mutation(api.menuFloor.archiveZone, { zoneId: b });

    await owner.mutation(api.menuFloor.moveZone, { zoneId: c, direction: "up" });
    const data = await owner.query(api.menuFloor.overview, { slug: SLUG_A });
    expect(data?.zones.map((zone) => zone.name)).toEqual(["Treća", "Prva"]);
    await expect(
      owner.mutation(api.menuFloor.moveZone, { zoneId: b, direction: "down" }),
    ).rejects.toThrow(FLOOR_ERROR.zoneArchived);
    expect((await zoneOf(t, a)).order).toBeGreaterThan((await zoneOf(t, c)).order);
  });
});

describe("archiveZone", () => {
  test("moves the zone's positions to Bez zone on free spots, keeps their size, leaves everything else alone and writes one audit row", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    const sala = await newZone(t, w, "Sala");
    const owner = as(t, w.ownerId);

    const free1 = await newPosition(t, w, "Šank 1");
    const free2 = await newPosition(t, w, "Šank 2");
    const t1 = await newPosition(t, w, "Sto 1", { zoneId: terasa });
    const t2 = await newPosition(t, w, "Sto 2", { zoneId: terasa });
    const t3 = await newPosition(t, w, "Sto 3", { zoneId: terasa });
    const s1 = await newPosition(t, w, "Sto 4", { zoneId: sala });
    await owner.mutation(api.menuFloor.setLayout, {
      positionId: t2,
      layout: { x: 10, y: 4, w: 2, h: 2, shape: "round" },
    });
    const untouched = [await positionOf(t, free1), await positionOf(t, free2), await positionOf(t, s1)];

    const result = await owner.mutation(api.menuFloor.archiveZone, { zoneId: terasa });
    expect(result).toEqual({ movedPositions: 3 });
    const zone = await zoneOf(t, terasa);
    expect(zone.active).toBe(false);

    for (const [id, label] of [
      [t1, "Sto 1"],
      [t2, "Sto 2"],
      [t3, "Sto 3"],
    ] as const) {
      const row = await positionOf(t, id);
      expect(row).toMatchObject({ label, active: true });
      expect(row.zoneId).toBeUndefined();
    }
    expect((await positionOf(t, t2)).layout).toMatchObject({ w: 2, h: 2, shape: "round" });
    expect([await positionOf(t, free1), await positionOf(t, free2), await positionOf(t, s1)]).toEqual(
      untouched,
    );
    const rows = await positionsOf(t, w.a.menuServiceId);
    expect(layoutsIn(rows)).toHaveLength(5);
    expectTidy(layoutsIn(rows));

    const audit = await auditOf(t, w.a.menuServiceId, "zone.archived");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "zone",
      entityKey: zone.key,
      details: { name: "Terasa", movedPositions: 3 },
    });

    const data = await owner.query(api.menuFloor.overview, { slug: SLUG_A });
    expect(data?.zones.map((row) => row.name)).toEqual(["Sala"]);
    expect(data?.positions.filter((row) => row.zoneId === null)).toHaveLength(5);

    // Archiving again changes nothing and writes no second audit row.
    expect(await owner.mutation(api.menuFloor.archiveZone, { zoneId: terasa })).toEqual({
      movedPositions: 0,
    });
    expect(await auditOf(t, w.a.menuServiceId, "zone.archived")).toHaveLength(1);
  });

  test("an empty zone archives with movedPositions 0, the admin is audited as admin, and an archived zone takes no new positions", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    const result = await as(t, w.adminId).mutation(api.menuFloor.archiveZone, { zoneId: terasa });
    expect(result).toEqual({ movedPositions: 0 });
    const audit = await auditOf(t, w.a.menuServiceId, "zone.archived");
    expect(audit[0]).toMatchObject({ actorKind: "admin", details: { movedPositions: 0 } });
    await expect(newPosition(t, w, "Sto 1", { zoneId: terasa })).rejects.toThrow(
      FLOOR_ERROR.zoneArchived,
    );
  });
});

// =============================================================================
// positions: create
// =============================================================================

describe("createPosition", () => {
  test("stores a cleaned, keyed, ordered position on a concrete free spot of its own surface", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");

    const first = await positionOf(t, await newPosition(t, w, "  Sto   Šest ", { seats: 4 }));
    expect(first).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      kind: "table",
      label: "Sto Šest",
      labelNormalized: "sto sest",
      seats: 4,
      active: true,
      layout: { x: 0, y: 0, w: 3, h: 2, shape: "rect" },
    });
    expect(isMenuKey(first.key, "position")).toBe(true);
    expect(first.zoneId).toBeUndefined();

    const second = await positionOf(t, await newPosition(t, w, "Terasa bar", { kind: "other" }));
    expect(second).not.toHaveProperty("seats");
    expect(second.layout).toMatchObject({ w: 4, h: 2, shape: "rect" });
    expect(second.order).toBeGreaterThan(first.order);

    // Another surface starts at the origin again.
    const inZone = await positionOf(t, await newPosition(t, w, "Sto 1", { kind: "room", zoneId: terasa }));
    expect(inZone.zoneId).toBe(terasa);
    expect(inZone.layout).toMatchObject({ x: 0, y: 0, w: 3, h: 2 });
    expect(inZone.order).toBeGreaterThan(second.order);

    expectTidy(layoutsIn(await positionsOf(t, w.a.menuServiceId)));
  });

  test("refuses bad labels, seats and zones, and writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const archived = await newZone(t, w, "Stara");
    await as(t, w.ownerId).mutation(api.menuFloor.archiveZone, { zoneId: archived });
    const foreign = (
      await as(t, w.otherOwnerId).mutation(api.menuFloor.createZone, { slug: SLUG_B, name: "Tuđa" })
    ).zoneId;
    const before = await snapshot(t, w.a.menuServiceId);

    for (const label of ["", "   ", "x".repeat(41), "---"]) {
      await expect(newPosition(t, w, label)).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    for (const seats of [0, -1, MENU_MAX_SEATS + 1, 2.5]) {
      await expect(newPosition(t, w, "Sto 1", { seats })).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    await expect(newPosition(t, w, "Sto 1", { zoneId: archived })).rejects.toThrow(
      FLOOR_ERROR.zoneArchived,
    );
    await expect(newPosition(t, w, "Sto 1", { zoneId: foreign })).rejects.toThrow(MENU_ERROR.notFound);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // The boundaries themselves are fine.
    await newPosition(t, w, "a".repeat(40), { seats: 1 });
    await newPosition(t, w, "Sto 99", { seats: MENU_MAX_SEATS });
    expect(await positionsOf(t, w.a.menuServiceId)).toHaveLength(2);
  });

  test("a label is unique among active positions, ignoring case and diacritics, across zones; archiving frees it", async () => {
    const t = newTest();
    const w = await world(t);
    const terasa = await newZone(t, w, "Terasa");
    const owner = as(t, w.ownerId);
    const sest = await newPosition(t, w, "Sto Šest");
    for (const label of ["sto sest", "STO  ŠEST", "Sto-Šest"]) {
      await expect(newPosition(t, w, label)).rejects.toThrow(FLOOR_ERROR.positionLabelTaken);
    }
    await expect(newPosition(t, w, "Sto Šest", { zoneId: terasa })).rejects.toThrow(
      FLOOR_ERROR.positionLabelTaken,
    );
    // Another venue may use the same label.
    await as(t, w.otherOwnerId).mutation(api.menuFloor.createPosition, {
      slug: SLUG_B,
      kind: "table",
      label: "Sto Šest",
      seats: null,
      zoneId: null,
    });

    await owner.mutation(api.menuFloor.archivePosition, { positionId: sest });
    const again = await newPosition(t, w, "sto šest");
    expect(again).not.toBe(sest);
    const rows = await positionsOf(t, w.a.menuServiceId);
    expect(rows.map((row) => row.active)).toEqual([false, true]);
  });
});

describe("createPositions", () => {
  test("creates Sto 1..5 in one call, in order, each on its own free spot", async () => {
    const t = newTest();
    const w = await world(t);
    const { positionIds } = await as(t, w.ownerId).mutation(api.menuFloor.createPositions, {
      slug: SLUG_A,
      kind: "table",
      prefix: "Sto",
      from: 1,
      count: 5,
      seats: 4,
      zoneId: null,
    });
    expect(positionIds).toHaveLength(5);
    const rows = await positionsOf(t, w.a.menuServiceId);
    expect(rows.map((row) => row.label)).toEqual(["Sto 1", "Sto 2", "Sto 3", "Sto 4", "Sto 5"]);
    expect(rows.map((row) => row._id)).toEqual(positionIds);
    expect(rows.every((row) => row.seats === 4 && row.kind === "table" && row.active)).toBe(true);
    expect(new Set(rows.map((row) => row.key)).size).toBe(5);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index].order).toBeGreaterThan(rows[index - 1].order);
    }
    expectTidy(layoutsIn(rows));

    // The next batch continues after the last one, inside a zone, from 0.
    const terasa = await newZone(t, w, "Terasa");
    const next = await as(t, w.ownerId).mutation(api.menuFloor.createPositions, {
      slug: SLUG_A,
      kind: "room",
      prefix: "  Soba ",
      from: 0,
      count: 3,
      seats: null,
      zoneId: terasa,
    });
    const all = await positionsOf(t, w.a.menuServiceId);
    expect(all.slice(5).map((row) => row.label)).toEqual(["Soba 0", "Soba 1", "Soba 2"]);
    expect(all.slice(5).map((row) => row._id)).toEqual(next.positionIds);
    expect(all[5].order).toBeGreaterThan(all[4].order);
    expectTidy(layoutsIn(all, terasa));
    expectTidy(layoutsIn(all));
  });

  test("refuses the whole batch when one label is taken, and writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    await newPosition(t, w, "Sto 3");
    const before = await snapshot(t, w.a.menuServiceId);
    const owner = as(t, w.ownerId);
    for (const prefix of ["Sto", "STO"]) {
      await expect(
        owner.mutation(api.menuFloor.createPositions, {
          slug: SLUG_A,
          kind: "table",
          prefix,
          from: 1,
          count: 5,
          seats: null,
          zoneId: null,
        }),
      ).rejects.toThrow(FLOOR_ERROR.positionLabelTaken);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect(await positionsOf(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test(`refuses a bad prefix, start or count (1..${MENU_MAX_POSITION_BATCH}) and writes nothing; the full batch fits`, async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const before = await snapshot(t, w.a.menuServiceId);
    const base = {
      slug: SLUG_A,
      kind: "table" as const,
      prefix: "Sto",
      from: 1,
      count: 5,
      seats: null,
      zoneId: null,
    };
    const bad = [
      { count: 0 },
      { count: MENU_MAX_POSITION_BATCH + 1 },
      { count: 1.5 },
      { count: -1 },
      { from: -1 },
      { from: 10_000 },
      { from: 1.5 },
      { prefix: "" },
      { prefix: "   " },
      { prefix: "p".repeat(31) },
      { seats: 0 },
      { seats: MENU_MAX_SEATS + 1 },
    ];
    for (const change of bad) {
      await expect(
        owner.mutation(api.menuFloor.createPositions, { ...base, ...change }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await owner.mutation(api.menuFloor.createPositions, {
      ...base,
      prefix: "p".repeat(30),
      from: 9999,
      count: 1,
    });
    await owner.mutation(api.menuFloor.createPositions, {
      ...base,
      kind: "room",
      prefix: "Soba",
      count: MENU_MAX_POSITION_BATCH,
    });
    const rows = await positionsOf(t, w.a.menuServiceId);
    expect(rows).toHaveLength(MENU_MAX_POSITION_BATCH + 1);
    expectTidy(layoutsIn(rows));
  });

  test(`holds at most ${MENU_MAX_POSITIONS} active positions per venue; archiving makes room`, async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    await fillPositions(t, w.a.menuServiceId, MENU_MAX_POSITIONS - 2);
    const before = await snapshot(t, w.a.menuServiceId);
    const batch = {
      slug: SLUG_A,
      kind: "table" as const,
      prefix: "Novi",
      from: 1,
      seats: null,
      zoneId: null,
    };

    await expect(
      owner.mutation(api.menuFloor.createPositions, { ...batch, count: 3 }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    await owner.mutation(api.menuFloor.createPositions, { ...batch, count: 2 });
    await expect(newPosition(t, w, "Višak")).rejects.toThrow(MENU_ERROR.limitReached);

    const first = (await positionsOf(t, w.a.menuServiceId))[0];
    await owner.mutation(api.menuFloor.archivePosition, { positionId: first._id });
    await newPosition(t, w, "Višak");
    const active = (await positionsOf(t, w.a.menuServiceId)).filter((row) => row.active);
    expect(active).toHaveLength(MENU_MAX_POSITIONS);
  });
});

// =============================================================================
// positions: update
// =============================================================================

describe("updatePosition", () => {
  test("changes label, kind and seats; null seats removes the field; an unchanged call writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const id = await newPosition(t, w, "Sto 1", { seats: 4 });
    const before = await positionOf(t, id);

    expect(await owner.mutation(api.menuFloor.updatePosition, { positionId: id, label: "Sto 10" })).toBeNull();
    expect(await positionOf(t, id)).toMatchObject({
      label: "Sto 10",
      labelNormalized: "sto 10",
      kind: "table",
      seats: 4,
      key: before.key,
      order: before.order,
      layout: before.layout,
    });

    await owner.mutation(api.menuFloor.updatePosition, { positionId: id, kind: "room", seats: null });
    const room = await positionOf(t, id);
    expect(room.kind).toBe("room");
    expect(room).not.toHaveProperty("seats");

    await owner.mutation(api.menuFloor.updatePosition, { positionId: id, seats: 6, label: "STO 10" });
    const cased = await positionOf(t, id);
    expect(cased).toMatchObject({ seats: 6, label: "STO 10" });

    await owner.mutation(api.menuFloor.updatePosition, {
      positionId: id,
      label: "STO 10",
      kind: "room",
      seats: 6,
      zoneId: null,
    });
    expect(await positionOf(t, id)).toEqual(cased);
    await owner.mutation(api.menuFloor.updatePosition, { positionId: id });
    expect(await positionOf(t, id)).toEqual(cased);
  });

  test("refuses another active position's label, bad values and an archived position", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const one = await newPosition(t, w, "Sto 1");
    const two = await newPosition(t, w, "Sto 2");
    const archived = await newPosition(t, w, "Sto 3");
    await owner.mutation(api.menuFloor.archivePosition, { positionId: archived });
    const before = await snapshot(t, w.a.menuServiceId);

    await expect(
      owner.mutation(api.menuFloor.updatePosition, { positionId: two, label: "sto 1" }),
    ).rejects.toThrow(FLOOR_ERROR.positionLabelTaken);
    for (const label of ["", "  ", "x".repeat(41)]) {
      await expect(
        owner.mutation(api.menuFloor.updatePosition, { positionId: one, label }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    for (const seats of [0, MENU_MAX_SEATS + 1, 2.5]) {
      await expect(
        owner.mutation(api.menuFloor.updatePosition, { positionId: one, seats }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    await expect(
      owner.mutation(api.menuFloor.updatePosition, { positionId: archived, label: "Sto 30" }),
    ).rejects.toThrow(FLOOR_ERROR.positionArchived);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // An archived position's label is free again.
    await owner.mutation(api.menuFloor.updatePosition, { positionId: two, label: "Sto 3" });
    expect((await positionOf(t, two)).label).toBe("Sto 3");
  });

  test("a zone change gives the position a fresh spot on the target surface and keeps its size and shape", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const sala = await newZone(t, w, "Sala");
    const resident = await positionOf(t, await newPosition(t, w, "Sto 1", { zoneId: sala }));
    const moving = await newPosition(t, w, "Sto 2");
    await owner.mutation(api.menuFloor.setLayout, {
      positionId: moving,
      layout: { x: 0, y: 0, w: 2, h: 2, shape: "round" },
    });

    await owner.mutation(api.menuFloor.updatePosition, { positionId: moving, zoneId: sala });
    const inSala = await positionOf(t, moving);
    expect(inSala.zoneId).toBe(sala);
    expect(inSala.layout).toMatchObject({ w: 2, h: 2, shape: "round" });
    expectTidy([resident.layout, inSala.layout]);

    // Back to Bez zone, next to a position that took the origin meanwhile.
    const stayer = await positionOf(t, await newPosition(t, w, "Sto 3"));
    expect(stayer.layout).toMatchObject({ x: 0, y: 0 });
    await owner.mutation(api.menuFloor.updatePosition, { positionId: moving, zoneId: null });
    const back = await positionOf(t, moving);
    expect(back.zoneId).toBeUndefined();
    expect(back.layout).toMatchObject({ w: 2, h: 2, shape: "round" });
    expectTidy([stayer.layout, back.layout]);
  });

  test("a position without a layout gets a default-sized one when it changes zone", async () => {
    const t = newTest();
    const w = await world(t);
    const sala = await newZone(t, w, "Sala");
    const id = await insertUnplaced(t, w.a.menuServiceId, "Sto 7");
    await as(t, w.ownerId).mutation(api.menuFloor.updatePosition, {
      positionId: id,
      zoneId: sala,
      kind: "other",
    });
    const row = await positionOf(t, id);
    expect(row).toMatchObject({ kind: "other", zoneId: sala });
    expect(row.layout).toMatchObject({ x: 0, y: 0, w: 4, h: 2, shape: "rect" });
  });

  test("refuses a zone of another business or an archived zone and moves nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const id = await newPosition(t, w, "Sto 1");
    const old = await newZone(t, w, "Stara");
    await owner.mutation(api.menuFloor.archiveZone, { zoneId: old });
    const foreign = (
      await as(t, w.otherOwnerId).mutation(api.menuFloor.createZone, { slug: SLUG_B, name: "Tuđa" })
    ).zoneId;
    const before = await snapshot(t, w.a.menuServiceId);
    await expect(
      owner.mutation(api.menuFloor.updatePosition, { positionId: id, zoneId: foreign }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuFloor.updatePosition, { positionId: id, zoneId: old }),
    ).rejects.toThrow(FLOOR_ERROR.zoneArchived);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });
});

// =============================================================================
// layout
// =============================================================================

describe("setLayout", () => {
  test("stores a valid layout, allows touching neighbours, the cells it held itself and the same cells in another zone", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const sala = await newZone(t, w, "Sala");
    const a = await newPosition(t, w, "Sto 1");
    const b = await newPosition(t, w, "Sto 2");
    const inSala = await newPosition(t, w, "Sto 3", { zoneId: sala });
    const aLayout = (await positionOf(t, a)).layout as FloorLayout;

    // Touching (x = a.x + a.w) is not overlapping.
    const touching: FloorLayout = { x: aLayout.x + aLayout.w, y: 0, w: 3, h: 2, shape: "round" };
    expect(await owner.mutation(api.menuFloor.setLayout, { positionId: b, layout: touching })).toBeNull();
    expect((await positionOf(t, b)).layout).toEqual(touching);

    // Overlapping the cells it held itself is fine.
    const grown: FloorLayout = { ...touching, x: touching.x + 1 };
    await owner.mutation(api.menuFloor.setLayout, { positionId: b, layout: grown });
    expect((await positionOf(t, b)).layout).toEqual(grown);

    // Another zone is another surface: the cells a holds are free there.
    await owner.mutation(api.menuFloor.setLayout, { positionId: inSala, layout: SPOT });
    await owner.mutation(api.menuFloor.setLayout, { positionId: inSala, layout: aLayout });
    expect((await positionOf(t, inSala)).layout).toEqual(aLayout);
  });

  test("refuses a layout outside the grid, with a bad size or fractional cells", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const id = await newPosition(t, w, "Sto 1");
    const before = await snapshot(t, w.a.menuServiceId);
    const bad: FloorLayout[] = [
      { x: FLOOR_COLUMNS - 2, y: 0, w: 3, h: 2, shape: "rect" },
      { x: -1, y: 0, w: 3, h: 2, shape: "rect" },
      { x: 0, y: -1, w: 3, h: 2, shape: "rect" },
      { x: 0, y: 119, w: 2, h: 2, shape: "rect" },
      { x: 0, y: 0, w: 9, h: 2, shape: "rect" },
      { x: 0, y: 0, w: 0, h: 2, shape: "rect" },
      { x: 0.5, y: 0, w: 3, h: 2, shape: "rect" },
      { x: 0, y: 0, w: 2.5, h: 2, shape: "round" },
    ];
    for (const layout of bad) {
      await expect(
        owner.mutation(api.menuFloor.setLayout, { positionId: id, layout }),
      ).rejects.toThrow(FLOOR_ERROR.invalidLayout);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("refuses an overlap with a stored layout and with a position the plan places automatically, and an archived position", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const unplaced = await insertUnplaced(t, w.a.menuServiceId, "Sto 9");
    const placed = await newPosition(t, w, "Sto 1");
    const gone = await newPosition(t, w, "Sto 2");
    await owner.mutation(api.menuFloor.archivePosition, { positionId: gone });
    const stored = (await positionOf(t, placed)).layout as FloorLayout;
    const goneLayout = (await positionOf(t, gone)).layout as FloorLayout;
    const before = await snapshot(t, w.a.menuServiceId);

    // The unplaced position is drawn at the origin (3 x 2); the new one sits beside it.
    await expect(
      owner.mutation(api.menuFloor.setLayout, {
        positionId: placed,
        layout: { x: 2, y: 0, w: 2, h: 2, shape: "rect" },
      }),
    ).rejects.toThrow(FLOOR_ERROR.invalidLayout);
    await expect(
      owner.mutation(api.menuFloor.setLayout, { positionId: unplaced, layout: stored }),
    ).rejects.toThrow(FLOOR_ERROR.invalidLayout);
    await expect(
      owner.mutation(api.menuFloor.setLayout, { positionId: gone, layout: SPOT }),
    ).rejects.toThrow(FLOOR_ERROR.positionArchived);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);

    // An archived position holds no cells.
    await owner.mutation(api.menuFloor.setLayout, { positionId: placed, layout: goneLayout });
    expect((await positionOf(t, placed)).layout).toEqual(goneLayout);
  });
});

describe("setLayouts", () => {
  test("swaps two tables in one call; per zone the final arrangement decides", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const sala = await newZone(t, w, "Sala");
    const a = await newPosition(t, w, "Sto 1");
    const b = await newPosition(t, w, "Sto 2");
    const c = await newPosition(t, w, "Sto 3", { zoneId: sala });
    const la = (await positionOf(t, a)).layout as FloorLayout;
    const lb = (await positionOf(t, b)).layout as FloorLayout;

    // Moving one onto the other's cells alone is refused ...
    await expect(
      owner.mutation(api.menuFloor.setLayout, { positionId: a, layout: lb }),
    ).rejects.toThrow(FLOOR_ERROR.invalidLayout);
    // ... swapping both is fine, and so is the same cells in another zone.
    expect(
      await owner.mutation(api.menuFloor.setLayouts, {
        slug: SLUG_A,
        items: [
          { positionId: a, layout: lb },
          { positionId: b, layout: la },
          { positionId: c, layout: lb },
        ],
      }),
    ).toBeNull();
    expect((await positionOf(t, a)).layout).toEqual(lb);
    expect((await positionOf(t, b)).layout).toEqual(la);
    expect((await positionOf(t, c)).layout).toEqual(lb);
  });

  test("writes nothing when any item is out of the grid or any two layouts overlap", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const a = await newPosition(t, w, "Sto 1");
    const b = await newPosition(t, w, "Sto 2");
    const c = await newPosition(t, w, "Sto 3");
    const lc = (await positionOf(t, c)).layout as FloorLayout;
    const before = await snapshot(t, w.a.menuServiceId);
    const fine: FloorLayout = { x: 0, y: 10, w: 2, h: 2, shape: "rect" };

    const cases: Array<Array<{ positionId: Id<"menuPositions">; layout: FloorLayout }>> = [
      // changed against changed
      [
        { positionId: a, layout: fine },
        { positionId: b, layout: { ...fine, x: 1 } },
      ],
      // changed against a position that stays
      [
        { positionId: a, layout: fine },
        { positionId: b, layout: lc },
      ],
      // a valid item first, an invalid one after it
      [
        { positionId: a, layout: fine },
        { positionId: b, layout: { x: FLOOR_COLUMNS, y: 0, w: 2, h: 2, shape: "rect" } },
      ],
    ];
    for (const items of cases) {
      await expect(
        owner.mutation(api.menuFloor.setLayouts, { slug: SLUG_A, items }),
      ).rejects.toThrow(FLOOR_ERROR.invalidLayout);
    }
    await expect(
      owner.mutation(api.menuFloor.setLayouts, {
        slug: SLUG_A,
        items: [
          { positionId: a, layout: fine },
          { positionId: a, layout: SPOT },
        ],
      }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect(await owner.mutation(api.menuFloor.setLayouts, { slug: SLUG_A, items: [] })).toBeNull();
  });

  test("refuses another business's position and an archived one, and writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const mine = await newPosition(t, w, "Sto 1");
    const gone = await newPosition(t, w, "Sto 2");
    await owner.mutation(api.menuFloor.archivePosition, { positionId: gone });
    const foreign = (
      await as(t, w.otherOwnerId).mutation(api.menuFloor.createPosition, {
        slug: SLUG_B,
        kind: "table",
        label: "Tuđ sto",
        seats: null,
        zoneId: null,
      })
    ).positionId;
    const before = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);

    await expect(
      owner.mutation(api.menuFloor.setLayouts, {
        slug: SLUG_A,
        items: [
          { positionId: mine, layout: SPOT },
          { positionId: foreign, layout: SPOT },
        ],
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      owner.mutation(api.menuFloor.setLayouts, {
        slug: SLUG_A,
        items: [
          { positionId: mine, layout: SPOT },
          { positionId: gone, layout: { ...SPOT, x: 14 } },
        ],
      }),
    ).rejects.toThrow(FLOOR_ERROR.positionArchived);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
  });

  test(`takes at most ${MENU_MAX_POSITION_BATCH} items`, async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    await fillPositions(t, w.a.menuServiceId, MENU_MAX_POSITION_BATCH + 1);
    const items = layoutItems(await positionsOf(t, w.a.menuServiceId));
    await expect(
      owner.mutation(api.menuFloor.setLayouts, { slug: SLUG_A, items }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    expect(
      await owner.mutation(api.menuFloor.setLayouts, {
        slug: SLUG_A,
        items: items.slice(0, MENU_MAX_POSITION_BATCH),
      }),
    ).toBeNull();
  });
});

// =============================================================================
// positions: archive and QR
// =============================================================================

async function linkQr(
  t: T,
  w: MenuWorldSeed,
  positionId: Id<"menuPositions">,
  options: {
    cardCode: string;
    linkActive?: boolean;
    cardStatus?: "active" | "disabled";
    targetKind?: "menu" | "url";
  },
) {
  const page = await t.run(async (ctx) => ctx.db.get(w.a.defaultPageId));
  if (!page) throw new Error("page missing");
  return await t.run(async (ctx) => {
    const qr = await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey: page.key,
      createdByUserId: w.ownerId,
      ...options,
    });
    await ctx.db.patch(qr.linkId, { positionId });
    return qr;
  });
}

describe("archivePosition", () => {
  test("is refused while an active QR card stands on the position, then allowed once the card is disabled", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const id = await newPosition(t, w, "Sto 1");
    const qr = await linkQr(t, w, id, { cardCode: "FLOORQ01" });
    const before = await snapshot(t, w.a.menuServiceId);

    await expect(
      owner.mutation(api.menuFloor.archivePosition, { positionId: id }),
    ).rejects.toThrow(FLOOR_ERROR.positionHasQr);
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
    expect((await positionOf(t, id)).active).toBe(true);

    await t.run(async (ctx) => ctx.db.patch(qr.cardId, { status: "disabled" }));
    expect(await owner.mutation(api.menuFloor.archivePosition, { positionId: id })).toBeNull();
    expect((await positionOf(t, id)).active).toBe(false);
  });

  test("an inactive link, a card that opens something else or a disabled card does not block", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const options = [
      { cardCode: "FLOORQ02", linkActive: false },
      { cardCode: "FLOORQ03", targetKind: "url" as const },
      { cardCode: "FLOORQ04", cardStatus: "disabled" as const },
    ];
    for (const [index, option] of options.entries()) {
      const id = await newPosition(t, w, `Sto ${index + 1}`);
      await linkQr(t, w, id, option);
      await owner.mutation(api.menuFloor.archivePosition, { positionId: id });
      expect((await positionOf(t, id)).active).toBe(false);
    }
  });

  test("a card on another position does not block; archiving frees the label and writes one audit row", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const busy = await newPosition(t, w, "Sto 1");
    const idle = await newPosition(t, w, "Sto 2");
    await linkQr(t, w, busy, { cardCode: "FLOORQ05" });

    await owner.mutation(api.menuFloor.archivePosition, { positionId: idle });
    const row = await positionOf(t, idle);
    expect(row.active).toBe(false);
    const audit = await auditOf(t, w.a.menuServiceId, "position.archived");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "position",
      entityKey: row.key,
    });

    // Archiving twice is a no-op; the label is free for a new position.
    expect(await owner.mutation(api.menuFloor.archivePosition, { positionId: idle })).toBeNull();
    expect(await auditOf(t, w.a.menuServiceId, "position.archived")).toHaveLength(1);
    const again = await newPosition(t, w, "Sto 2");
    expect(again).not.toBe(idle);

    await as(t, w.adminId).mutation(api.menuFloor.archivePosition, { positionId: again });
    const rows = await auditOf(t, w.a.menuServiceId, "position.archived");
    expect(rows).toHaveLength(2);
    expect(rows.find((entry) => entry.actorKind === "admin")?.actorUserId).toBe(w.adminId);
  });
});

// =============================================================================
// roles, tenant isolation, draft
// =============================================================================

describe("access", () => {
  test("the owner, the manager and the ScanMe admin manage the floor; the editor is forbidden", async () => {
    const t = newTest();
    const w = await world(t);
    for (const [role, userId] of [
      ["vlasnik", w.ownerId],
      ["menadzer", w.managerId],
      ["admin", w.adminId],
    ] as const) {
      const client = as(t, userId);
      const { zoneId } = await client.mutation(api.menuFloor.createZone, {
        slug: SLUG_A,
        name: `Zona ${role}`,
      });
      const { positionId } = await client.mutation(api.menuFloor.createPosition, {
        slug: SLUG_A,
        kind: "table",
        label: `Sto ${role}`,
        seats: 2,
        zoneId,
      });
      await client.mutation(api.menuFloor.setLayout, { positionId, layout: SPOT });
      await client.mutation(api.menuFloor.updatePosition, { positionId, seats: 3 });
      await client.mutation(api.menuFloor.archivePosition, { positionId });
    }

    const zoneId = await newZone(t, w, "Zaštićena");
    const positionId = await newPosition(t, w, "Zaštićen sto");
    const before = await snapshot(t, w.a.menuServiceId);
    const editor = as(t, w.editorId);
    const slugCalls = [
      () => editor.mutation(api.menuFloor.createZone, { slug: SLUG_A, name: "Upad" }),
      () =>
        editor.mutation(api.menuFloor.createPosition, {
          slug: SLUG_A,
          kind: "table",
          label: "Upad",
          seats: null,
          zoneId: null,
        }),
      () =>
        editor.mutation(api.menuFloor.createPositions, {
          slug: SLUG_A,
          kind: "table",
          prefix: "Upad",
          from: 1,
          count: 2,
          seats: null,
          zoneId: null,
        }),
      () =>
        editor.mutation(api.menuFloor.setLayouts, {
          slug: SLUG_A,
          items: [{ positionId, layout: SPOT }],
        }),
    ];
    for (const call of slugCalls) await expect(call()).rejects.toThrow(MENU_ERROR.forbidden);
    for (const call of rowCalls(zoneId, positionId)) {
      await expect(call(editor)).rejects.toThrow(MENU_ERROR.forbidden);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("finance, view-only, outsiders, the owner of another business and signed-out callers are refused; nothing is written", async () => {
    const t = newTest();
    const w = await world(t);
    const zoneId = await newZone(t, w, "Zaštićena");
    const positionId = await newPosition(t, w, "Zaštićen sto");
    const before = await snapshot(t, w.a.menuServiceId);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const client = as(t, userId);
      // Addressed by slug: the caller has no Menu role there.
      await expect(
        client.mutation(api.menuFloor.createZone, { slug: SLUG_A, name: "Upad" }),
      ).rejects.toThrow(MENU_ERROR.forbidden);
      await expect(
        client.mutation(api.menuFloor.createPosition, {
          slug: SLUG_A,
          kind: "table",
          label: "Upad",
          seats: null,
          zoneId: null,
        }),
      ).rejects.toThrow(MENU_ERROR.forbidden);
      await expect(
        client.mutation(api.menuFloor.setLayouts, {
          slug: SLUG_A,
          items: [{ positionId, layout: SPOT }],
        }),
      ).rejects.toThrow(MENU_ERROR.forbidden);
      // Addressed by row id: indistinguishable from an id that does not exist.
      for (const call of rowCalls(zoneId, positionId)) {
        await expect(call(client)).rejects.toThrow(MENU_ERROR.notFound);
      }
    }
    await expect(
      t.mutation(api.menuFloor.createZone, { slug: SLUG_A, name: "Upad" }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    for (const call of rowCalls(zoneId, positionId)) {
      await expect(call(t)).rejects.toThrow(MENU_ERROR.unauthenticated);
    }
    expect(await snapshot(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a manager of venue A cannot read, move or archive venue B's zones and positions, and a foreign id looks like a missing one", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const manager = as(t, w.managerId);
    const bOwner = as(t, w.otherOwnerId);
    const { zoneId: bZone } = await bOwner.mutation(api.menuFloor.createZone, {
      slug: SLUG_B,
      name: "Tuđa zona",
    });
    const { positionId: bPosition } = await bOwner.mutation(api.menuFloor.createPosition, {
      slug: SLUG_B,
      kind: "table",
      label: "Tuđ sto",
      seats: 2,
      zoneId: bZone,
    });
    const aZone = await newZone(t, w, "Moja zona");
    const aPosition = await newPosition(t, w, "Moj sto");
    const beforeA = await snapshot(t, w.a.menuServiceId);
    const beforeB = await snapshot(t, w.b.menuServiceId);

    // B's slug: A's manager has no role there.
    expect(await manager.query(api.menuFloor.overview, { slug: SLUG_B })).toBeNull();
    await expect(
      manager.mutation(api.menuFloor.createZone, { slug: SLUG_B, name: "Upad" }),
    ).rejects.toThrow(MENU_ERROR.forbidden);
    // B's ids.
    for (const call of rowCalls(bZone, bPosition)) {
      await expect(call(manager)).rejects.toThrow(MENU_ERROR.notFound);
      await expect(call(owner)).rejects.toThrow(MENU_ERROR.notFound);
    }
    // B's ids inside A's own calls.
    await expect(
      manager.mutation(api.menuFloor.createPosition, {
        slug: SLUG_A,
        kind: "table",
        label: "Upad",
        seats: null,
        zoneId: bZone,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      manager.mutation(api.menuFloor.updatePosition, { positionId: aPosition, zoneId: bZone }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      manager.mutation(api.menuFloor.setLayouts, {
        slug: SLUG_A,
        items: [{ positionId: bPosition, layout: SPOT }],
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    // The ScanMe admin may act on any venue, but a foreign id is still foreign inside a slug call.
    await expect(
      as(t, w.adminId).mutation(api.menuFloor.createPosition, {
        slug: SLUG_A,
        kind: "table",
        label: "Upad",
        seats: null,
        zoneId: bZone,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);

    // A foreign id and a deleted id give the same answer.
    await t.run(async (ctx) => {
      await ctx.db.delete(aZone);
      await ctx.db.delete(aPosition);
    });
    for (const call of rowCalls(aZone, aPosition)) {
      await expect(call(manager)).rejects.toThrow(MENU_ERROR.notFound);
    }

    expect(await snapshot(t, w.b.menuServiceId)).toEqual(beforeB);
    expect((await snapshot(t, w.a.menuServiceId)).state).toEqual(beforeA.state);
    expect(await bOwner.query(api.menuFloor.overview, { slug: SLUG_B })).toMatchObject({
      zones: [{ name: "Tuđa zona" }],
      positions: [{ label: "Tuđ sto" }],
    });
  });

  test("switching client editing off does not stop the owner from managing the floor", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const zoneId = await newZone(t, w, "Terasa");
    const positionId = await newPosition(t, w, "Sto 1", { zoneId });
    await as(t, w.ownerId).mutation(api.menuFloor.setLayout, { positionId, layout: SPOT });
    expect((await positionOf(t, positionId)).layout).toEqual(SPOT);
    expect(await as(t, w.ownerId).query(api.menuFloor.overview, { slug: SLUG_A })).not.toBeNull();
  });
});

describe("operational data", () => {
  test("no floor change touches the draft: the revision and the last editor stay as they were", async () => {
    const t = newTest();
    const w = await world(t);
    const owner = as(t, w.ownerId);
    const before = await stateOf(t, w.a.menuServiceId);

    const terasa = await newZone(t, w, "Terasa");
    const sala = await newZone(t, w, "Sala");
    await owner.mutation(api.menuFloor.renameZone, { zoneId: sala, name: "Velika sala" });
    await owner.mutation(api.menuFloor.moveZone, { zoneId: sala, direction: "up" });
    const { positionIds } = await owner.mutation(api.menuFloor.createPositions, {
      slug: SLUG_A,
      kind: "table",
      prefix: "Sto",
      from: 1,
      count: 3,
      seats: 4,
      zoneId: terasa,
    });
    await owner.mutation(api.menuFloor.updatePosition, { positionId: positionIds[0], zoneId: sala });
    await owner.mutation(api.menuFloor.setLayout, { positionId: positionIds[1], layout: SPOT });
    await owner.mutation(api.menuFloor.setLayouts, {
      slug: SLUG_A,
      items: [{ positionId: positionIds[2], layout: { ...SPOT, x: 14 } }],
    });
    await owner.mutation(api.menuFloor.archivePosition, { positionId: positionIds[2] });
    await owner.mutation(api.menuFloor.archiveZone, { zoneId: terasa });

    expect(await stateOf(t, w.a.menuServiceId)).toEqual(before);
    expect(before).not.toBeNull();
  });
});

/** The six mutations addressed by a zone or position id, for the access matrices. */
function rowCalls(zoneId: Id<"menuZones">, positionId: Id<"menuPositions">) {
  return [
    (client: Client) => client.mutation(api.menuFloor.renameZone, { zoneId, name: "Upad" }),
    (client: Client) => client.mutation(api.menuFloor.moveZone, { zoneId, direction: "down" }),
    (client: Client) => client.mutation(api.menuFloor.archiveZone, { zoneId }),
    (client: Client) =>
      client.mutation(api.menuFloor.updatePosition, { positionId, label: "Upad" }),
    (client: Client) =>
      client.mutation(api.menuFloor.setLayout, { positionId, layout: { ...SPOT, x: 20 } }),
    (client: Client) => client.mutation(api.menuFloor.archivePosition, { positionId }),
  ];
}
