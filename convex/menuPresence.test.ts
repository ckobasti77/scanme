/// <reference types="vite/client" />

// ScanMe Menu V1 — K05: who is editing what (master §6.1). A light signal, not
// a lock: heartbeats write rarely (only when the entity changes or the row is
// close to expiring), one list per service shows everyone, rows expire by
// themselves and a cron removes the old ones. Covered: the write-saving rule,
// invalid input, roles (editing needs menu.edit, reading menu.read), editing
// switched off, tenant isolation, expiry, leaving and the cleanup cron.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { PRESENCE_REFRESH_MS, PRESENCE_TTL_MS } from "./menuPresence";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const CODE_PATTERN = /\bmenu\/[a-z_]+/;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(CODE_PATTERN)?.[0] ?? text;
  }
}

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

const SESSION = {
  owner: "tab-owner-0001",
  owner2: "tab-owner-0002",
  manager: "tab-manager-0001",
  editor: "tab-editor-0001",
  admin: "tab-admin-0001",
  other: "tab-other-0001",
} as const;

const ARTICLE = "ar_pljeskavica1";
const OTHER_ARTICLE = "ar_pitasasirom1";

function heartbeat(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  sessionId: string,
  entity?: { entityType: "article" | "section" | "page" | "room_service" | "settings" | "presentation"; entityKey?: string },
) {
  return as(t, userId).mutation(api.menuPresence.heartbeat, {
    menuServiceId,
    sessionId,
    ...(entity ?? {}),
  });
}

function listFor(t: T, userId: Id<"users"> | null, menuServiceId: Id<"menuServices">, nowBucket = Date.now()) {
  const caller = userId === null ? t : as(t, userId);
  return caller.query(api.menuPresence.listForService, { menuServiceId, nowBucket });
}

async function rowsOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuEditorPresence")
        .withIndex("by_menuServiceId_and_expiresAt", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
}

async function allRows(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("menuEditorPresence").collect());
}

async function insertRow(
  t: T,
  input: {
    menuServiceId: Id<"menuServices">;
    userId: Id<"users">;
    sessionId: string;
    expiresAt: number;
    updatedAt?: number;
    entityType?: "article" | "section" | "page" | "room_service" | "settings" | "presentation";
    entityKey?: string;
  },
) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("menuEditorPresence", {
        menuServiceId: input.menuServiceId,
        userId: input.userId,
        sessionId: input.sessionId,
        ...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
        ...(input.entityKey !== undefined ? { entityKey: input.entityKey } : {}),
        expiresAt: input.expiresAt,
        updatedAt: input.updatedAt ?? input.expiresAt - PRESENCE_TTL_MS,
      }),
  );
}

// =============================================================================
// heartbeat
// =============================================================================

