/// <reference types="vite/client" />

// ScanMe Menu V1 — K27: Početna of the client panel (master §13.2; plan
// docs/meni/planovi/K24.md §4.2). `menuPanel.home` is ONE read model for the
// whole page: the menu block (menu.read), the Room service price warnings, the
// live operations numbers (operations.read, so not for an Urednik) and the venue
// mailbox state (settings.edit). Proven here: who gets which block, every
// refusal as null, the publish state, the operations counts (only Novi and
// Prihvaćen, one entry per signed-in person, waiting reservations whatever the
// date), the 300-per-status bound, the mailbox status, the Room service warning
// count (null unless Premium AND switched on), and that no guest contact, device
// pseudonym, token or e-mail address is in the answer.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 12:00 in Belgrade); the
// clock moves with vi.setSystemTime. Fictional tenants only (the repo is public):
// "Kafana kod Mike" (a), "Demo restoran" (b); people are "Ana", "Marko",
// "Jelena". The helpers are copied from convex/menuWaiter.test.ts on purpose (a
// test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_ACTIVE_REQUESTS,
  MENU_MAX_PANEL_RESERVATIONS,
  MENU_RESERVATION_PANEL_WINDOW_MS,
} from "../lib/menu/limits";
import { STAFF_SESSION_MS } from "../lib/menu/pin-policy";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = "test-pepper-0123456789abcdef";
});

afterEach(() => {
  delete process.env.MENU_PIN_PEPPER;
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;
type Caller = Pick<T, "query" | "mutation">;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

const T0 = Date.UTC(2026, 9, 21, 10, 0, 0); // Wednesday 12:00 in Belgrade (CEST)
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** What the panel passes as `fromMs`: the start of the current hour minus 12 hours. */
const FROM_MS = T0 - 12 * HOUR;
/** The pseudonym of the guest's phone: it must never reach the Owner's screen. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";

// -----------------------------------------------------------------------------
// World, staff, sign-in
// -----------------------------------------------------------------------------

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const owner = as(t, w.ownerId);
  const other = as(t, w.otherOwnerId);
  const { code } = await owner.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  const { code: bCode } = await other.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });
  return { t, w, owner, other, code, bCode };
}
type Env = Awaited<ReturnType<typeof world>>;
type Venue = "a" | "b";

type Who = "owner" | "manager" | "admin" | "editor" | "finance" | "viewOnly" | "outsider" | "otherOwner" | "anonymous";

function callers(env: Env): Record<Who, Caller> {
  const { t, w } = env;
  return {
    owner: as(t, w.ownerId),
    manager: as(t, w.managerId),
    admin: as(t, w.adminId),
    editor: as(t, w.editorId),
    finance: as(t, w.financeId),
    viewOnly: as(t, w.viewOnlyId),
    outsider: as(t, w.outsiderId),
    otherOwner: as(t, w.otherOwnerId),
    anonymous: t,
  };
}

async function addStaff(env: Env, displayName: string, pin: string, venue: Venue = "a") {
  const b = venue === "b";
  const who = b ? env.other : env.owner;
  const { staffId } = await who.mutation(api.menuStaff.create, {
    menuServiceId: b ? env.w.b.menuServiceId : env.w.a.menuServiceId,
    displayName,
  });
  await who.mutation(api.menuStaff.setPin, { staffId, pin });
  return staffId;
}

/** A PIN sign-in on a NEW device (no device token), so one person may sit on several. */
async function signIn(env: Env, pin: string, venue: Venue = "a") {
  const outcome = await env.t.mutation(api.menuWaiter.loginWithPin, {
    slug: venue === "b" ? SLUG_B : SLUG_A,
    panelCode: venue === "b" ? env.bCode : env.code,
    pin,
  });
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return outcome.sessionToken;
}

const homeOf = (who: Caller, menuServiceId: Id<"menuServices">, fromMs: number = FROM_MS) =>
  who.query(api.menuPanel.home, { menuServiceId, fromMs });

// -----------------------------------------------------------------------------
// Tables, requests, reservations, mail, Room service (what K21 / K25 / K26 / K03 would have written)
// -----------------------------------------------------------------------------

type Table = {
  tenant: MenuTenantSeed;
  positionId: Id<"menuPositions">;
  guestSessionId: Id<"menuGuestSessions">;
  label: string;
};

let keyCounter = 0;

async function addTable(t: T, tenant: MenuTenantSeed, label = "Sto 12"): Promise<Table> {
  keyCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    const menuServiceId = tenant.menuServiceId;
    const positionId = await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: `ps_test${keyCounter}`,
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const guestSessionId = await ctx.db.insert("menuGuestSessions", {
      menuServiceId,
      tokenHash: `guest-token-hash-${keyCounter}`,
      deviceKeyHash: GUEST_DEVICE,
      positionId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + 3 * HOUR,
    });
    return { tenant, positionId, guestSessionId, label };
  });
}