describe("menuPresence.heartbeat — writes", () => {
  test("inserts a row for the caller with the entity it has open", async () => {
    const { t, w } = await setup();
    const before = Date.now();
    const result = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner, {
      entityType: "article",
      entityKey: ARTICLE,
    });
    const after = Date.now();

    expect(result.written).toBe(true);
    expect(result.expiresAt).toBeGreaterThanOrEqual(before + PRESENCE_TTL_MS);
    expect(result.expiresAt).toBeLessThanOrEqual(after + PRESENCE_TTL_MS);
    const rows = await rowsOf(t, w.a.menuServiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      userId: w.ownerId,
      sessionId: SESSION.owner,
      entityType: "article",
      entityKey: ARTICLE,
      expiresAt: result.expiresAt,
    });
    expect(rows[0].updatedAt).toBeGreaterThanOrEqual(before);
    expect(rows[0].updatedAt).toBeLessThanOrEqual(after);
  });

  test("a second heartbeat for the same entity within the refresh window writes nothing", async () => {
    const { t, w } = await setup();
    const entity = { entityType: "article" as const, entityKey: ARTICLE };
    const first = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner, entity);
    const rowBefore = (await rowsOf(t, w.a.menuServiceId))[0];

    const second = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner, entity);
    const third = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner, entity);

    expect(first.written).toBe(true);
    expect(second).toEqual({ written: false, expiresAt: first.expiresAt });
    expect(third).toEqual({ written: false, expiresAt: first.expiresAt });
    const rows = await rowsOf(t, w.a.menuServiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(rowBefore);
  });

  test("a heartbeat without an entity is repeated for free as well", async () => {
    const { t, w } = await setup();
    const first = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner);
    const second = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner);
    expect(first.written).toBe(true);
    expect(second).toEqual({ written: false, expiresAt: first.expiresAt });
    const [row] = await rowsOf(t, w.a.menuServiceId);
    expect(row.entityType).toBeUndefined();
    expect(row.entityKey).toBeUndefined();
  });

  test("a different entity writes and moves the same session's row", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "article", entityKey: ARTICLE });
    const rowId = (await rowsOf(t, service))[0]._id;

    const otherKey = await heartbeat(t, w.ownerId, service, SESSION.owner, {
      entityType: "article",
      entityKey: OTHER_ARTICLE,
    });
    expect(otherKey.written).toBe(true);
    const otherType = await heartbeat(t, w.ownerId, service, SESSION.owner, {
      entityType: "section",
      entityKey: OTHER_ARTICLE,
    });
    expect(otherType.written).toBe(true);
    const typeOnly = await heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "room_service" });
    expect(typeOnly.written).toBe(true);
    const nothing = await heartbeat(t, w.ownerId, service, SESSION.owner);
    expect(nothing.written).toBe(true);

    const rows = await rowsOf(t, service);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(rowId);
    expect(rows[0].entityType).toBeUndefined();
    expect(rows[0].entityKey).toBeUndefined();
  });

  test("every entity kind is accepted", async () => {
    const { t, w } = await setup();
    for (const entityType of ["article", "section", "page", "room_service", "settings", "presentation"] as const) {
      const result = await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner, {
        entityType,
        entityKey: `key_${entityType}`,
      });
      expect(result.written, entityType).toBe(true);
    }
    expect(await rowsOf(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test("writes again once the row is close to expiring, and only then", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    const entity = { entityType: "article" as const, entityKey: ARTICLE };
    await heartbeat(t, w.ownerId, service, SESSION.owner, entity);
    const rowId = (await rowsOf(t, service))[0]._id;

    // 40 s left: still more than TTL - refresh, nothing is written.
    await t.run(async (ctx) => {
      await ctx.db.patch(rowId, { expiresAt: Date.now() + 40_000 });
    });
    const quiet = await heartbeat(t, w.ownerId, service, SESSION.owner, entity);
    expect(quiet.written).toBe(false);
    expect((await rowsOf(t, service))[0].expiresAt).toBe(quiet.expiresAt);

    // 20 s left: less than TTL - refresh, the row is refreshed to a full TTL.
    expect(PRESENCE_TTL_MS - PRESENCE_REFRESH_MS).toBeGreaterThan(20_000);
    await t.run(async (ctx) => {
      await ctx.db.patch(rowId, { expiresAt: Date.now() + 20_000 });
    });
    const before = Date.now();
    const refreshed = await heartbeat(t, w.ownerId, service, SESSION.owner, entity);
    expect(refreshed.written).toBe(true);
    expect(refreshed.expiresAt).toBeGreaterThanOrEqual(before + PRESENCE_TTL_MS);
    const rows = await rowsOf(t, service);
    expect(rows).toHaveLength(1);
    expect(rows[0].expiresAt).toBe(refreshed.expiresAt);

    // An already expired row is simply refreshed too.
    await t.run(async (ctx) => {
      await ctx.db.patch(rowId, { expiresAt: Date.now() - 5_000 });
    });
    expect((await heartbeat(t, w.ownerId, service, SESSION.owner, entity)).written).toBe(true);
  });

  test("each tab has its own row; one session never gets two rows, even if duplicates exist", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.ownerId, service, SESSION.owner2, { entityType: "article", entityKey: ARTICLE });
    expect(await rowsOf(t, service)).toHaveLength(2);

    // Two stray duplicates of the first tab (e.g. from a race) are collapsed by the next heartbeat.
    const expiresAt = Date.now() + 10_000;
    await insertRow(t, { menuServiceId: service, userId: w.ownerId, sessionId: SESSION.owner, expiresAt });
    await insertRow(t, { menuServiceId: service, userId: w.ownerId, sessionId: SESSION.owner, expiresAt });
    expect(await rowsOf(t, service)).toHaveLength(4);
    await heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "page", entityKey: "pg_glavni" });

    const rows = await rowsOf(t, service);
    expect(rows.filter((row) => row.sessionId === SESSION.owner)).toHaveLength(1);
    expect(rows.filter((row) => row.sessionId === SESSION.owner2)).toHaveLength(1);
  });

  test("two people on the same session id never share a row", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    const sessionId = "shared-session-id";
    await heartbeat(t, w.ownerId, service, sessionId, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.managerId, service, sessionId, { entityType: "article", entityKey: ARTICLE });
    const rows = await rowsOf(t, service);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.userId).sort()).toEqual([w.ownerId, w.managerId].sort());
  });

  test("the same session opened in another service moves the row there (admin has access to both)", async () => {
    const { t, w } = await setup();
    const first = await heartbeat(t, w.adminId, w.a.menuServiceId, SESSION.admin, {
      entityType: "settings",
    });
    expect(first.written).toBe(true);
    const moved = await heartbeat(t, w.adminId, w.b.menuServiceId, SESSION.admin, {
      entityType: "settings",
    });
    expect(moved.written).toBe(true);
    expect(await rowsOf(t, w.a.menuServiceId)).toHaveLength(0);
    expect(await rowsOf(t, w.b.menuServiceId)).toHaveLength(1);
    expect(await allRows(t)).toHaveLength(1);
  });
});

describe("menuPresence.heartbeat — invalid input", () => {
  test("a bad session id is menu/invalid_input and writes nothing", async () => {
    const { t, w } = await setup();
    for (const sessionId of ["", "short", "has spaces in it", "bad/chars/here!", "x".repeat(65), "žćčšđžćčš"]) {
      expect(
        await codeOf(heartbeat(t, w.ownerId, w.a.menuServiceId, sessionId)),
        JSON.stringify(sessionId),
      ).toBe(MENU_ERROR.invalidInput);
    }
    // The limits themselves are valid.
    expect(await codeOf(heartbeat(t, w.ownerId, w.a.menuServiceId, "abcdefgh"))).toBeNull();
    expect(await codeOf(heartbeat(t, w.ownerId, w.a.menuServiceId, "A1_-".repeat(16)))).toBeNull();
    expect(await allRows(t)).toHaveLength(2);
  });

  test("an empty or too long entity key, or a key without a type, is menu/invalid_input", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    expect(
      await codeOf(heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "article", entityKey: "" })),
    ).toBe(MENU_ERROR.invalidInput);
    expect(
      await codeOf(
        heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "article", entityKey: "k".repeat(65) }),
      ),
    ).toBe(MENU_ERROR.invalidInput);
    expect(
      await codeOf(
        as(t, w.ownerId).mutation(api.menuPresence.heartbeat, {
          menuServiceId: service,
          sessionId: SESSION.owner,
          entityKey: ARTICLE,
        }),
      ),
    ).toBe(MENU_ERROR.invalidInput);
    expect(await allRows(t)).toHaveLength(0);

    expect(
      await codeOf(
        heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "article", entityKey: "k".repeat(64) }),
      ),
    ).toBeNull();
  });

  test("an unknown entity type is refused by the validator and writes nothing", async () => {
    const { t, w } = await setup();
    const args = {
      menuServiceId: w.a.menuServiceId,
      sessionId: SESSION.owner,
      entityType: "everything",
    } as unknown as FunctionArgs<typeof api.menuPresence.heartbeat>;
    expect(await codeOf(as(t, w.ownerId).mutation(api.menuPresence.heartbeat, args))).not.toBeNull();
    expect(await allRows(t)).toHaveLength(0);
  });
});