type RequestFields = Partial<Omit<Doc<"menuRequests">, "_id" | "_creationTime">>;

/** `count` requests of one table in one transaction; createdAt = T0 + 1 s × index unless given. */
async function addRequests(t: T, table: Table, count: number, fields: RequestFields = {}) {
  return await t.run(async (ctx) => {
    const ids: Id<"menuRequests">[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(
        await ctx.db.insert("menuRequests", {
          menuServiceId: table.tenant.menuServiceId,
          businessId: table.tenant.businessId,
          kind: "call",
          status: "new",
          channel: "standard",
          positionId: table.positionId,
          positionLabel: table.label,
          positionKind: "table",
          guestSessionId: table.guestSessionId,
          deviceKeyHash: GUEST_DEVICE,
          createdAt: T0 + index * 1000,
          updatedAt: Date.now(),
          ...fields,
        }),
      );
    }
    return ids;
  });
}

type ReservationFields = Partial<Omit<Doc<"menuReservations">, "_id" | "_creationTime">>;

let reservationCounter = 0;

/** A reservation carrying every personal field the form collects. */
async function addReservation(t: T, tenant: MenuTenantSeed, fields: ReservationFields = {}) {
  reservationCounter += 1;
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuReservations", {
      menuServiceId: tenant.menuServiceId,
      businessId: tenant.businessId,
      status: "new",
      guestName: "Marija Gost",
      partySize: 4,
      requestedAt: FROM_MS + DAY,
      contactEmail: "marija.gost@example.com",
      contactPhone: "+381 60 000 0000",
      note: "Slavimo rodjendan",
      cancelTokenHash: `cancel-token-hash-secret-${reservationCounter}`,
      deviceKeyHash: GUEST_DEVICE,
      createdAt: now,
      updatedAt: now,
      ...fields,
    });
  });
}

/** A mailbox row the way K26 stores it: ciphertext only, never a token. */
async function addMailConnection(t: T, tenant: MenuTenantSeed, userId: Id<"users">, status: "active" | "error" | "revoked") {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("menuMailConnections", {
      menuServiceId: tenant.menuServiceId,
      provider: "gmail",
      emailAddress: "info@demo-restoran.example",
      status,
      refreshTokenCiphertext: "dummy-refresh-ciphertext",
      refreshTokenIv: "dummy-refresh-iv",
      accessTokenCiphertext: "dummy-access-ciphertext",
      accessTokenIv: "dummy-access-iv",
      accessTokenExpiresAt: T0 + HOUR,
      keyVersion: 1,
      scopes: ["mail.send"],
      connectedByUserId: userId,
      connectedAt: T0,
      ...(status === "error" ? { lastErrorCode: "mail/token_expired" } : {}),
      ...(status === "revoked" ? { revokedAt: T0 } : {}),
      updatedAt: T0,
    });
  });
}