describe("menuPresence.heartbeat — roles and tenants", () => {
  test("owner, manager, editor and admin may heartbeat", async () => {
    const { t, w } = await setup();
    const callers = [
      [w.ownerId, SESSION.owner],
      [w.managerId, SESSION.manager],
      [w.editorId, SESSION.editor],
      [w.adminId, SESSION.admin],
    ] as const;
    for (const [userId, sessionId] of callers) {
      expect(await codeOf(heartbeat(t, userId, w.a.menuServiceId, sessionId)), sessionId).toBeNull();
    }
    expect(await rowsOf(t, w.a.menuServiceId)).toHaveLength(4);
  });

  test("finance, view-only and outsiders get menu/not_found; nobody signed in gets menu/unauthenticated; nothing is written", async () => {
    const { t, w } = await setup();
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      expect(await codeOf(heartbeat(t, userId, w.a.menuServiceId, SESSION.other))).toBe(MENU_ERROR.notFound);
    }
    expect(
      await codeOf(
        t.mutation(api.menuPresence.heartbeat, { menuServiceId: w.a.menuServiceId, sessionId: SESSION.other }),
      ),
    ).toBe(MENU_ERROR.unauthenticated);
    expect(await allRows(t)).toHaveLength(0);
  });

  test("tenant B's owner cannot heartbeat into A and A's owner cannot heartbeat into B", async () => {
    const { t, w } = await setup();
    expect(await codeOf(heartbeat(t, w.otherOwnerId, w.a.menuServiceId, SESSION.other))).toBe(
      MENU_ERROR.notFound,
    );
    expect(await codeOf(heartbeat(t, w.ownerId, w.b.menuServiceId, SESSION.owner))).toBe(MENU_ERROR.notFound);
    expect(await allRows(t)).toHaveLength(0);
    // Each owner can heartbeat into their own service.
    expect(await codeOf(heartbeat(t, w.otherOwnerId, w.b.menuServiceId, SESSION.other))).toBeNull();
    expect(await rowsOf(t, w.b.menuServiceId)).toHaveLength(1);
    expect(await rowsOf(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("with client editing switched off the owner, manager and editor get menu/editing_disabled; the admin still can", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const callers = [
      [w.ownerId, SESSION.owner],
      [w.managerId, SESSION.manager],
      [w.editorId, SESSION.editor],
    ] as const;
    for (const [userId, sessionId] of callers) {
      expect(await codeOf(heartbeat(t, userId, w.a.menuServiceId, sessionId)), sessionId).toBe(
        MENU_ERROR.editingDisabled,
      );
    }
    expect(await allRows(t)).toHaveLength(0);
    expect(await codeOf(heartbeat(t, w.adminId, w.a.menuServiceId, SESSION.admin))).toBeNull();
    expect(await allRows(t)).toHaveLength(1);
  });

  test("an inactive Menu profile stops the heartbeat with menu/service_inactive", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    expect(await codeOf(heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner))).toBe(
      MENU_ERROR.serviceInactive,
    );
    expect(await allRows(t)).toHaveLength(0);
  });
});

// =============================================================================
// listForService
// =============================================================================

describe("menuPresence.listForService", () => {
  test("shows the manager's entry to the owner with isMe false, and the owner's own entry with isMe true", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await t.run(async (ctx) => {
      await ctx.db.patch(w.managerId, { name: "Mara Menadžer" });
    });
    await heartbeat(t, w.managerId, service, SESSION.manager, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "section", entityKey: "sc_pica1" });

    const seenByOwner = await listFor(t, w.ownerId, service);
    if (!seenByOwner) throw new Error("expected a list");
    expect(seenByOwner.entries).toHaveLength(2);
    const manager = seenByOwner.entries.find((entry) => entry.userId === w.managerId);
    const owner = seenByOwner.entries.find((entry) => entry.userId === w.ownerId);
    expect(manager).toMatchObject({
      isMe: false,
      name: "Mara Menadžer",
      entityType: "article",
      entityKey: ARTICLE,
    });
    // The owner has no display name: the e-mail stands in.
    expect(owner).toMatchObject({
      isMe: true,
      name: "vlasnik@example.com",
      entityType: "section",
      entityKey: "sc_pica1",
    });
    expect(manager?.since).toBeGreaterThan(0);

    const seenByManager = await listFor(t, w.managerId, service);
    expect(seenByManager?.entries.find((entry) => entry.userId === w.ownerId)?.isMe).toBe(false);
    expect(seenByManager?.entries.find((entry) => entry.userId === w.managerId)?.isMe).toBe(true);
  });

  test("an editor with no entity shows as null/null", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.editorId, w.a.menuServiceId, SESSION.editor);
    const list = await listFor(t, w.ownerId, w.a.menuServiceId);
    expect(list?.entries).toHaveLength(1);
    expect(list?.entries[0]).toMatchObject({
      userId: w.editorId,
      isMe: false,
      entityType: null,
      entityKey: null,
      name: "urednik@example.com",
    });
  });

  test("rows with expiresAt at or before nowBucket are not listed", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    const bucket = 1_800_000_000_000;
    await insertRow(t, { menuServiceId: service, userId: w.managerId, sessionId: "gone-long-ago", expiresAt: bucket - 60_000 });
    await insertRow(t, { menuServiceId: service, userId: w.editorId, sessionId: "expires-exactly", expiresAt: bucket });
    await insertRow(t, {
      menuServiceId: service,
      userId: w.adminId,
      sessionId: "expires-just-after",
      expiresAt: bucket + 1,
      entityType: "page",
      entityKey: "pg_glavni",
    });

    const list = await listFor(t, w.ownerId, service, bucket);
    expect(list?.entries.map((entry) => entry.userId)).toEqual([w.adminId]);
    // A later bucket drops it too; an earlier one brings the others back.
    expect((await listFor(t, w.ownerId, service, bucket + 1))?.entries).toEqual([]);
    expect(
      (await listFor(t, w.ownerId, service, bucket - 1))?.entries.map((entry) => entry.userId).sort(),
    ).toEqual([w.editorId, w.adminId].sort());
  });

  test("the same person is one entry per entity: two tabs on one article show once, on two articles twice", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.managerId, service, SESSION.manager, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.managerId, service, "tab-manager-0002", { entityType: "article", entityKey: ARTICLE });
    expect((await listFor(t, w.ownerId, service))?.entries).toHaveLength(1);

    await heartbeat(t, w.managerId, service, "tab-manager-0003", {
      entityType: "article",
      entityKey: OTHER_ARTICLE,
    });
    const entries = (await listFor(t, w.ownerId, service))?.entries ?? [];
    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.entityKey).sort()).toEqual([ARTICLE, OTHER_ARTICLE].sort());
    expect(entries.every((entry) => entry.userId === w.managerId)).toBe(true);
  });

  test("a non-finite nowBucket lists nobody instead of failing", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.managerId, w.a.menuServiceId, SESSION.manager);
    expect((await listFor(t, w.ownerId, w.a.menuServiceId, Number.NaN))?.entries).toEqual([]);
    expect((await listFor(t, w.ownerId, w.a.menuServiceId, Number.POSITIVE_INFINITY))?.entries).toEqual([]);
  });

  test("owner, manager, editor and admin read the list; finance, view-only, outsiders and anonymous get null", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.managerId, w.a.menuServiceId, SESSION.manager);
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const list = await listFor(t, userId, w.a.menuServiceId);
      expect(list).not.toBeNull();
      expect(list?.entries).toHaveLength(1);
    }
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, null]) {
      expect(await listFor(t, userId, w.a.menuServiceId)).toBeNull();
    }
  });

  test("tenant B's owner gets null when listing A, A's owner gets null for B, and each list holds only its own service's people", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.otherOwnerId, w.b.menuServiceId, SESSION.other, {
      entityType: "article",
      entityKey: OTHER_ARTICLE,
    });

    expect(await listFor(t, w.otherOwnerId, w.a.menuServiceId)).toBeNull();
    expect(await listFor(t, w.ownerId, w.b.menuServiceId)).toBeNull();
    expect((await listFor(t, w.ownerId, w.a.menuServiceId))?.entries.map((entry) => entry.userId)).toEqual([
      w.ownerId,
    ]);
    expect((await listFor(t, w.otherOwnerId, w.b.menuServiceId))?.entries.map((entry) => entry.userId)).toEqual([
      w.otherOwnerId,
    ]);
  });

  test("reading stays open with client editing switched off, and still shows the admin's live entry", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.adminId, w.a.menuServiceId, SESSION.admin, { entityType: "settings" });
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const list = await listFor(t, w.ownerId, w.a.menuServiceId);
    expect(list?.entries.map((entry) => entry.userId)).toEqual([w.adminId]);
  });

  test("is null once the Menu profile is inactive", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.managerId, w.a.menuServiceId, SESSION.manager);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    expect(await listFor(t, w.ownerId, w.a.menuServiceId)).toBeNull();
  });
});

// =============================================================================
// leave
// =============================================================================