/** Room service rows of one venue: a category and `plain` + `priced` + `variantPriced` articles in it. */
async function addRoomServiceItems(
  t: T,
  tenant: MenuTenantSeed,
  counts: { plain: number; priced: number; variantPriced: number },
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const menuServiceId = tenant.menuServiceId;
    const categoryId = await ctx.db.insert("menuRoomServiceCategories", {
      menuServiceId,
      key: newMenuKey("roomServiceCategory"),
      name: "Hrana u sobu",
      order: 1024,
      createdAt: now,
      updatedAt: now,
    });
    const warning = { oldBaseRsd: 150, newBaseRsd: 170, at: now };
    const kinds = [
      ...Array.from({ length: counts.plain }, () => "plain" as const),
      ...Array.from({ length: counts.priced }, () => "priced" as const),
      ...Array.from({ length: counts.variantPriced }, () => "variantPriced" as const),
    ];
    let order = 0;
    for (const kind of kinds) {
      order += 1;
      const articleId = await ctx.db.insert("menuArticles", {
        menuServiceId,
        key: newMenuKey("article"),
        kind: "item",
        name: `Jelo broj ${order}`,
        nameNormalized: `jelo broj ${order}`,
        basePriceRsd: 150,
        mediaMode: "none",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("menuRoomServiceItems", {
        menuServiceId,
        categoryId,
        articleId,
        order: order * 1024,
        markupApplies: false,
        ...(kind === "priced" ? { manualPriceRsd: 180, priceWarning: warning } : {}),
        ...(kind === "variantPriced"
          ? { manualVariantPrices: [{ variantKey: "va_test1", priceRsd: 200, priceWarning: warning }] }
          : {}),
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

// -----------------------------------------------------------------------------
// Menu content and the real flow of Objavi
// -----------------------------------------------------------------------------

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
}

async function addArticle(t: T, userId: Id<"users">, sectionId: Id<"menuSections">, name: string, priceRsd: number) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, { sectionId, name, priceRsd });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

/** The real flow of Objavi: preview, then publish exactly that revision and warning set. */
async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const owner = as(t, userId);
  const preview = await owner.query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!preview) throw new Error("publishPreview returned null");
  const result = await owner.mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${JSON.stringify(result)}`);
  return result;
}

/** Values that must never leave through a panel query: secrets of the DB rows. */
async function secretsOf(t: T): Promise<string[]> {
  return await t.run(async (ctx) => {
    const staff = await ctx.db.query("menuStaff").take(100);
    const sessions = await ctx.db.query("menuStaffSessions").take(100);
    const guests = await ctx.db.query("menuGuestSessions").take(100);
    return [
      ...staff.flatMap((row) => [row.pinHash, row.pinLookup]),
      ...sessions.flatMap((row) => [row.tokenHash, row.deviceKeyHash]),
      ...guests.map((row) => row.tokenHash),
    ].filter((value): value is string => typeof value === "string");
  });
}

const LEAK_KEYS = ["deviceKeyHash", "tokenHash", "pinHash", "pinLookup", "cancelTokenHash", "contactEmail", "contactPhone", "guestName"];

/** Deep search of the whole JSON: no secret key, no secret value, and no `@` (no e-mail address anywhere). */
function expectNoLeak(value: unknown, values: string[] = []) {
  const json = JSON.stringify(value);
  for (const needle of [...LEAK_KEYS, ...values]) {
    expect(needle.length, `a real needle (${needle})`).toBeGreaterThan(3);
    expect(json, needle).not.toContain(needle);
  }
  expect(json, "an @ (an e-mail address)").not.toContain("@");
}

// =============================================================================
// 1. Who gets which block
// =============================================================================

describe("home: roles", () => {
  const FRESH_OPERATIONS = {
    lateThresholdMin: 15,
    holdMinutes: 15,
    requests: [],
    requestsTruncated: false,
    reservations: [],
    reservationsTruncated: false,
    staffSessions: [],
  };

  test("the Owner, a Manager and a ScanMe admin get the menu, the operations and the mailbox", async () => {
    const env = await world();
    const who = callers(env);
    const A = env.w.a.menuServiceId;
    const fresh = {
      menu: { state: "never_published", liveVersionNumber: null, livePublishedAt: null, lastEditAt: T0 },
      roomServicePriceWarnings: null,
      operations: FRESH_OPERATIONS,
      mail: { status: "none" },
    };
    for (const name of ["owner", "manager", "admin"] as const) {
      expect(await homeOf(who[name], A), name).toEqual(fresh);
    }
  });

  test("an Urednik gets the menu block and the Room service warnings, but operations and mail are null", async () => {
    const env = await world();
    const { t, w } = env;
    const A = w.a.menuServiceId;
    // There is something to see in both blocks, so a null is a refusal and not an empty block.
    const table = await addTable(t, w.a);
    await addRequests(t, table, 2);
    await addReservation(t, w.a, { status: "new" });
    await addMailConnection(t, w.a, w.ownerId, "error");

    const editor = must(await homeOf(callers(env).editor, A));
    expect(editor.operations).toBeNull();
    expect(editor.mail).toBeNull();
    expect(editor.menu).toEqual({ state: "never_published", liveVersionNumber: null, livePublishedAt: null, lastEditAt: T0 });
    expect(editor.roomServicePriceWarnings).toBeNull();
    expect(Object.keys(editor).sort()).toEqual(["mail", "menu", "operations", "roomServicePriceWarnings"]);
    // The Owner sees both blocks for the same venue at the same moment.
    const owner = must(await homeOf(env.owner, A));
    expect(owner.operations?.requests).toHaveLength(2);
    expect(owner.operations?.reservations).toHaveLength(1);
    expect(owner.mail).toEqual({ status: "error" });

    // With Room service on and a price to look at, the Urednik sees the count too.
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    await env.owner.mutation(api.menuServices.setFeature, { menuServiceId: A, feature: "roomService", enabled: true });
    await addRoomServiceItems(t, w.a, { plain: 1, priced: 1, variantPriced: 0 });
    const warned = must(await homeOf(callers(env).editor, A));
    expect(warned.roomServicePriceWarnings).toBe(1);
    expect(warned.operations).toBeNull();
    expect(warned.mail).toBeNull();
  });

  test("finance, view-only, an outsider, a signed-out caller and another venue's Owner get null; so does a malformed time", async () => {
    const env = await world();
    const A = env.w.a.menuServiceId;
    const who = callers(env);
    for (const name of ["finance", "viewOnly", "outsider", "otherOwner", "anonymous"] as const) {
      expect(await homeOf(who[name], A), name).toBeNull();
    }
    // The other venue's Owner reads his own venue, and the Owner of a has nothing at b.
    expect(await homeOf(who.otherOwner, env.w.b.menuServiceId)).not.toBeNull();
    expect(await homeOf(who.owner, env.w.b.menuServiceId)).toBeNull();
    // No query reads the clock: a time that is not a number is a refusal for everybody.
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const name of ["owner", "editor", "admin"] as const) {
        expect(await homeOf(who[name], A, bad), `${name} ${bad}`).toBeNull();
      }
    }
  });
});

// =============================================================================
// 2. The menu block
// =============================================================================

describe("home: menu block", () => {
  test("never published, then clean after Objavi, then dirty after the next edit", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const editor = callers(env).editor;
    expect(must(await homeOf(owner, A)).menu).toEqual({
      state: "never_published",
      liveVersionNumber: null,
      livePublishedAt: null,
      lastEditAt: T0,
    });

    const drinks = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    await addArticle(t, w.ownerId, drinks.sectionId, "Jelen pivo", 200);
    const publishedAt = T0 + HOUR;
    vi.setSystemTime(publishedAt);
    await publishNow(t, w.ownerId, A);

    const clean = must(await homeOf(owner, A)).menu;
    expect(clean).toMatchObject({ state: "clean", liveVersionNumber: 1, livePublishedAt: publishedAt });
    expect(clean.lastEditAt).toBeLessThanOrEqual(publishedAt);
    expect(must(await homeOf(editor, A)).menu).toEqual(clean);

    // The next edit makes the draft differ from what guests see; the live version stays.
    const editedAt = T0 + 2 * HOUR;
    vi.setSystemTime(editedAt);
    await addSection(t, w.ownerId, w.a.defaultPageId, "Hrana");
    const dirty = must(await homeOf(owner, A)).menu;
    expect(dirty).toEqual({ state: "dirty", liveVersionNumber: 1, livePublishedAt: publishedAt, lastEditAt: editedAt });
    expect(must(await homeOf(editor, A)).menu).toEqual(dirty);

    // Publishing again is clean again, version 2.
    vi.setSystemTime(T0 + 3 * HOUR);
    await publishNow(t, w.ownerId, A);
    expect(must(await homeOf(owner, A)).menu).toMatchObject({
      state: "clean",
      liveVersionNumber: 2,
      livePublishedAt: T0 + 3 * HOUR,
    });
    // The other venue never moved.
    expect(must(await homeOf(env.other, w.b.menuServiceId)).menu.state).toBe("never_published");
  });
});

// =============================================================================
// 3. The operations block
// =============================================================================

describe("home: operations block", () => {
  test("requests: only Novi and Prihvaćen, as kind, status and time; the new ones first", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const table = await addTable(t, w.a);
    await addRequests(t, table, 1, { kind: "call", createdAt: T0 + 3000 });
    await addRequests(t, table, 1, { kind: "order", createdAt: T0 + 1000, itemCount: 2, totalRsd: 640 });
    await addRequests(t, table, 1, { kind: "bill", status: "accepted", createdAt: T0, acceptedAt: T0 + MINUTE });
    await addRequests(t, table, 1, { status: "done", doneAt: T0 });
    await addRequests(t, table, 1, { status: "cancelled", cancelledAt: T0, cancelledBy: "guest" });
    // Another venue's request is not ours.
    await addRequests(t, await addTable(t, w.b, "Sto 3"), 3);

    const operations = must(must(await homeOf(owner, w.a.menuServiceId)).operations);
    expect(operations.requests).toEqual([
      { kind: "order", status: "new", createdAt: T0 + 1000 },
      { kind: "call", status: "new", createdAt: T0 + 3000 },
      { kind: "bill", status: "accepted", createdAt: T0 },
    ]);
    expect(operations.requestsTruncated).toBe(false);
    // The oldest first inside a status; nothing else leaves (no id, position, zone, guest data).
    for (const row of operations.requests) expect(Object.keys(row).sort()).toEqual(["createdAt", "kind", "status"]);
  });

  test("at most 300 requests per status, with requestsTruncated", { timeout: 60_000 }, async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const table = await addTable(t, w.a);
    await addRequests(t, table, MENU_MAX_ACTIVE_REQUESTS);
    let operations = must(must(await homeOf(owner, A)).operations);
    expect(operations.requests).toHaveLength(300);
    expect(operations.requestsTruncated).toBe(false);

    await addRequests(t, table, 1, { createdAt: T0 + 300 * 1000 }); // the 301st `new`
    await addRequests(t, table, 2, { status: "accepted", acceptedAt: T0 });
    operations = must(must(await homeOf(owner, A)).operations);
    expect(operations.requestsTruncated).toBe(true);
    expect(operations.requests.filter((row) => row.status === "new")).toHaveLength(300);
    expect(operations.requests.filter((row) => row.status === "accepted")).toHaveLength(2);
    expect(Math.max(...operations.requests.filter((row) => row.status === "new").map((row) => row.createdAt))).toBe(T0 + 299 * 1000);
  });

  test("staff sessions: one entry per person with the later expiry; signed-out, deactivated and old sessions are gone", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const anaId = await addStaff(env, "Ana", "246");
    const markoId = await addStaff(env, "Marko", "135");
    await addStaff(env, "Petar", "357"); // never signs in
    const dragan = await addStaff(env, "Dragan", "468");

    await signIn(env, "246"); // Ana on the first phone, T0
    vi.setSystemTime(T0 + MINUTE);
    await signIn(env, "246"); // ...and on a second device: two live sessions, one person
    const marko = await signIn(env, "135");
    await signIn(env, "468");
    const live = await t.run(async (ctx) => (await ctx.db.query("menuStaffSessions").take(20)).filter((row) => row.endedAt === undefined));
    expect(live).toHaveLength(4);

    const entries = (await homeOf(owner, A))?.operations?.staffSessions ?? [];
    expect(entries.map((entry) => entry.staffId).sort()).toEqual([anaId, markoId, dragan].sort());
    expect(entries.find((entry) => entry.staffId === anaId)).toEqual({ staffId: anaId, expiresAt: T0 + MINUTE + STAFF_SESSION_MS });
    for (const entry of entries) expect(Object.keys(entry).sort()).toEqual(["expiresAt", "staffId"]);

    // Marko signs out, Dragan is deactivated: both leave. Ana's other session is still hers.
    expect(
      await t.mutation(api.menuWaiter.logout, { slug: SLUG_A, panelCode: env.code, sessionToken: marko }),
    ).toEqual({ ok: true });
    expect(await owner.mutation(api.menuStaff.deactivate, { staffId: dragan })).toMatchObject({ ok: true });
    let after = (await homeOf(owner, A))?.operations?.staffSessions ?? [];
    expect(after.map((entry) => entry.staffId)).toEqual([anaId]);

    // A session that expired exactly at `fromMs` is not read; one expiring a moment later is (the device compares with its clock).
    const sessionId = await t.run(async (ctx) => {
      return await ctx.db.insert("menuStaffSessions", {
        menuServiceId: A,
        staffId: markoId,
        deviceKeyHash: "old-device",
        tokenHash: "old-session-token-hash",
        createdAt: FROM_MS - 11 * HOUR,
        expiresAt: FROM_MS,
      });
    });
    after = (await homeOf(owner, A))?.operations?.staffSessions ?? [];
    expect(after.map((entry) => entry.staffId)).toEqual([anaId]);
    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, { expiresAt: FROM_MS + 1 });
    });
    after = (await homeOf(owner, A))?.operations?.staffSessions ?? [];
    expect(after.map((entry) => entry.staffId).sort()).toEqual([anaId, markoId].sort());

    // Another venue's waiter is not ours.
    await addStaff(env, "Jelena", "555", "b");
    await signIn(env, "555", "b");
    expect((await homeOf(owner, A))?.operations?.staffSessions).toHaveLength(2);
    expect((await homeOf(env.other, w.b.menuServiceId))?.operations?.staffSessions).toHaveLength(1);
  });

  test("reservations: the waiting ones whatever the date, accepted and arrived ones in the window; only the five safe fields", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const WINDOW = MENU_RESERVATION_PANEL_WINDOW_MS;
    const at = async (status: Doc<"menuReservations">["status"], requestedAt: number, fields: ReservationFields = {}) =>
      await addReservation(t, w.a, { status, requestedAt, ...fields });

    const waitingPast = await at("new", FROM_MS - 40 * DAY);
    const waitingFuture = await at("new", FROM_MS + 40 * DAY);
    const proposed = await at("change_proposed", FROM_MS + HOUR);
    const acceptedFirst = await at("accepted", FROM_MS, { positionLabel: "Sto 5" });
    const acceptedLast = await at("accepted", FROM_MS + WINDOW - 1);
    const arrivedFirst = await at("arrived", FROM_MS);
    await at("accepted", FROM_MS - 1);
    await at("accepted", FROM_MS + WINDOW);
    await at("arrived", FROM_MS - 1);
    await at("declined", FROM_MS + HOUR);
    await at("cancelled", FROM_MS + HOUR);
    await addReservation(t, w.b, { status: "new", requestedAt: FROM_MS + HOUR });

    const operations = must(must(await homeOf(owner, w.a.menuServiceId)).operations);
    expect(operations.reservations.map((row) => row.id).sort()).toEqual(
      [waitingPast, waitingFuture, proposed, acceptedFirst, acceptedLast, arrivedFirst].sort(),
    );
    expect(operations.reservationsTruncated).toBe(false);
    for (const row of operations.reservations) {
      expect(Object.keys(row).sort()).toEqual(["id", "partySize", "positionLabel", "requestedAt", "status"]);
    }
    expect(operations.reservations.find((row) => row.id === acceptedFirst)).toEqual({
      id: acceptedFirst,
      status: "accepted",
      requestedAt: FROM_MS,
      partySize: 4,
      positionLabel: "Sto 5",
    });
  });

  test("reservations: at most 200 per status, with reservationsTruncated", { timeout: 60_000 }, async () => {
    const env = await world();
    const { t, w, owner } = env;
    expect(MENU_MAX_PANEL_RESERVATIONS).toBe(200);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let index = 0; index < MENU_MAX_PANEL_RESERVATIONS + 1; index += 1) {
        await ctx.db.insert("menuReservations", {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          status: "new",
          guestName: "Marija Gost",
          partySize: 2,
          requestedAt: FROM_MS + DAY + index * MINUTE,
          cancelTokenHash: `cancel-token-hash-bulk-${index}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const operations = must(must(await homeOf(owner, w.a.menuServiceId)).operations);
    expect(operations.reservations).toHaveLength(200);
    expect(operations.reservationsTruncated).toBe(true);
  });

  test("the venue's own thresholds are passed on", async () => {
    const env = await world();
    const { w, owner } = env;
    const A = w.a.menuServiceId;
    await owner.mutation(api.menuSettings.setPanelTiming, { menuServiceId: A, lateThresholdMin: 20, reminderMin: 5 });
    await owner.mutation(api.menuSettings.setReservationHold, { menuServiceId: A, holdMinutes: 30 });
    expect(must(await homeOf(owner, A)).operations).toMatchObject({ lateThresholdMin: 20, holdMinutes: 30 });
    expect(must(await homeOf(env.other, w.b.menuServiceId)).operations).toMatchObject({ lateThresholdMin: 15, holdMinutes: 15 });
  });

  test("no guest contact, note, device pseudonym, hash, token or e-mail address is in the answer", async () => {
    const env = await world();
    const { t, w } = env;
    const A = w.a.menuServiceId;
    const table = await addTable(t, w.a);
    await addRequests(t, table, 2, { kind: "order", itemCount: 1, totalRsd: 450, sourceLabel: "Kartica 12-B" });
    await addReservation(t, w.a, { status: "new" });
    await addReservation(t, w.a, { status: "accepted", positionLabel: "Sto 5" });
    await addStaff(env, "Ana", "246");
    const ana = await signIn(env, "246");
    await addMailConnection(t, w.a, w.ownerId, "error");

    const secrets = [
      GUEST_DEVICE,
      ana,
      env.code,
      "marija.gost",
      "Marija Gost",
      "+381 60",
      "Slavimo rodjendan",
      "cancel-token-hash-secret",
      "info@demo-restoran",
      "dummy-refresh-ciphertext",
      "dummy-access-ciphertext",
      "Kartica 12-B",
      ...(await secretsOf(t)),
    ];
    const who = callers(env);
    for (const name of ["owner", "manager", "admin", "editor"] as const) {
      const home = await homeOf(who[name], A);
      expect(home, name).not.toBeNull();
      expectNoLeak(home, secrets);
    }
    const ownerHome = must(await homeOf(who.owner, A));
    expect(ownerHome.operations?.requests.length).toBe(2);
    expect(ownerHome.operations?.reservations.length).toBe(2);
    expect(ownerHome.operations?.staffSessions.length).toBe(1);
    expect(ownerHome.mail).toEqual({ status: "error" });
    expect(JSON.stringify(ownerHome)).not.toContain('"note"');
  });
});