describe("menuPresence.leave", () => {
  test("removes the caller's session at once and keeps their other tab", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.managerId, service, SESSION.manager, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.ownerId, service, SESSION.owner, { entityType: "article", entityKey: ARTICLE });
    await heartbeat(t, w.ownerId, service, SESSION.owner2, { entityType: "section", entityKey: "sc_pica1" });

    const left = await as(t, w.ownerId).mutation(api.menuPresence.leave, {
      menuServiceId: service,
      sessionId: SESSION.owner,
    });
    expect(left).toBeNull();

    const rows = await rowsOf(t, service);
    expect(rows.map((row) => row.sessionId).sort()).toEqual([SESSION.manager, SESSION.owner2].sort());
    const list = await listFor(t, w.managerId, service);
    expect(list?.entries.map((entry) => entry.entityKey).sort()).toEqual(["sc_pica1", ARTICLE].sort());
  });

  test("a person cannot remove somebody else's session, and leaving twice is harmless", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.ownerId, service, SESSION.owner);

    await as(t, w.managerId).mutation(api.menuPresence.leave, { menuServiceId: service, sessionId: SESSION.owner });
    expect(await rowsOf(t, service)).toHaveLength(1);

    await as(t, w.ownerId).mutation(api.menuPresence.leave, { menuServiceId: service, sessionId: SESSION.owner });
    await as(t, w.ownerId).mutation(api.menuPresence.leave, { menuServiceId: service, sessionId: SESSION.owner });
    expect(await rowsOf(t, service)).toHaveLength(0);
  });

  test("works with client editing switched off (it is not editing)", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.ownerId, service, SESSION.owner);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    expect(
      await codeOf(as(t, w.ownerId).mutation(api.menuPresence.leave, { menuServiceId: service, sessionId: SESSION.owner })),
    ).toBeNull();
    expect(await rowsOf(t, service)).toHaveLength(0);
  });

  test("finance, view-only, outsiders and another tenant's owner get menu/not_found and remove nothing", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    await heartbeat(t, w.ownerId, service, SESSION.owner);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(
        await codeOf(as(t, userId).mutation(api.menuPresence.leave, { menuServiceId: service, sessionId: SESSION.owner })),
      ).toBe(MENU_ERROR.notFound);
    }
    expect(
      await codeOf(t.mutation(api.menuPresence.leave, { menuServiceId: service, sessionId: SESSION.owner })),
    ).toBe(MENU_ERROR.unauthenticated);
    expect(await rowsOf(t, service)).toHaveLength(1);
  });
});

// =============================================================================
// cleanupExpired
// =============================================================================

describe("menuPresence.cleanupExpired", () => {
  test("deletes rows expired more than a minute ago and keeps recently expired and fresh ones", async () => {
    const { t, w } = await setup();
    const service = w.a.menuServiceId;
    const now = Date.now();
    await insertRow(t, { menuServiceId: service, userId: w.ownerId, sessionId: "long-gone-0001", expiresAt: now - 10 * 60_000 });
    await insertRow(t, { menuServiceId: service, userId: w.managerId, sessionId: "two-min-ago-01", expiresAt: now - 2 * 60_000 });
    await insertRow(t, { menuServiceId: service, userId: w.editorId, sessionId: "just-expired-1", expiresAt: now - 30_000 });
    await insertRow(t, { menuServiceId: w.b.menuServiceId, userId: w.otherOwnerId, sessionId: "b-long-gone-1", expiresAt: now - 5 * 60_000 });
    await heartbeat(t, w.adminId, service, SESSION.admin);

    expect(await t.mutation(internal.menuPresence.cleanupExpired, {})).toBeNull();

    const left = (await allRows(t)).map((row) => row.sessionId).sort();
    expect(left).toEqual(["just-expired-1", SESSION.admin].sort());
  });

  test("does nothing when nothing is old", async () => {
    const { t, w } = await setup();
    await heartbeat(t, w.ownerId, w.a.menuServiceId, SESSION.owner);
    await heartbeat(t, w.managerId, w.a.menuServiceId, SESSION.manager);
    await t.mutation(internal.menuPresence.cleanupExpired, {});
    expect(await allRows(t)).toHaveLength(2);
  });

  test("keeps going in batches: more than one batch of old rows is fully removed by its own continuation", async () => {
    vi.useFakeTimers();
    try {
      const { t, w } = await setup();
      const service = w.a.menuServiceId;
      const now = Date.now();
      await t.run(async (ctx) => {
        for (let index = 0; index < 520; index += 1) {
          await ctx.db.insert("menuEditorPresence", {
            menuServiceId: service,
            userId: w.ownerId,
            sessionId: `old-session-${String(index).padStart(4, "0")}`,
            expiresAt: now - 10 * 60_000 - index,
            updatedAt: now - 11 * 60_000,
          });
        }
        for (const sessionId of ["fresh-session-1", "fresh-session-2", "fresh-session-3"]) {
          await ctx.db.insert("menuEditorPresence", {
            menuServiceId: service,
            userId: w.managerId,
            sessionId,
            expiresAt: now + 30_000,
            updatedAt: now,
          });
        }
      });

      await t.mutation(internal.menuPresence.cleanupExpired, {});
      // One batch is 500 rows; the rest waits for the continuation it scheduled.
      expect(await allRows(t)).toHaveLength(23);

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const left = await allRows(t);
      expect(left.map((row) => row.sessionId).sort()).toEqual([
        "fresh-session-1",
        "fresh-session-2",
        "fresh-session-3",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