// =============================================================================
// 4. The mailbox block
// =============================================================================

describe("home: mail block", () => {
  test("none without a connection; active and error as stored; a revoked one is none again", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    const who = callers(env);
    for (const name of ["owner", "manager", "admin"] as const) {
      expect((await homeOf(who[name], A))?.mail, name).toEqual({ status: "none" });
    }

    const rowId = await addMailConnection(t, w.a, w.ownerId, "active");
    for (const name of ["owner", "manager", "admin"] as const) {
      expect((await homeOf(who[name], A))?.mail, name).toEqual({ status: "active" });
    }
    await t.run(async (ctx) => {
      await ctx.db.patch(rowId, { status: "error", lastErrorCode: "mail/token_expired" });
    });
    expect(must(await homeOf(owner, A)).mail).toEqual({ status: "error" });
    await t.run(async (ctx) => {
      await ctx.db.patch(rowId, { status: "revoked", revokedAt: T0 });
    });
    expect(must(await homeOf(owner, A)).mail).toEqual({ status: "none" });
  });

  test("only the venue's own connection counts, and the Urednik never sees the block", async () => {
    const env = await world();
    const { t, w, owner, other } = env;
    await addMailConnection(t, w.b, w.otherOwnerId, "error");
    expect(must(await homeOf(owner, w.a.menuServiceId)).mail).toEqual({ status: "none" });
    expect(must(await homeOf(other, w.b.menuServiceId)).mail).toEqual({ status: "error" });

    await addMailConnection(t, w.a, w.ownerId, "error");
    expect(must(await homeOf(callers(env).editor, w.a.menuServiceId)).mail).toBeNull();
    // The address and the ciphertext are not part of the answer: the status is all there is.
    expectNoLeak(await homeOf(owner, w.a.menuServiceId), ["info@demo-restoran", "dummy-refresh-ciphertext", "dummy-access-ciphertext", "dummy-refresh-iv"]);
  });
});

// =============================================================================
// 5. Room service price warnings
// =============================================================================

describe("home: Room service price warnings", () => {
  const warningsOf = async (who: Caller, menuServiceId: Id<"menuServices">) => (await homeOf(who, menuServiceId))?.roomServicePriceWarnings;

  test("null while Room service is off, even on Premium and even with warnings stored", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    await addRoomServiceItems(t, w.a, { plain: 1, priced: 2, variantPriced: 1 });
    expect(await warningsOf(owner, A)).toBeNull(); // Standard, off
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    expect(await warningsOf(owner, A)).toBeNull(); // Premium, but the switch is off
  });

  test("a count once Premium AND switched on: a warned price or a warned variant price each count once", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    await owner.mutation(api.menuServices.setFeature, { menuServiceId: A, feature: "roomService", enabled: true });
    // On, nothing to look at: zero, not null.
    expect(await warningsOf(owner, A)).toBe(0);

    await addRoomServiceItems(t, w.a, { plain: 2, priced: 2, variantPriced: 1 });
    // Another venue's warnings are not counted.
    await addRoomServiceItems(t, w.b, { plain: 0, priced: 5, variantPriced: 0 });
    const who = callers(env);
    for (const name of ["owner", "manager", "admin", "editor"] as const) {
      expect(await warningsOf(who[name], A), name).toBe(3);
    }
    // The same count is part of the whole answer, not a separate query.
    expect(must(await homeOf(owner, A))).toMatchObject({ roomServicePriceWarnings: 3 });
  });

  test("null again when Premium is lost while the switch stays on", async () => {
    const env = await world();
    const { t, w, owner } = env;
    const A = w.a.menuServiceId;
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    await owner.mutation(api.menuServices.setFeature, { menuServiceId: A, feature: "roomService", enabled: true });
    await addRoomServiceItems(t, w.a, { plain: 0, priced: 2, variantPriced: 0 });
    expect(await warningsOf(owner, A)).toBe(2);

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.accountId, { plan: "basic" });
    });
    expect((await t.run(async (ctx) => await ctx.db.get(A)))?.features.roomService).toBe(true); // still stored as on
    expect(await warningsOf(owner, A)).toBeNull();
    expect(await warningsOf(callers(env).editor, A)).toBeNull();
  });
});
