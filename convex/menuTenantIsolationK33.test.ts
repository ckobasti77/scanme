/// <reference types="vite/client" />

// ScanMe Menu V1 - K33 (hardening): the tenant isolation checklist. ONE file
// that proves, in one place, that venue "Kafana kod Mike" (a) and venue "Demo
// restoran" (b) never see or change each other's data, for the five areas of
// the acceptance step: MENI (editor, catalog, publication), ZAHTEVI GOSTA,
// REZERVACIJE, ANALITIKA and TIM. The older tests are spread over the modules;
// this is the checklist. Fictional data only (the repo is public).
//
// The four attacks, per area:
//   (a) a wrong QR card / token of the other venue (guest hop, cancel link,
//       invitation link, an event that names the other venue's card)
//   (b) the PIN or the staff session of the other venue
//   (c) the signed-in owner of the other account
//   (d) people without the right: Urednik, finance, view-only, outsiders,
//       anonymous callers (the PIN waiter's device has no account, so it is an
//       anonymous caller for every account function)
// A refusal is proved by the exact code or answer shape the module returns, and
// by the rows: every attack test takes a snapshot of the tables the area can
// write (through t.run, before and after) and expects it to be IDENTICAL.
// Every attack test has a control (the rightful caller works) so that a refusal
// is never an accident of the setup, and the first describe ("CONTROL") runs the
// attack helpers and the snapshots against the rightful caller: they pass, and
// the snapshot sees the write.
//
// Matrix: area x attack -> the test that covers it ("n/p" = not applicable).
//
// MENI (editor, catalog, publication)
//   (a) "MENI (a): a card of venue b opens venue b only, and a link cannot point into another venue's page"
//       (the editor itself takes no card; the guest face of the offer does)
//   (b) n/p - no editor or publication function accepts a staff session (the
//       PIN waiter has no account); the closest cases are the (d) test of the
//       PIN waiter and the ZAHTEVI (b) tests
//   (c) "MENI (c): the owner of the other venue reads and changes nothing in the editor, availability and publication"
//       "MENI (c): rows of one venue never join the other, not even for the same owner or ScanMe admin"
//   (d) "MENI (d): finance, view-only, outsiders and anonymous callers have no Menu access"
//       "MENI (d): an Urednik edits and publishes but cannot change features or hours, and the PIN waiter has no menu rights"
//
// ZAHTEVI GOSTA (guest actions and the waiter queue)
//   (a) "ZAHTEVI (a): a guest token and a device of venue b are nobody at venue a"
//       "ZAHTEVI (a): the same phone at both venues has two unrelated request lists"
//       "ZAHTEVI (a): an order that names the page or article of venue b is refused at venue a"
//       "ZAHTEVI (a): a card whose link crosses into another venue opens no table session"
//   (b) "ZAHTEVI (b): a PIN of venue b opens nothing at venue a, and a foreign panel link is a 404"
//       "ZAHTEVI (b): a staff session of venue b is nobody at venue a (queue, detail, floor, every action)"
//       "ZAHTEVI (b): a waiter of one venue cannot reach the request, table, staff or zone of the other"
//   (c) "ZAHTEVI (c): the owner of the other venue reads and changes nothing in the queue and Operativa"
//       "ZAHTEVI (c): the owner of one venue cannot act on the other venue's request from his own panel"
//   (d) "ZAHTEVI (d): Urednik, finance, view-only, outsiders and anonymous callers have no queue and no Operativa"
//       "ZAHTEVI (d): a plain PIN waiter and a guest token cannot manage zones, remind staff or act as staff"
//
// REZERVACIJE
//   (a) "REZERVACIJE (a): the cancel link, device and key of venue b's reservation do nothing at venue a"
//       "REZERVACIJE (a): the form of venue a writes into venue a only"
//   (b) "REZERVACIJE (b): a staff session of venue b is nobody at the reservation panel of venue a"
//       "REZERVACIJE (b): staff of one venue cannot reach, or bind a table of, the other venue's reservation"
//   (c) "REZERVACIJE (c): the owner of the other venue reads and changes no reservation"
//       "REZERVACIJE (c): the owner of the other venue cannot switch the form, the hours or the modules"
//   (d) "REZERVACIJE (d): Urednik, finance, view-only, outsiders and anonymous callers cannot work reservations or change their settings"
//
// ANALITIKA
//   (a) "ANALITIKA (a): events that name a card of venue b, sent to venue a's slug, count for venue a only"
//   (b) n/p - the three queries take no staff session and ingest takes no
//       identity at all (the PIN waiter is an anonymous caller: see (d))
//   (c) "ANALITIKA (c): the owner of the other venue reads nothing of the analytics"
//   (d) "ANALITIKA (d): Urednik, finance, view-only, outsiders and anonymous callers get null"
//
// TIM (team and staff)
//   (a) "TIM (a): an invitation link of venue a is useless to the accounts of venue b"
//       (no QR here; the link token is the closest thing)
//   (b) "TIM (b): the same PIN digits may live in both venues, each opens only its own member"
//       "TIM (b): rotating the panel code and lifting the PIN locks of venue a never touch venue b"
//   (c) "TIM (c): the owner of venue b reads and changes nothing of venue a's team and staff"
//       "TIM (c): the owner of venue a cannot touch venue b's team and staff either"
//   (d) "TIM (d): Urednik, finance, view-only, outsiders and anonymous callers cannot manage the team or the staff"
//       "TIM (d): a PIN waiter has no account: no team, no staff and no PIN management"

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { GuestRequestOutcome } from "./menuGuest";
import schema from "./schema";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { REQUEST_ERROR } from "../lib/menu/errors/requests";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { TEAM_ERROR } from "../lib/menu/errors/team";
import { STAFF_ERROR } from "../lib/menu/errors/waiter";
import { inviteTokenHash } from "../lib/menu/invite";
import { newMenuKey } from "../lib/menu/keys";
import { permissionsOf } from "../lib/menu/permissions";
import { deviceKeyHashFor, newMenuToken } from "../lib/menu/tokens";
import { addDays } from "../lib/menu/working-hours";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addMenuMember,
  grantAccountPremium,
  seedMenuWorld,
  seedQrLink,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

const PEPPER = "test-pepper-0123456789abcdef";
const TIMEOUT = 60_000;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.MENU_PIN_PEPPER = PEPPER;
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

/** The ConvexError code a call is refused with, or "ok" when it went through. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(/\b(?:menu|team|staff|request|reservation|plan|analytics)\/[a-z_]+/)?.[0] ?? text;
  }
}

// -----------------------------------------------------------------------------
// Time (frozen: T0 is Wednesday 2026-10-21 10:00 in Belgrade, CEST)
// -----------------------------------------------------------------------------

const T0 = Date.UTC(2026, 9, 21, 8, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** What the panel passes as `fromMs`: the start of the current hour minus 12 hours. */
const FROM_MS = T0 - 12 * HOUR;
/** The device's Belgrade day at T0 (the analytics queries never read the clock). */
const DANAS = "2026-10-21";
const dan = (back: number) => addDays(DANAS, -back);

function belgrade(local: string): number {
  return must(belgradeLocalToEpoch(local), `a Belgrade time for ${local}`);
}
/** Thursday 19:00 in Belgrade: inside the hours, on the grid, more than a day ahead. */
const THU_19 = belgrade("2026-10-22T19:00");
const PROPOSED_AT = belgrade("2026-10-22T21:00");

const DAILY = [{ start: 12 * 60, end: 23 * 60 }];
const LATE = [{ start: 12 * 60, end: 25 * 60 }];
const WEEK = { days: [DAILY, DAILY, DAILY, DAILY, LATE, LATE, DAILY] };
const CLOSED_WEEK = { days: [[], [], [], [], [], [], []] };

const SIGNED_OUT = { ok: false, code: STAFF_ERROR.signedOut };
const NOT_FOUND_REQUEST = { ok: false, code: REQUEST_ERROR.notFound };
const NOT_FOUND_RESERVATION = { ok: false, code: RESERVATION_ERROR.notFound };
/** The pseudonym of a guest's phone on rows written straight into the table. */
const GUEST_DEVICE = "guest-device-pseudonym-6f2c1a";

// -----------------------------------------------------------------------------
// The world: two venues, two owners, two panel codes
// -----------------------------------------------------------------------------

async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const ownerA = as(t, w.ownerId);
  const ownerB = as(t, w.otherOwnerId);
  const { code: codeA } = await ownerA.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.a.menuServiceId });
  const { code: codeB } = await ownerB.mutation(api.menuStaff.ensurePanelCode, { menuServiceId: w.b.menuServiceId });
  return { t, w, ownerA, ownerB, codeA, codeB };
}
type Env = Awaited<ReturnType<typeof world>>;
type Venue = "a" | "b";

const slugOf = (venue: Venue) => (venue === "a" ? SLUG_A : SLUG_B);
const tenantOf = (env: Env, venue: Venue): MenuTenantSeed => (venue === "a" ? env.w.a : env.w.b);
const ownerOf = (env: Env, venue: Venue) => (venue === "a" ? env.ownerA : env.ownerB);
const codeFor = (env: Env, venue: Venue) => (venue === "a" ? env.codeA : env.codeB);
const ownerIdOf = (env: Env, venue: Venue) => (venue === "a" ? env.w.ownerId : env.w.otherOwnerId);

type PanelArgs = { slug: string; panelCode: string; sessionToken?: string };
type TokenPanel = { slug: string; panelCode: string; sessionToken: string };

function panel(env: Env, venue: Venue, sessionToken?: string): PanelArgs {
  return {
    slug: slugOf(venue),
    panelCode: codeFor(env, venue),
    ...(sessionToken !== undefined ? { sessionToken } : {}),
  };
}
const homeOf = (env: Env, venue: Venue) => ({ slug: slugOf(venue), panelCode: codeFor(env, venue) });

/** Callers that have no right at venue a: Urednik, finance, view-only, an outsider and nobody. */
function noRights(env: Env): [string, Caller][] {
  return [
    ["editor", as(env.t, env.w.editorId)],
    ["finance", as(env.t, env.w.financeId)],
    ["viewOnly", as(env.t, env.w.viewOnlyId)],
    ["outsider", as(env.t, env.w.outsiderId)],
    ["anonymous", env.t],
  ];
}

/** Every row of the given tables, to prove that a refusal wrote nothing and changed nothing. */
async function dump<K extends TableNames>(t: T, tables: readonly K[]) {
  return await t.run(async (ctx) => {
    const rows: Record<string, unknown[]> = {};
    for (const table of tables) rows[table] = await ctx.db.query(table).take(5000);
    return rows;
  });
}

let ipSeq = 0;
/** A fresh IP bucket key (32 lowercase hex characters) so that no per-IP bucket is what refuses. */
function nextIp(): string {
  ipSeq += 1;
  return ipSeq.toString(16).padStart(32, "0");
}

// -----------------------------------------------------------------------------
// PIN staff and the waiter panel
// -----------------------------------------------------------------------------

async function addStaff(
  env: Env,
  venue: Venue,
  displayName: string,
  pin?: string,
  panelRole?: "staff" | "manager",
) {
  const owner = ownerOf(env, venue);
  const { staffId } = await owner.mutation(api.menuStaff.create, {
    menuServiceId: tenantOf(env, venue).menuServiceId,
    displayName,
    ...(panelRole ? { panelRole } : {}),
  });
  if (pin) await owner.mutation(api.menuStaff.setPin, { staffId, pin });
  return staffId;
}

function loginAt(env: Env, at: { slug: string; panelCode: string }, pin: string, deviceToken?: string) {
  return env.t.mutation(api.menuWaiter.loginWithPin, {
    slug: at.slug,
    panelCode: at.panelCode,
    pin,
    ipHash: nextIp(),
    ...(deviceToken ? { deviceToken } : {}),
  });
}

async function signedInStaff(
  env: Env,
  venue: Venue,
  displayName: string,
  pin: string,
  panelRole?: "staff" | "manager",
) {
  const staffId = await addStaff(env, venue, displayName, pin, panelRole);
  const outcome = await loginAt(env, homeOf(env, venue), pin);
  if (!outcome.ok) throw new Error(`sign-in refused: ${JSON.stringify(outcome)}`);
  return { staffId, token: outcome.sessionToken, deviceToken: outcome.deviceToken };
}

/** What the attacker aims at on the other side of the wall. */
type WaiterTarget = {
  requestId: Id<"menuRequests">;
  positionId: Id<"menuPositions">;
  staffId: Id<"menuStaff">;
};

/** Six waiter reads; every one is null for anybody who is not at the door of THIS panel. */
async function waiterReads(caller: Caller, p: PanelArgs, target: WaiterTarget) {
  return [
    await caller.query(api.menuWaiter.me, p),
    await caller.query(api.menuWaiter.activeRequests, p),
    await caller.query(api.menuWaiter.requestDetail, { ...p, requestId: target.requestId }),
    await caller.query(api.menuWaiter.floor, p),
    await caller.query(api.menuWaiter.occupancy, p),
    await caller.query(api.menuWaiter.positionDetail, { ...p, positionId: target.positionId }),
  ];
}

/** Preuzmi, Zavrsi and Otkazi on one request; one answer each. */
async function actOn(caller: Caller, p: PanelArgs, requestId: Id<"menuRequests">) {
  return [
    await caller.mutation(api.menuWaiter.accept, { ...p, requestId }),
    await caller.mutation(api.menuWaiter.complete, { ...p, requestId }),
    await caller.mutation(api.menuWaiter.cancel, { ...p, requestId }),
  ];
}

/** Six waiter writes; every one is staff/signed_out for anybody who is not at the door of THIS panel. */
async function waiterWrites(caller: Caller, p: PanelArgs, target: WaiterTarget) {
  return [
    await caller.mutation(api.menuWaiter.accept, { ...p, requestId: target.requestId }),
    await caller.mutation(api.menuWaiter.complete, { ...p, requestId: target.requestId }),
    await caller.mutation(api.menuWaiter.cancel, { ...p, requestId: target.requestId }),
    await caller.mutation(api.menuWaiter.setOccupancy, { ...p, positionId: target.positionId, state: "occupied" }),
    await caller.mutation(api.menuWaiter.setMyZone, { ...p, zoneId: null }),
    await caller.mutation(api.menuWaiter.setStaffZone, { ...p, staffId: target.staffId, zoneId: null }),
  ];
}

const WAITER_TABLES = [
  "menuRequests",
  "menuRequestItems",
  "menuPositionOccupancy",
  "menuStaffNotices",
  "menuStaff",
  "menuStaffSessions",
  "menuPinAttempts",
  "menuZones",
  "menuAuditLog",
  "menuAnalyticsEvents",
] as const;

// -----------------------------------------------------------------------------
// Tables, requests, zones (what the guest side would have written)
// -----------------------------------------------------------------------------

async function addPosition(env: Env, venue: Venue, label: string, zoneId?: Id<"menuZones">) {
  const tenant = tenantOf(env, venue);
  return await env.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId: tenant.menuServiceId,
      key: newMenuKey("position"),
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      ...(zoneId ? { zoneId } : {}),
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function addZone(env: Env, venue: Venue, name: string) {
  const tenant = tenantOf(env, venue);
  return await env.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuZones", {
      menuServiceId: tenant.menuServiceId,
      key: newMenuKey("zone"),
      name,
      nameNormalized: name.toLowerCase(),
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** A table with the guest session a request would hang on. */
async function addTable(env: Env, venue: Venue, label = "Sto 12") {
  const positionId = await addPosition(env, venue, label);
  const tenant = tenantOf(env, venue);
  const guestSessionId = await env.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuGuestSessions", {
      menuServiceId: tenant.menuServiceId,
      tokenHash: `guest-token-hash-${venue}-${label}`,
      deviceKeyHash: GUEST_DEVICE,
      positionId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + 3 * HOUR,
    });
  });
  return { venue, positionId, guestSessionId, label };
}
type Table = Awaited<ReturnType<typeof addTable>>;

async function addRequest(
  env: Env,
  table: Table,
  fields: Partial<Omit<Doc<"menuRequests">, "_id" | "_creationTime">> = {},
) {
  const tenant = tenantOf(env, table.venue);
  return await env.t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuRequests", {
      menuServiceId: tenant.menuServiceId,
      businessId: tenant.businessId,
      kind: "call",
      status: "new",
      channel: "standard",
      positionId: table.positionId,
      positionLabel: table.label,
      positionKind: "table",
      guestSessionId: table.guestSessionId,
      deviceKeyHash: GUEST_DEVICE,
      createdAt: now,
      updatedAt: now,
      ...fields,
    });
  });
}

/** One table with one open request in each venue. */
async function bothVenues(env: Env) {
  const tableA = await addTable(env, "a");
  const tableB = await addTable(env, "b");
  const requestA = await addRequest(env, tableA);
  const requestB = await addRequest(env, tableB);
  return { tableA, tableB, requestA, requestB };
}

// -----------------------------------------------------------------------------
// The menu (content, publication) and the guest side of a scanned table
// -----------------------------------------------------------------------------

const CONTENT = {
  a: { section: "Pića", article: "Jelen pivo", priceRsd: 200 },
  b: { section: "Jela", article: "Pasta karbonara", priceRsd: 890 },
} as const;

async function publishAll(owner: Caller, menuServiceId: Id<"menuServices">) {
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

/** One section with one article on the default page, the guest switches on, and a publication. */
async function goLive(env: Env, venue: Venue) {
  const owner = ownerOf(env, venue);
  const tenant = tenantOf(env, venue);
  const content = CONTENT[venue];
  const section = await owner.mutation(api.menuCatalog.addSection, { pageId: tenant.defaultPageId, name: content.section });
  const created = await owner.mutation(api.menuCatalog.quickAddArticle, {
    sectionId: section.sectionId,
    name: content.article,
    priceRsd: content.priceRsd,
  });
  if (created.status !== "created") throw new Error(`expected created, got ${created.status}`);
  for (const feature of ["callWaiter", "billRequest", "ordering"] as const) {
    await owner.mutation(api.menuServices.setFeature, { menuServiceId: tenant.menuServiceId, feature, enabled: true });
  }
  await publishAll(owner, tenant.menuServiceId);
  return {
    menuServiceId: tenant.menuServiceId,
    pageId: tenant.defaultPageId,
    sectionId: section.sectionId,
    articleId: created.articleId,
    placementId: created.placementId,
    priceRsd: content.priceRsd,
  };
}
type LiveMenu = Awaited<ReturnType<typeof goLive>>;

let cardSeq = 0;
/** Card codes avoid I, L, O and U (the resolver alphabet). */
function nextCardCode() {
  cardSeq += 1;
  return `KT${String(cardSeq).padStart(6, "0")}`;
}

/**
 * A Menu card of `card`'s business whose link row sits in `link`'s Menu service:
 * the same venue for an honest card, different venues for a crossed one.
 */
async function qrCard(
  env: Env,
  input: { cardCode: string; card: Venue; link: Venue; positionId?: Id<"menuPositions">; pageKey?: string },
) {
  const cardTenant = tenantOf(env, input.card);
  const linkTenant = tenantOf(env, input.link);
  return await env.t.run(async (ctx) => {
    const seeded = await seedQrLink(ctx, {
      menuServiceId: linkTenant.menuServiceId,
      businessId: cardTenant.businessId,
      pageKey: input.pageKey ?? "unused",
      createdByUserId: env.w.adminId,
      cardCode: input.cardCode,
    });
    await ctx.db.patch(seeded.linkId, { pageKey: input.pageKey, positionId: input.positionId });
    return seeded;
  });
}

function hop(env: Env, cardCode: string, deviceToken?: string) {
  return env.t.mutation(api.menuGuest.mintFromCard, {
    cardCode,
    ipHash: nextIp(),
    ...(deviceToken ? { deviceToken } : {}),
  });
}

/** A new table with a card on it and a phone that scanned the card (the real hop). */
async function seat(env: Env, venue: Venue, label: string, deviceToken?: string) {
  const positionId = await addPosition(env, venue, label);
  const cardCode = nextCardCode();
  const { cardId } = await qrCard(env, { cardCode, card: venue, link: venue, positionId });
  const outcome = await hop(env, cardCode, deviceToken);
  if (outcome.kind !== "menu" || !outcome.session) throw new Error(`expected a session, got ${JSON.stringify(outcome)}`);
  return {
    venue,
    positionId,
    cardId,
    cardCode,
    guestToken: outcome.session.guestToken,
    deviceToken: outcome.session.deviceToken,
  };
}

const BOGUS_LINE = {
  pageKey: "pg_nepoznata",
  articleKey: "ar_nepoznat",
  variantKey: null,
  addonKeys: [] as string[],
  quantity: 1,
  note: null,
};

const callWaiter = (env: Env, slug: string, guestToken: string) =>
  env.t.mutation(api.menuGuest.callWaiter, { slug, guestToken, ipHash: nextIp() });
const requestBill = (env: Env, slug: string, guestToken: string) =>
  env.t.mutation(api.menuGuest.requestBill, { slug, guestToken, ipHash: nextIp(), payment: "cash" });
const submitOrder = (env: Env, slug: string, guestToken: string) =>
  env.t.mutation(api.menuGuest.submitOrder, {
    slug,
    guestToken,
    ipHash: nextIp(),
    channel: "standard",
    lines: [BOGUS_LINE],
    seenTotalRsd: 100,
  });
const cancelRequest = (env: Env, slug: string, deviceToken: string, requestId: string) =>
  env.t.mutation(api.menuGuest.cancelRequest, { slug, deviceToken, requestId, ipHash: nextIp() });
const myRequests = (env: Env, slug: string, deviceKey: string) =>
  env.t.query(api.menuGuest.myRequests, { slug, deviceKey });
const sessionView = (env: Env, slug: string, guestToken: string) =>
  env.t.query(api.menuGuest.sessionView, { slug, guestToken });

function idOf(outcome: GuestRequestOutcome): Id<"menuRequests"> {
  if (!outcome.ok || outcome.requestId === null) throw new Error(`expected a request id, got ${JSON.stringify(outcome)}`);
  return outcome.requestId;
}
const idsOf = (list: { id: string }[] | null) => (list ?? []).map((row) => row.id);

const GUEST_TABLES = [
  "menuRequests",
  "menuRequestItems",
  "menuGuestSessions",
  "menuPositionOccupancy",
  "menuStaffNotices",
  "menuAuditLog",
  "menuAnalyticsEvents",
] as const;

// -----------------------------------------------------------------------------
// Reservations
// -----------------------------------------------------------------------------

/** The working hours, then the ScanMe form, for one venue (what its owner does in the panel). */
async function openForm(env: Env, venue: Venue) {
  const owner = ownerOf(env, venue);
  const menuServiceId = tenantOf(env, venue).menuServiceId;
  await owner.mutation(api.menuSettings.setWorkingHours, { menuServiceId, workingHours: WEEK });
  const outcome = await owner.mutation(api.menuServices.setReservations, { menuServiceId, mode: "form", contact: "both" });
  if (!outcome.ok) throw new Error(`setReservations refused: ${JSON.stringify(outcome)}`);
}

type SubmitArgs = FunctionArgs<typeof api.menuReservations.submit>;
let requestSeq = 0;

/** A valid request of a fresh phone; returns the guest's secrets too. */
async function guestRequest(env: Env, venue: Venue) {
  requestSeq += 1;
  const args: SubmitArgs = {
    slug: slugOf(venue),
    deviceToken: newMenuToken(),
    clientRequestId: `req-${String(requestSeq).padStart(8, "0")}`,
    cancelToken: newMenuToken(),
    guestName: "Marija Gost",
    partySize: 4,
    requestedAt: THU_19,
    contactEmail: "gost@example.com",
    contactPhone: "+381 60 000 0000",
    ipHash: nextIp(),
  };
  const result = await env.t.mutation(api.menuReservations.submit, args);
  if (!result.ok) throw new Error(`submit refused: ${JSON.stringify(result)}`);
  return { args, reservationId: result.reservationId };
}

const forPanel = (caller: Caller, p: PanelArgs) =>
  caller.query(api.menuReservations.forPanel, { ...p, fromMs: FROM_MS });
const reservationDetail = (caller: Caller, p: PanelArgs, reservationId: Id<"menuReservations">) =>
  caller.query(api.menuReservations.detail, { ...p, reservationId });

/** All seven staff actions on one reservation, in one array (the same answer from each is the point). */
async function reservationActions(
  caller: Caller,
  p: PanelArgs,
  reservationId: Id<"menuReservations">,
  positionId: Id<"menuPositions">,
) {
  return [
    await caller.mutation(api.menuReservations.accept, { ...p, reservationId }),
    await caller.mutation(api.menuReservations.decline, { ...p, reservationId }),
    await caller.mutation(api.menuReservations.proposeChange, { ...p, reservationId, proposedAt: PROPOSED_AT }),
    await caller.mutation(api.menuReservations.acceptProposal, { ...p, reservationId }),
    await caller.mutation(api.menuReservations.cancelByStaff, { ...p, reservationId }),
    await caller.mutation(api.menuReservations.bindPosition, { ...p, reservationId, positionId }),
    await caller.mutation(api.menuReservations.markArrived, { ...p, reservationId }),
  ];
}

const view = (env: Env, slug: string, token: string) => env.t.query(api.menuReservations.byCancelToken, { slug, token });
const cancelByLink = (env: Env, slug: string, token: string) =>
  env.t.mutation(api.menuReservations.cancelByToken, { slug, token, ipHash: nextIp() });
const mineOf = (env: Env, slug: string, deviceKey: string) => env.t.query(api.menuReservations.mine, { slug, deviceKey });
const cancelByDevice = (env: Env, slug: string, deviceToken: string, reservationId: string) =>
  env.t.mutation(api.menuReservations.cancelByDevice, { slug, deviceToken, reservationId, ipHash: nextIp() });

const RESERVATION_TABLES = [
  "menuServices",
  "menuReservations",
  "menuPositionOccupancy",
  "menuAuditLog",
  "menuAnalyticsEvents",
] as const;
const RESERVATION_STAFF_TABLES = [...RESERVATION_TABLES, "menuStaffSessions"] as const;

// -----------------------------------------------------------------------------
// Analytics
// -----------------------------------------------------------------------------

const PAGE = "pg_5k2m9q0x7c1d";

async function premiumForBoth(env: Env) {
  await env.t.run(async (ctx) => {
    await grantAccountPremium(ctx, { accountId: env.w.a.accountId, via: "plan" });
    await grantAccountPremium(ctx, { accountId: env.w.b.accountId, via: "plan" });
  });
}

/** `count` raw "page opened" events of one venue, received today. */
async function addPageOpens(env: Env, venue: Venue, count: number) {
  const menuServiceId = tenantOf(env, venue).menuServiceId;
  await env.t.run(async (ctx) => {
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("menuAnalyticsEvents", {
        menuServiceId,
        vrsta: "stranica",
        occurredAt: T0 + index * 1000,
        dayKey: DANAS,
        sat: 12,
        stranica: PAGE,
        uredjaj: "telefon",
        jezik: "sr",
      });
    }
  });
}

/** Moves the clock past the two-minute guard and runs the events rollup once. */
async function rollup(env: Env) {
  vi.setSystemTime(Date.now() + 3 * MINUTE);
  return await env.t.mutation(internal.menuAnalyticsRollup.zbir, {});
}

const pregled = (who: Caller, menuServiceId: Id<"menuServices">) =>
  who.query(api.menuAnalytics.pregled, { menuServiceId, danas: DANAS, dana: 7 });
const periodOf = (who: Caller, menuServiceId: Id<"menuServices">) =>
  who.query(api.menuAnalytics.period, { menuServiceId, danas: DANAS, od: dan(6), do: DANAS, poredi: false });
const raspodelaOf = (who: Caller, menuServiceId: Id<"menuServices">) =>
  who.query(api.menuAnalytics.raspodela, {
    menuServiceId,
    danas: DANAS,
    od: dan(6),
    do: DANAS,
    metrika: "otvaranja",
    dimenzija: "stranica",
  });

const ANALYTICS_TABLES = ["menuAnalyticsEvents", "menuAnalyticsDaily", "menuAnalyticsDailyDims", "menuAuditLog"] as const;

// -----------------------------------------------------------------------------
// Menu editor and publication
// -----------------------------------------------------------------------------

const MENU_TABLES = [
  "menuServices",
  "menuDraftState",
  "menuPages",
  "menuSections",
  "menuArticles",
  "menuPlacements",
  "menuAvailability",
  "menuVersions",
  "menuVersionParts",
  "menuAuditLog",
] as const;

async function draftRevision(env: Env, venue: Venue) {
  const menuServiceId = tenantOf(env, venue).menuServiceId;
  const row = await env.t.run(
    async (ctx) =>
      await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
        .unique(),
  );
  return must(row, "the draft state").revision;
}

const WRITES = ["addSection", "quickAddArticle", "setBasePrice", "updateArticleFields", "removePlacement", "setAvailability", "publish"] as const;
const READS = ["pageContent", "findSimilarArticles", "publishPreview", "draftStatus", "listVersions"] as const;

/** Seven menu writes; each is addressed by a row id of the VICTIM's menu. Code by name. */
async function menuWrites(caller: Caller, menu: LiveMenu, revision: number) {
  return {
    addSection: await codeOf(caller.mutation(api.menuCatalog.addSection, { pageId: menu.pageId, name: "Nova sekcija" })),
    quickAddArticle: await codeOf(
      caller.mutation(api.menuCatalog.quickAddArticle, { sectionId: menu.sectionId, name: "Sok" }),
    ),
    setBasePrice: await codeOf(
      caller.mutation(api.menuCatalog.setBasePrice, {
        articleId: menu.articleId,
        expectedPriceRsd: menu.priceRsd,
        priceRsd: 1,
      }),
    ),
    updateArticleFields: await codeOf(
      caller.mutation(api.menuCatalog.updateArticleFields, {
        articleId: menu.articleId,
        expected: { name: "Jelen pivo" },
        patch: { name: "Hakovano" },
      }),
    ),
    removePlacement: await codeOf(caller.mutation(api.menuCatalog.removePlacement, { placementId: menu.placementId })),
    setAvailability: await codeOf(
      caller.mutation(api.menuAvailability.setAvailability, { articleId: menu.articleId, available: false }),
    ),
    publish: await codeOf(
      caller.mutation(api.menuPublishing.publish, { menuServiceId: menu.menuServiceId, expectedRevision: revision }),
    ),
  };
}

/** Five menu reads of the VICTIM's menu. */
async function menuReads(caller: Caller, menu: LiveMenu) {
  return {
    pageContent: await caller.query(api.menuCatalog.pageContent, { pageId: menu.pageId }),
    findSimilarArticles: await caller.query(api.menuCatalog.findSimilarArticles, {
      menuServiceId: menu.menuServiceId,
      name: "Jelen",
    }),
    publishPreview: await caller.query(api.menuPublishing.publishPreview, { menuServiceId: menu.menuServiceId }),
    draftStatus: await caller.query(api.menuPublishing.draftStatus, { menuServiceId: menu.menuServiceId }),
    listVersions: await caller.query(api.menuPublishing.listVersions, { menuServiceId: menu.menuServiceId }),
  };
}

const sameCode = (code: string) => Object.fromEntries(WRITES.map((name) => [name, code]));
const allNull = () => Object.fromEntries(READS.map((name) => [name, null]));

// -----------------------------------------------------------------------------
// Team and staff
// -----------------------------------------------------------------------------

const TEAM_TABLES = [
  "menuMembers",
  "menuStaff",
  "menuStaffSessions",
  "menuPinAttempts",
  "menuSecrets",
  "menuAuditLog",
  "accountMemberships",
  "businessMemberships",
  "businessInvitations",
  "users",
] as const;

type TeamIds = {
  menuServiceId: Id<"menuServices">;
  memberId: Id<"menuMembers">;
  pendingId: Id<"menuMembers">;
  staffId: Id<"menuStaff">;
};

/** A venue's team: one active Urednik-type member, one pending invitation and one PIN waiter. */
async function teamFixture(env: Env, venue: Venue): Promise<TeamIds> {
  const tenant = tenantOf(env, venue);
  const pending = await ownerOf(env, venue).mutation(api.menuTeam.invite, {
    menuServiceId: tenant.menuServiceId,
    email: `poziv-${venue}@example.com`,
    role: "editor",
  });
  const memberId = await env.t.run(async (ctx) => {
    const email = `clan-${venue}@example.com`;
    const userId = await ctx.db.insert("users", { email, emailVerificationTime: Date.now() });
    return await addMenuMember(ctx, {
      menuServiceId: tenant.menuServiceId,
      businessId: tenant.businessId,
      userId,
      email,
      role: "editor",
      invitedByUserId: ownerIdOf(env, venue),
    });
  });
  const staffId = await addStaff(env, venue, venue === "a" ? "Ana" : "Jelena", venue === "a" ? "246" : "555");
  return { menuServiceId: tenant.menuServiceId, memberId, pendingId: pending.memberId, staffId };
}

type TeamAttack = {
  name: string;
  /** "service": addressed by the venue itself; "row": addressed by a row id taken from the argument. */
  target: "service" | "row";
  run: (caller: Caller, ids: TeamIds) => Promise<unknown>;
};

const TEAM_ATTACKS: TeamAttack[] = [
  {
    name: "menuTeam.invite",
    target: "service",
    run: (c, i) => c.mutation(api.menuTeam.invite, { menuServiceId: i.menuServiceId, email: "novi@example.com", role: "editor" }),
  },
  {
    name: "menuTeam.changeRole",
    target: "row",
    run: (c, i) => c.mutation(api.menuTeam.changeRole, { memberId: i.memberId, role: "manager" }),
  },
  { name: "menuTeam.remove", target: "row", run: (c, i) => c.mutation(api.menuTeam.remove, { memberId: i.memberId }) },
  {
    name: "menuTeam.revokeInvite",
    target: "row",
    run: (c, i) => c.mutation(api.menuTeam.revokeInvite, { memberId: i.pendingId }),
  },
  {
    name: "menuStaff.create",
    target: "service",
    run: (c, i) => c.mutation(api.menuStaff.create, { menuServiceId: i.menuServiceId, displayName: "Nova" }),
  },
  { name: "menuStaff.setPin", target: "row", run: (c, i) => c.mutation(api.menuStaff.setPin, { staffId: i.staffId }) },
  { name: "menuStaff.resetPin", target: "row", run: (c, i) => c.mutation(api.menuStaff.resetPin, { staffId: i.staffId }) },
  { name: "menuStaff.deactivate", target: "row", run: (c, i) => c.mutation(api.menuStaff.deactivate, { staffId: i.staffId }) },
  {
    name: "menuStaff.unlockPins",
    target: "service",
    run: (c, i) => c.mutation(api.menuStaff.unlockPins, { menuServiceId: i.menuServiceId }),
  },
  {
    name: "menuStaff.rotatePanelCode",
    target: "service",
    run: (c, i) => c.mutation(api.menuStaff.rotatePanelCode, { menuServiceId: i.menuServiceId }),
  },
];

async function teamReads(caller: Caller, ids: TeamIds) {
  return [
    await caller.query(api.menuTeam.list, { menuServiceId: ids.menuServiceId }),
    await caller.query(api.menuTeam.activity, { menuServiceId: ids.menuServiceId }),
    await caller.query(api.menuStaff.list, { menuServiceId: ids.menuServiceId }),
    await caller.query(api.menuStaff.panelLink, { menuServiceId: ids.menuServiceId }),
  ];
}

/** A caller with no Menu role at all (or none that allows the action): the code each attack gets. */
async function teamOutcomes(caller: Caller, ids: TeamIds, refusal: (attack: TeamAttack) => string) {
  const got: Record<string, string> = {};
  const expected: Record<string, string> = {};
  for (const attack of TEAM_ATTACKS) {
    got[attack.name] = await codeOf(attack.run(caller, ids));
    expected[attack.name] = refusal(attack);
  }
  return { got, expected };
}

// =============================================================================
// CONTROL: the attack helpers are real calls, and the snapshots see a write
// =============================================================================

describe("CONTROL (the helpers behind the attacks work for the rightful caller)", () => {
  /** The answers the attacks get ("you are nobody here", "no such row"): none may come back to a rightful caller. */
  const REFUSALS: string[] = [
    STAFF_ERROR.signedOut,
    MENU_ERROR.notFound,
    REQUEST_ERROR.notFound,
    RESERVATION_ERROR.notFound,
  ];
  const refusedAnswers = (answers: unknown[]) =>
    answers.filter((answer) => {
      const code = (answer as { code?: string } | null)?.code;
      return answer === null || (code !== undefined && REFUSALS.includes(code));
    });

  test("CONTROL: the menu helpers pass for the rightful owner and the menu snapshot sees the write", { timeout: TIMEOUT }, async () => {
    const env = await world();
    const menu = await goLive(env, "a");
    const reads = await menuReads(env.ownerA, menu);
    for (const [name, value] of Object.entries(reads)) expect(value, name).not.toBeNull();
    const before = await dump(env.t, MENU_TABLES);
    const writes = await menuWrites(env.ownerA, menu, await draftRevision(env, "a"));
    for (const [name, code] of Object.entries(writes)) expect([MENU_ERROR.notFound, MENU_ERROR.unauthenticated, MENU_ERROR.forbidden], name).not.toContain(code);
    expect(await dump(env.t, MENU_TABLES)).not.toEqual(before);
  });

  test("CONTROL: the waiter and reservation helpers pass for the rightful owner and their snapshots see the writes", { timeout: TIMEOUT }, async () => {
    const env = await world();
    await openForm(env, "a");
    const ana = await addStaff(env, "a", "Ana", "246");
    const { tableA, requestA } = await bothVenues(env);
    const target: WaiterTarget = { requestId: requestA, positionId: tableA.positionId, staffId: ana };
    const p = panel(env, "a");
    expect(refusedAnswers(await waiterReads(env.ownerA, p, target))).toEqual([]);
    const waiterBefore = await dump(env.t, WAITER_TABLES);
    expect(refusedAnswers(await waiterWrites(env.ownerA, p, target))).toEqual([]);
    expect(await dump(env.t, WAITER_TABLES)).not.toEqual(waiterBefore);

    const { reservationId } = await guestRequest(env, "a");
    expect(must(await forPanel(env.ownerA, p), "panel").rows.map((row) => row.id)).toEqual([reservationId]);
    expect(await reservationDetail(env.ownerA, p, reservationId)).not.toBeNull();
    const reservationsBefore = await dump(env.t, RESERVATION_TABLES);
    expect(refusedAnswers(await reservationActions(env.ownerA, p, reservationId, await addPosition(env, "a", "Sto 7")))).toEqual([]);
    expect(await dump(env.t, RESERVATION_TABLES)).not.toEqual(reservationsBefore);
  });

  test("CONTROL: the team helpers pass for the rightful owner (every attack is ok) and the team snapshot sees the writes", { timeout: TIMEOUT }, async () => {
    const env = await world();
    const ids = await teamFixture(env, "a");
    for (const value of await teamReads(env.ownerA, ids)) expect(value).not.toBeNull();
    const before = await dump(env.t, TEAM_TABLES);
    const { got, expected } = await teamOutcomes(env.ownerA, ids, () => "ok");
    expect(got).toEqual(expected);
    expect(await dump(env.t, TEAM_TABLES)).not.toEqual(before);
  });

  test("CONTROL: the guest helpers pass for the guest at home and the guest snapshot sees the write", { timeout: TIMEOUT }, async () => {
    const env = await world();
    await goLive(env, "a");
    const guest = await seat(env, "a", "Sto 1");
    const before = await dump(env.t, GUEST_TABLES);
    const requestId = idOf(await callWaiter(env, SLUG_A, guest.guestToken));
    expect(await dump(env.t, GUEST_TABLES)).not.toEqual(before);
    expect(await sessionView(env, SLUG_A, guest.guestToken)).not.toBeNull();
    expect(await requestBill(env, SLUG_A, guest.guestToken)).toMatchObject({ ok: true });
    // The order helper reaches the cart (its made-up article is stale), not the session check.
    expect(await submitOrder(env, SLUG_A, guest.guestToken)).toMatchObject({ ok: false, code: REQUEST_ERROR.cartStale });
    const key = await deviceKeyHashFor(env.w.a.menuServiceId, guest.deviceToken);
    expect(idsOf(await myRequests(env, SLUG_A, key))).toContain(requestId);
    expect(await cancelRequest(env, SLUG_A, guest.deviceToken, requestId)).toEqual({ ok: true, status: "cancelled" });
  });
});

// =============================================================================
// MENI (editor, catalog, publication)
// =============================================================================

describe("MENI (editor, catalog, publication)", () => {
  // (b) is not applicable: no editor, catalog or publication function takes a staff session or a panel code (the PIN
  // waiter has no account), so there is no door to try with the other venue's PIN or token. What a signed-in PIN waiter
  // can do to the menu - nothing - is the second test of (d) below.
  test(
    "MENI (a): a card of venue b opens venue b only, and a link cannot point into another venue's page",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await goLive(env, "a");
      await goLive(env, "b");
      const [pageA, pageB] = await env.t.run(async (ctx) => [
        must(await ctx.db.get(env.w.a.defaultPageId), "page a"),
        must(await ctx.db.get(env.w.b.defaultPageId), "page b"),
      ]);
      const scan = (cardCode: string) =>
        env.t.mutation(api.cards.resolveAndRecord, {
          cardCode,
          requestId: `k33-${cardCode}`,
          deviceCategory: "mobile" as const,
          ipHash: nextIp(),
        });

      // Control: a card of b linked to b's own page opens b's page.
      const honest = nextCardCode();
      await qrCard(env, { cardCode: honest, card: "b", link: "b", pageKey: pageB.key });
      expect(await scan(honest)).toStrictEqual({ kind: "menu", businessSlug: SLUG_B, pagePath: pageB.slug });

      // The link of b's card names a PAGE KEY of venue a: the page is looked up in b's own service, so it is not found.
      const crossedPage = nextCardCode();
      await qrCard(env, { cardCode: crossedPage, card: "b", link: "b", pageKey: pageA.key });
      expect(await scan(crossedPage)).toStrictEqual({ kind: "menu", businessSlug: SLUG_B });

      // A card of b whose link row sits in a's service is no link at all: it opens b's entry, never a page of a.
      const crossedService = nextCardCode();
      await qrCard(env, { cardCode: crossedService, card: "b", link: "a", pageKey: pageA.key });
      expect(await scan(crossedService)).toStrictEqual({ kind: "menu", businessSlug: SLUG_B });

      // The published pages are per venue: no article, name or price of b on a's page, and the reverse.
      const guestA = JSON.stringify(await env.t.query(api.menuPublic.page, { slug: SLUG_A }));
      const guestB = JSON.stringify(await env.t.query(api.menuPublic.page, { slug: SLUG_B }));
      expect(guestA).toContain(CONTENT.a.article);
      expect(guestA).not.toContain(CONTENT.b.article);
      expect(guestB).toContain(CONTENT.b.article);
      expect(guestB).not.toContain(CONTENT.a.article);
    },
  );

  test(
    "MENI (c): the owner of the other venue reads and changes nothing in the editor, availability and publication",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const menus = { a: await goLive(env, "a"), b: await goLive(env, "b") };
      const revisions = { a: await draftRevision(env, "a"), b: await draftRevision(env, "b") };
      // Control: each owner works in his own venue (a read only: a write would move the snapshot).
      for (const venue of ["a", "b"] as const) {
        const own = await menuReads(ownerOf(env, venue), menus[venue]);
        expect(own.pageContent).not.toBeNull();
        expect(own.publishPreview).not.toBeNull();
        expect(own.listVersions).not.toBeNull();
      }
      const before = await dump(env.t, MENU_TABLES);
      const guestBefore = [
        await env.t.query(api.menuPublic.page, { slug: SLUG_A }),
        await env.t.query(api.menuPublic.page, { slug: SLUG_B }),
      ];

      for (const [attacker, victim] of [
        ["b", "a"],
        ["a", "b"],
      ] as const) {
        const who = ownerOf(env, attacker);
        expect(await menuReads(who, menus[victim]), `${attacker} reads ${victim}`).toEqual(allNull());
        expect(await menuWrites(who, menus[victim], revisions[victim]), `${attacker} writes ${victim}`).toEqual(
          sameCode(MENU_ERROR.notFound),
        );
      }

      expect(await dump(env.t, MENU_TABLES)).toEqual(before);
      expect([
        await env.t.query(api.menuPublic.page, { slug: SLUG_A }),
        await env.t.query(api.menuPublic.page, { slug: SLUG_B }),
      ]).toEqual(guestBefore);
    },
  );

  test(
    "MENI (c): rows of one venue never join the other, not even for the same owner or ScanMe admin",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const a = await goLive(env, "a");
      const b = await goLive(env, "b");
      const before = await dump(env.t, MENU_TABLES);
      const admin = as(env.t, env.w.adminId);

      // An article of b shown in a section of a (and the reverse, with the admin who may act on both services).
      expect(
        await codeOf(env.ownerA.mutation(api.menuCatalog.addPlacement, { sectionId: a.sectionId, articleId: b.articleId })),
      ).toBe(MENU_ERROR.notFound);
      expect(
        await codeOf(admin.mutation(api.menuCatalog.addPlacement, { sectionId: b.sectionId, articleId: a.articleId })),
      ).toBe(MENU_ERROR.notFound);
      // A placement of a moved into b's section, or ordered before a placement of b.
      expect(
        await codeOf(
          admin.mutation(api.menuCatalog.movePlacement, { placementId: a.placementId, toSectionId: b.sectionId }),
        ),
      ).toBe(MENU_ERROR.notFound);
      expect(
        await codeOf(
          admin.mutation(api.menuCatalog.movePlacement, {
            placementId: a.placementId,
            toSectionId: a.sectionId,
            beforePlacementId: b.placementId,
          }),
        ),
      ).toBe(MENU_ERROR.notFound);
      // The owner of a pointing the live availability switch at an article of b.
      expect(
        await codeOf(env.ownerA.mutation(api.menuAvailability.setAvailability, { articleId: b.articleId, available: false })),
      ).toBe(MENU_ERROR.notFound);

      expect(await dump(env.t, MENU_TABLES)).toEqual(before);
    },
  );

  test("MENI (d): finance, view-only, outsiders and anonymous callers have no Menu access", { timeout: TIMEOUT }, async () => {
    const env = await world();
    const menu = await goLive(env, "a");
    const revision = await draftRevision(env, "a");
    const before = await dump(env.t, MENU_TABLES);

    // The Menu context of venue a: only members and ScanMe see it.
    const context = (who: Caller) => who.query(api.menuServices.context, { businessSlug: SLUG_A });
    expect(await context(env.ownerA)).toMatchObject({ actor: "owner" });
    expect(await context(as(env.t, env.w.managerId))).toMatchObject({ actor: "manager" });
    expect(await context(as(env.t, env.w.editorId))).toMatchObject({ actor: "editor" });

    for (const userId of [env.w.financeId, env.w.viewOnlyId, env.w.outsiderId]) {
      const who = as(env.t, userId);
      expect(await context(who)).toBeNull();
      expect(await menuReads(who, menu)).toEqual(allNull());
      expect(await menuWrites(who, menu, revision)).toEqual(sameCode(MENU_ERROR.notFound));
    }
    expect(await context(env.t)).toBeNull();
    expect(await menuReads(env.t, menu)).toEqual(allNull());
    expect(await menuWrites(env.t, menu, revision)).toEqual(sameCode(MENU_ERROR.unauthenticated));

    expect(await dump(env.t, MENU_TABLES)).toEqual(before);
  });

  test(
    "MENI (d): an Urednik edits and publishes but cannot change features or hours, and the PIN waiter has no menu rights",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const menuA = await goLive(env, "a");
      const menuB = await goLive(env, "b");
      const editor = as(env.t, env.w.editorId);

      // Control: the Urednik works on the offer of his own venue and publishes it.
      const section = await editor.mutation(api.menuCatalog.addSection, { pageId: menuA.pageId, name: "Urednikova sekcija" });
      const created = await editor.mutation(api.menuCatalog.quickAddArticle, {
        sectionId: section.sectionId,
        name: "Sok",
        priceRsd: 120,
      });
      if (created.status !== "created") throw new Error(`expected created, got ${created.status}`);
      expect(
        await editor.mutation(api.menuCatalog.setBasePrice, { articleId: created.articleId, expectedPriceRsd: 120, priceRsd: 130 }),
      ).toEqual({ ok: true });
      expect(await editor.mutation(api.menuAvailability.setAvailability, { articleId: created.articleId, available: false })).toMatchObject(
        { available: false },
      );
      expect(await publishAll(editor, menuA.menuServiceId)).toMatchObject({ ok: true });
      // The PIN waiter signs in (the sign-in is not a menu write).
      await signedInStaff(env, "a", "Ana", "246");

      const before = await dump(env.t, MENU_TABLES);

      // He has no features.edit and no settings.edit: forbidden, not "not found" (he IS a member).
      expect(
        await codeOf(editor.mutation(api.menuServices.setFeature, { menuServiceId: menuA.menuServiceId, feature: "occupancy", enabled: true })),
      ).toBe(MENU_ERROR.forbidden);
      expect(
        await codeOf(editor.mutation(api.menuSettings.setWorkingHours, { menuServiceId: menuA.menuServiceId, workingHours: WEEK })),
      ).toBe(MENU_ERROR.forbidden);
      // And the other venue is not his at all.
      expect(await menuReads(editor, menuB)).toEqual(allNull());
      expect(await menuWrites(editor, menuB, await draftRevision(env, "b"))).toEqual(sameCode(MENU_ERROR.notFound));

      // The signed-in PIN waiter's device is an anonymous caller for every account function.
      expect(permissionsOf("staff")).toEqual(["waiter.work"]);
      const revisionA = await draftRevision(env, "a");
      expect(await menuReads(env.t, menuA)).toEqual(allNull());
      expect(await menuWrites(env.t, menuA, revisionA)).toEqual(sameCode(MENU_ERROR.unauthenticated));

      expect(await dump(env.t, MENU_TABLES)).toEqual(before);
    },
  );
});

// =============================================================================
// ZAHTEVI GOSTA (the guest actions and the waiter queue)
// =============================================================================

describe("ZAHTEVI GOSTA", () => {
  test(
    "ZAHTEVI (a): a guest token and a device of venue b are nobody at venue a",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await goLive(env, "a");
      await goLive(env, "b");
      const guests = { a: await seat(env, "a", "Sto 1"), b: await seat(env, "b", "Sto 1") };

      // Control: each phone works at its own venue and sees its own request.
      const requests = {
        a: idOf(await callWaiter(env, SLUG_A, guests.a.guestToken)),
        b: idOf(await callWaiter(env, SLUG_B, guests.b.guestToken)),
      };
      const keys = {
        a: await deviceKeyHashFor(env.w.a.menuServiceId, guests.a.deviceToken),
        b: await deviceKeyHashFor(env.w.b.menuServiceId, guests.b.deviceToken),
      };
      expect(idsOf(await myRequests(env, SLUG_A, keys.a))).toEqual([requests.a]);
      expect(idsOf(await myRequests(env, SLUG_B, keys.b))).toEqual([requests.b]);
      expect(await sessionView(env, SLUG_A, guests.a.guestToken)).toMatchObject({ position: { label: "Sto 1" } });

      const before = await dump(env.t, GUEST_TABLES);
      const noSession = { ok: false, code: REQUEST_ERROR.noSession };
      for (const [slug, foreign] of [
        [SLUG_A, guests.b],
        [SLUG_B, guests.a],
      ] as const) {
        expect(await callWaiter(env, slug, foreign.guestToken), `call at ${slug}`).toEqual(noSession);
        expect(await requestBill(env, slug, foreign.guestToken), `bill at ${slug}`).toEqual(noSession);
        expect(await submitOrder(env, slug, foreign.guestToken), `order at ${slug}`).toEqual(noSession);
        expect(await sessionView(env, slug, foreign.guestToken), `view at ${slug}`).toBeNull();
      }

      // Cancelling: the foreign request with a foreign device, with this venue's device, at either slug.
      expect(await cancelRequest(env, SLUG_A, guests.b.deviceToken, requests.b)).toEqual(NOT_FOUND_REQUEST);
      expect(await cancelRequest(env, SLUG_A, guests.a.deviceToken, requests.b)).toEqual(NOT_FOUND_REQUEST);
      expect(await cancelRequest(env, SLUG_B, guests.a.deviceToken, requests.a)).toEqual(NOT_FOUND_REQUEST);
      expect(await cancelRequest(env, SLUG_B, guests.b.deviceToken, requests.a)).toEqual(NOT_FOUND_REQUEST);

      // "Moji zahtevi": the device key of one venue lists nothing at the other.
      expect(await myRequests(env, SLUG_A, keys.b)).toEqual([]);
      expect(await myRequests(env, SLUG_B, keys.a)).toEqual([]);

      expect(await dump(env.t, GUEST_TABLES)).toEqual(before);
    },
  );

  test("ZAHTEVI (a): the same phone at both venues has two unrelated request lists", { timeout: TIMEOUT }, async () => {
    const env = await world();
    await goLive(env, "a");
    await goLive(env, "b");
    const atA = await seat(env, "a", "Sto 1");
    // The same phone (the same device cookie) scans a card at venue b.
    const atB = await seat(env, "b", "Sto 2", atA.deviceToken);
    expect(atB.deviceToken).toBe(atA.deviceToken);

    const requestA = idOf(await callWaiter(env, SLUG_A, atA.guestToken));
    const requestB = idOf(await callWaiter(env, SLUG_B, atB.guestToken));
    const keyA = await deviceKeyHashFor(env.w.a.menuServiceId, atA.deviceToken);
    const keyB = await deviceKeyHashFor(env.w.b.menuServiceId, atB.deviceToken);
    expect(keyA).not.toBe(keyB); // the pseudonym is scoped to the venue

    expect(idsOf(await myRequests(env, SLUG_A, keyA))).toEqual([requestA]);
    expect(idsOf(await myRequests(env, SLUG_B, keyB))).toEqual([requestB]);
    expect(await myRequests(env, SLUG_A, keyB)).toEqual([]);
    expect(await myRequests(env, SLUG_B, keyA)).toEqual([]);

    // One cookie, two venues: the request of one venue is not cancellable through the other.
    const before = await dump(env.t, GUEST_TABLES);
    expect(await cancelRequest(env, SLUG_B, atA.deviceToken, requestA)).toEqual(NOT_FOUND_REQUEST);
    expect(await cancelRequest(env, SLUG_A, atA.deviceToken, requestB)).toEqual(NOT_FOUND_REQUEST);
    expect(await dump(env.t, GUEST_TABLES)).toEqual(before);
    // Each venue's own cancel still works.
    expect(await cancelRequest(env, SLUG_A, atA.deviceToken, requestA)).toEqual({ ok: true, status: "cancelled" });
  });

  test(
    "ZAHTEVI (a): an order that names the page or article of venue b is refused at venue a",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await goLive(env, "a");
      await goLive(env, "b");
      const guest = await seat(env, "a", "Sto 1");
      const published = async (slug: string) => {
        const result = await env.t.query(api.menuPublic.page, { slug });
        if (result === null || result.kind !== "page") throw new Error(`expected the published page of ${slug}`);
        return { pageKey: result.page.key, articleKey: must(result.sections[0]?.articles[0], "an article").key };
      };
      const a = await published(SLUG_A);
      const b = await published(SLUG_B);
      const order = (pageKey: string, articleKey: string, seenTotalRsd: number) =>
        env.t.mutation(api.menuGuest.submitOrder, {
          slug: SLUG_A,
          guestToken: guest.guestToken,
          ipHash: nextIp(),
          channel: "standard",
          lines: [{ pageKey, articleKey, variantKey: null, addonKeys: [], quantity: 1, note: null }],
          seenTotalRsd,
        });
      const before = await dump(env.t, GUEST_TABLES);

      // b's page and article (890 din) at a; b's article on a's page; a's article under b's page.
      expect(await order(b.pageKey, b.articleKey, CONTENT.b.priceRsd)).toMatchObject({ ok: false, code: REQUEST_ERROR.cartStale, staleLines: [0] });
      expect(await order(a.pageKey, b.articleKey, CONTENT.b.priceRsd)).toMatchObject({ ok: false, code: REQUEST_ERROR.cartStale, staleLines: [0] });
      expect(await order(b.pageKey, a.articleKey, CONTENT.a.priceRsd)).toMatchObject({ ok: false, code: REQUEST_ERROR.cartStale, staleLines: [0] });
      expect(await dump(env.t, GUEST_TABLES)).toEqual(before);

      // Control: a's own page and article are priced by a's published menu.
      const sent = await order(a.pageKey, a.articleKey, CONTENT.a.priceRsd);
      expect(sent).toMatchObject({ ok: true, totals: { totalRsd: CONTENT.a.priceRsd } });
      const items = await env.t.run(async (ctx) => await ctx.db.query("menuRequestItems").take(10));
      expect(items.map((row) => [row.menuServiceId, row.name])).toEqual([[env.w.a.menuServiceId, CONTENT.a.article]]);
    },
  );

  test(
    "ZAHTEVI (a): a card whose link crosses into another venue opens no table session",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const positionA = await addPosition(env, "a", "Sto A");
      const positionB = await addPosition(env, "b", "Sto B");
      const scan = (cardCode: string) =>
        env.t.mutation(api.cards.resolveAndRecord, {
          cardCode,
          requestId: `k33-${cardCode}`,
          deviceCategory: "mobile" as const,
          ipHash: nextIp(),
        });
      const sessionRows = () => env.t.run(async (ctx) => await ctx.db.query("menuGuestSessions").take(100));

      // 1. A card of a, linked in a's service, but the table belongs to b.
      const positionOfB = nextCardCode();
      await qrCard(env, { cardCode: positionOfB, card: "a", link: "a", positionId: positionB });
      // 2. A card of b whose link row sits in a's service (a's table).
      const linkInA = nextCardCode();
      await qrCard(env, { cardCode: linkInA, card: "b", link: "a", positionId: positionA });
      // 3. A card of a whose link row sits in b's service (b's table).
      const linkInB = nextCardCode();
      await qrCard(env, { cardCode: linkInB, card: "a", link: "b", positionId: positionB });

      // The resolver sends none of them through the hop, and the hop itself opens no session.
      expect(await scan(positionOfB)).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });
      expect(await scan(linkInA)).toStrictEqual({ kind: "menu", businessSlug: SLUG_B });
      expect(await scan(linkInB)).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });
      expect(await hop(env, positionOfB)).toEqual({ kind: "menu", slug: SLUG_A, pagePath: null, session: null });
      expect(await hop(env, linkInA)).toEqual({ kind: "menu", slug: SLUG_B, pagePath: null, session: null });
      expect(await hop(env, linkInB)).toEqual({ kind: "menu", slug: SLUG_A, pagePath: null, session: null });
      expect(await sessionRows()).toEqual([]);

      // Control: an honest card of b on b's table opens a session at b, and only there.
      const honest = nextCardCode();
      await qrCard(env, { cardCode: honest, card: "b", link: "b", positionId: positionB });
      const outcome = await hop(env, honest);
      expect(outcome).toMatchObject({ kind: "menu", slug: SLUG_B });
      const rows = await sessionRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ menuServiceId: env.w.b.menuServiceId, positionId: positionB });
    },
  );

  test(
    "ZAHTEVI (b): a PIN of venue b opens nothing at venue a, and a foreign panel link is a 404",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const anaId = await addStaff(env, "a", "Ana", "246");
      const jelenaId = await addStaff(env, "b", "Jelena", "555");
      const staffBefore = await dump(env.t, ["menuStaff"]);
      const wrongPin = { ok: false, code: STAFF_ERROR.wrongPin };
      const panelNotFound = { ok: false, code: STAFF_ERROR.panelNotFound };

      // b's PIN at a's door, a's PIN at b's door: the same answer as any wrong PIN.
      expect(await loginAt(env, homeOf(env, "a"), "555")).toMatchObject(wrongPin);
      expect(await loginAt(env, homeOf(env, "b"), "246")).toMatchObject(wrongPin);
      // The panel link of the other venue (its code, with this slug, and the reverse) does not exist.
      expect(await loginAt(env, { slug: SLUG_A, panelCode: env.codeB }, "555")).toEqual(panelNotFound);
      expect(await loginAt(env, { slug: SLUG_A, panelCode: env.codeB }, "246")).toEqual(panelNotFound);
      expect(await loginAt(env, { slug: SLUG_B, panelCode: env.codeA }, "246")).toEqual(panelNotFound);
      expect(await loginAt(env, { slug: SLUG_B, panelCode: env.codeA }, "555")).toEqual(panelNotFound);

      // No session was opened for anybody, and no member changed.
      expect(await dump(env.t, ["menuStaffSessions"])).toEqual({ menuStaffSessions: [] });
      expect(await dump(env.t, ["menuStaff"])).toEqual(staffBefore);
      // A miss counts against the venue where it was made and never against the other one.
      const attempts = await env.t.run(async (ctx) => await ctx.db.query("menuPinAttempts").take(100));
      const venueOfMiss = new Set(attempts.map((row) => row.menuServiceId));
      expect(venueOfMiss).toEqual(new Set([env.w.a.menuServiceId, env.w.b.menuServiceId]));

      // Control: the right PIN at the right door opens exactly that member.
      const ana = await loginAt(env, homeOf(env, "a"), "246");
      const jelena = await loginAt(env, homeOf(env, "b"), "555");
      expect(ana).toMatchObject({ ok: true, displayName: "Ana" });
      expect(jelena).toMatchObject({ ok: true, displayName: "Jelena" });
      const sessions = await env.t.run(async (ctx) => await ctx.db.query("menuStaffSessions").take(100));
      expect(sessions.map((row) => [row.staffId, row.menuServiceId]).sort()).toEqual(
        [
          [anaId, env.w.a.menuServiceId],
          [jelenaId, env.w.b.menuServiceId],
        ].sort(),
      );
    },
  );

  test(
    "ZAHTEVI (b): a staff session of venue b is nobody at venue a (queue, detail, floor, every action)",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      for (const venue of ["a", "b"] as const) {
        await ownerOf(env, venue).mutation(api.menuServices.setFeature, {
          menuServiceId: tenantOf(env, venue).menuServiceId,
          feature: "occupancy",
          enabled: true,
        });
      }
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const jelena = await signedInStaff(env, "b", "Jelena", "555");
      const { tableA, tableB, requestA, requestB } = await bothVenues(env);
      const targetA: WaiterTarget = { requestId: requestA, positionId: tableA.positionId, staffId: ana.staffId };
      const targetB: WaiterTarget = { requestId: requestB, positionId: tableB.positionId, staffId: jelena.staffId };

      // Control: at home each token reads its own queue.
      expect(await env.t.query(api.menuWaiter.activeRequests, panel(env, "a", ana.token))).toMatchObject({
        requests: [{ id: requestA }],
      });
      expect(await env.t.query(api.menuWaiter.activeRequests, panel(env, "b", jelena.token))).toMatchObject({
        requests: [{ id: requestB }],
      });

      const before = await dump(env.t, WAITER_TABLES);
      const wrong: { name: string; p: TokenPanel; target: WaiterTarget }[] = [
        { name: "b's token at a's panel", p: { ...homeOf(env, "a"), sessionToken: jelena.token }, target: targetA },
        { name: "a's token at b's panel", p: { ...homeOf(env, "b"), sessionToken: ana.token }, target: targetB },
        {
          name: "b's token with a's slug and b's code",
          p: { slug: SLUG_A, panelCode: env.codeB, sessionToken: jelena.token },
          target: targetA,
        },
        {
          name: "a's token with b's slug and a's code",
          p: { slug: SLUG_B, panelCode: env.codeA, sessionToken: ana.token },
          target: targetB,
        },
        { name: "b's device token as a session", p: { ...homeOf(env, "a"), sessionToken: jelena.deviceToken }, target: targetA },
      ];
      for (const { name, p, target } of wrong) {
        expect(await waiterReads(env.t, p, target), name).toEqual(Array(6).fill(null));
        expect(await waiterWrites(env.t, p, target), name).toEqual(Array(6).fill(SIGNED_OUT));
        // Signing "out" with a foreign token ends nobody's real session.
        expect(await env.t.mutation(api.menuWaiter.logout, p), name).toEqual({ ok: true });
      }

      expect(await dump(env.t, WAITER_TABLES)).toEqual(before);
      expect(await env.t.query(api.menuWaiter.me, panel(env, "a", ana.token))).toMatchObject({ displayName: "Ana" });
      expect(await env.t.query(api.menuWaiter.me, panel(env, "b", jelena.token))).toMatchObject({ displayName: "Jelena" });
    },
  );

  test(
    "ZAHTEVI (b): a waiter of one venue cannot reach the request, table, staff or zone of the other",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await env.ownerA.mutation(api.menuServices.setFeature, {
        menuServiceId: env.w.a.menuServiceId,
        feature: "occupancy",
        enabled: true,
      });
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const marko = await signedInStaff(env, "a", "Marko", "135", "manager");
      const jelenaId = await addStaff(env, "b", "Jelena", "555");
      const { tableA, tableB, requestA, requestB } = await bothVenues(env);
      const zoneB = await addZone(env, "b", "Basta");
      // A reminder that Operativa of venue b sent to Jelena.
      const noticeB = await env.t.run(
        async (ctx) =>
          await ctx.db.insert("menuStaffNotices", {
            menuServiceId: env.w.b.menuServiceId,
            staffId: jelenaId,
            kind: "ping",
            requestId: requestB,
            createdByUserId: env.w.otherOwnerId,
            createdAt: Date.now(),
          }),
      );
      const before = await dump(env.t, WAITER_TABLES);
      const atA = (token: string) => panel(env, "a", token);

      // Ana, at her own panel, with the ids of venue b.
      expect(await actOn(env.t, atA(ana.token), requestB)).toEqual(Array(3).fill(NOT_FOUND_REQUEST));
      expect(await env.t.query(api.menuWaiter.requestDetail, { ...atA(ana.token), requestId: requestB })).toBeNull();
      expect(await env.t.query(api.menuWaiter.positionDetail, { ...atA(ana.token), positionId: tableB.positionId })).toBeNull();
      expect(
        await env.t.mutation(api.menuWaiter.setOccupancy, { ...atA(ana.token), positionId: tableB.positionId, state: "occupied" }),
      ).toEqual({ ok: false, code: MENU_ERROR.notFound });
      // Closing a reminder that was sent to a waiter of venue b.
      for (const token of [ana.token, marko.token]) {
        expect(await env.t.mutation(api.menuWaiter.seeNotice, { ...atA(token), noticeId: noticeB })).toEqual({
          ok: false,
          code: MENU_ERROR.notFound,
        });
      }
      // Marko is a panel manager (he may assign zones) - inside venue a only.
      expect(
        await env.t.mutation(api.menuWaiter.setStaffZone, { ...atA(marko.token), staffId: jelenaId, zoneId: null }),
      ).toEqual({ ok: false, code: MENU_ERROR.notFound });
      expect(
        await env.t.mutation(api.menuWaiter.setStaffZone, { ...atA(marko.token), staffId: ana.staffId, zoneId: zoneB }),
      ).toEqual({ ok: false, code: MENU_ERROR.notFound });
      expect(await env.t.mutation(api.menuWaiter.setMyZone, { ...atA(ana.token), zoneId: zoneB })).toEqual({
        ok: false,
        code: MENU_ERROR.notFound,
      });
      // The queue and the floor of a never list anything of b.
      const queue = must(await env.t.query(api.menuWaiter.activeRequests, atA(ana.token)), "the queue of a");
      expect(queue.requests.map((row) => row.id)).toEqual([requestA]);
      const floor = must(await env.t.query(api.menuWaiter.floor, atA(ana.token)), "the floor of a");
      expect(floor.positions.map((row) => row.id)).toEqual([tableA.positionId]);
      expect(floor.zones).toEqual([]);
      expect(floor.staff.map((row) => row.name).sort()).toEqual(["Ana", "Marko"]);

      expect(await dump(env.t, WAITER_TABLES)).toEqual(before);
      // Control: the same calls with a's own ids work.
      expect(await env.t.mutation(api.menuWaiter.accept, { ...atA(ana.token), requestId: requestA })).toMatchObject({ ok: true });
      expect(
        await env.t.mutation(api.menuWaiter.setOccupancy, { ...atA(ana.token), positionId: tableA.positionId, state: "occupied" }),
      ).toEqual({ ok: true, changed: true });
    },
  );

  test(
    "ZAHTEVI (c): the owner of the other venue reads and changes nothing in the queue and Operativa",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const staffA = await addStaff(env, "a", "Ana", "246");
      const staffB = await addStaff(env, "b", "Jelena", "555");
      const { tableA, tableB, requestA, requestB } = await bothVenues(env);
      const targets: Record<Venue, WaiterTarget> = {
        a: { requestId: requestA, positionId: tableA.positionId, staffId: staffA },
        b: { requestId: requestB, positionId: tableB.positionId, staffId: staffB },
      };
      // Control: each owner opens the queue and Operativa of his own venue.
      for (const venue of ["a", "b"] as const) {
        const owner = ownerOf(env, venue);
        expect(await owner.query(api.menuWaiter.activeRequests, panel(env, venue))).not.toBeNull();
        expect(
          await owner.query(api.menuPanel.operations, { menuServiceId: tenantOf(env, venue).menuServiceId, fromMs: FROM_MS }),
        ).not.toBeNull();
      }
      const before = await dump(env.t, WAITER_TABLES);

      for (const [attacker, victim] of [
        ["b", "a"],
        ["a", "b"],
      ] as const) {
        const who = ownerOf(env, attacker);
        const p = panel(env, victim);
        const victimService = tenantOf(env, victim).menuServiceId;
        const target = targets[victim];
        const name = `${attacker} -> ${victim}`;
        expect(await waiterReads(who, p, target), name).toEqual(Array(6).fill(null));
        expect(await waiterWrites(who, p, target), name).toEqual(Array(6).fill(SIGNED_OUT));
        expect(await who.query(api.menuWaiter.accountEntry, p), name).toBeNull();
        expect(await who.mutation(api.menuWaiter.loginWithAccount, p), name).toEqual(SIGNED_OUT);
        expect(await who.query(api.menuPanel.operations, { menuServiceId: victimService, fromMs: FROM_MS }), name).toBeNull();
        expect(await who.query(api.menuPanel.requestDetail, { menuServiceId: victimService, requestId: target.requestId }), name).toBeNull();
        expect(
          await codeOf(who.mutation(api.menuPanel.ping, { menuServiceId: victimService, requestId: target.requestId })),
          name,
        ).toBe(MENU_ERROR.notFound);
      }

      expect(await dump(env.t, WAITER_TABLES)).toEqual(before);
    },
  );

  test(
    "ZAHTEVI (c): the owner of one venue cannot act on the other venue's request from his own panel",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const { tableA, tableB, requestA, requestB } = await bothVenues(env);
      for (const venue of ["a", "b"] as const) {
        await ownerOf(env, venue).mutation(api.menuServices.setFeature, {
          menuServiceId: tenantOf(env, venue).menuServiceId,
          feature: "occupancy",
          enabled: true,
        });
      }
      const before = await dump(env.t, WAITER_TABLES);

      for (const [venue, foreignRequest, foreignPosition] of [
        ["b", requestA, tableA.positionId],
        ["a", requestB, tableB.positionId],
      ] as const) {
        const owner = ownerOf(env, venue);
        const p = panel(env, venue);
        const service = tenantOf(env, venue).menuServiceId;
        expect(await actOn(owner, p, foreignRequest), venue).toEqual(Array(3).fill(NOT_FOUND_REQUEST));
        expect(await owner.query(api.menuWaiter.requestDetail, { ...p, requestId: foreignRequest })).toBeNull();
        expect(await owner.query(api.menuWaiter.positionDetail, { ...p, positionId: foreignPosition })).toBeNull();
        expect(await owner.mutation(api.menuWaiter.setOccupancy, { ...p, positionId: foreignPosition, state: "occupied" })).toEqual({
          ok: false,
          code: MENU_ERROR.notFound,
        });
        expect(await owner.query(api.menuPanel.requestDetail, { menuServiceId: service, requestId: foreignRequest })).toBeNull();
        expect(await owner.mutation(api.menuPanel.ping, { menuServiceId: service, requestId: foreignRequest })).toEqual(
          NOT_FOUND_REQUEST,
        );
      }
      expect(await dump(env.t, WAITER_TABLES)).toEqual(before);

      // Control: his own request is his to take.
      expect(await env.ownerB.mutation(api.menuWaiter.accept, { ...panel(env, "b"), requestId: requestB })).toMatchObject({
        ok: true,
        status: "accepted",
      });
    },
  );

  test(
    "ZAHTEVI (d): Urednik, finance, view-only, outsiders and anonymous callers have no queue and no Operativa",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ana = await addStaff(env, "a", "Ana", "246");
      const { tableA, requestA } = await bothVenues(env);
      const target: WaiterTarget = { requestId: requestA, positionId: tableA.positionId, staffId: ana };
      const service = env.w.a.menuServiceId;
      const before = await dump(env.t, WAITER_TABLES);

      // Control: the Owner, a Manager and ScanMe see the queue and Operativa.
      for (const userId of [env.w.ownerId, env.w.managerId, env.w.adminId]) {
        const who = as(env.t, userId);
        expect(await who.query(api.menuWaiter.activeRequests, panel(env, "a"))).not.toBeNull();
        expect(await who.query(api.menuPanel.operations, { menuServiceId: service, fromMs: FROM_MS })).not.toBeNull();
      }

      const pingCode: Record<string, string> = {
        editor: MENU_ERROR.forbidden, // he IS a member, without operations.read
        finance: MENU_ERROR.notFound,
        viewOnly: MENU_ERROR.notFound,
        outsider: MENU_ERROR.notFound,
        anonymous: MENU_ERROR.unauthenticated,
      };
      for (const [name, who] of noRights(env)) {
        expect(await waiterReads(who, panel(env, "a"), target), name).toEqual(Array(6).fill(null));
        expect(await waiterWrites(who, panel(env, "a"), target), name).toEqual(Array(6).fill(SIGNED_OUT));
        expect(await who.query(api.menuWaiter.accountEntry, panel(env, "a")), name).toBeNull();
        expect(await who.query(api.menuPanel.operations, { menuServiceId: service, fromMs: FROM_MS }), name).toBeNull();
        expect(await who.query(api.menuPanel.requestDetail, { menuServiceId: service, requestId: requestA }), name).toBeNull();
        expect(await codeOf(who.mutation(api.menuPanel.ping, { menuServiceId: service, requestId: requestA })), name).toBe(
          pingCode[name],
        );
      }

      expect(await dump(env.t, WAITER_TABLES)).toEqual(before);
    },
  );

  test(
    "ZAHTEVI (d): a plain PIN waiter and a guest token cannot manage zones, remind staff or act as staff",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const { tableA, requestA } = await bothVenues(env);
      const target: WaiterTarget = { requestId: requestA, positionId: tableA.positionId, staffId: ana.staffId };
      const guest = await seat(env, "a", "Sto 5");
      const service = env.w.a.menuServiceId;

      // Control: a plain waiter reads the queue.
      expect(await env.t.query(api.menuWaiter.activeRequests, panel(env, "a", ana.token))).not.toBeNull();
      const before = await dump(env.t, WAITER_TABLES);

      // She is not a panel manager: zone assignment is forbidden, and nothing is written.
      expect(
        await env.t.mutation(api.menuWaiter.setStaffZone, { ...panel(env, "a", ana.token), staffId: ana.staffId, zoneId: null }),
      ).toEqual({ ok: false, code: MENU_ERROR.forbidden });
      // Her device carries no account: Operativa, the reminder and every staff function refuse an anonymous caller.
      expect(await env.t.query(api.menuPanel.operations, { menuServiceId: service, fromMs: FROM_MS })).toBeNull();
      expect(await env.t.query(api.menuPanel.requestDetail, { menuServiceId: service, requestId: requestA })).toBeNull();
      expect(await codeOf(env.t.mutation(api.menuPanel.ping, { menuServiceId: service, requestId: requestA }))).toBe(
        MENU_ERROR.unauthenticated,
      );
      // A guest's tokens are not staff tokens, whatever the guest holds.
      for (const [name, sessionToken] of [
        ["guest token", guest.guestToken],
        ["device token", guest.deviceToken],
      ] as const) {
        const p = { ...panel(env, "a"), sessionToken };
        expect(await waiterReads(env.t, p, target), name).toEqual(Array(6).fill(null));
        expect(await waiterWrites(env.t, p, target), name).toEqual(Array(6).fill(SIGNED_OUT));
      }

      expect(await dump(env.t, WAITER_TABLES)).toEqual(before);
    },
  );
});

// =============================================================================
// REZERVACIJE
// =============================================================================

describe("REZERVACIJE", () => {
  test(
    "REZERVACIJE (a): the cancel link, device and key of venue b's reservation do nothing at venue a",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await openForm(env, "a");
      await openForm(env, "b");
      const guests = { a: await guestRequest(env, "a"), b: await guestRequest(env, "b") };
      const keys = {
        a: await deviceKeyHashFor(env.w.a.menuServiceId, guests.a.args.deviceToken),
        b: await deviceKeyHashFor(env.w.b.menuServiceId, guests.b.args.deviceToken),
      };

      // Control: each guest sees and lists his own reservation at his own venue.
      expect(await view(env, SLUG_A, guests.a.args.cancelToken)).not.toBeNull();
      expect(await view(env, SLUG_B, guests.b.args.cancelToken)).not.toBeNull();
      expect(idsOf(await mineOf(env, SLUG_A, keys.a))).toEqual([guests.a.reservationId]);
      expect(idsOf(await mineOf(env, SLUG_B, keys.b))).toEqual([guests.b.reservationId]);

      const before = await dump(env.t, RESERVATION_TABLES);
      // The cancel link of one venue is no link at the other, in both directions.
      expect(await view(env, SLUG_A, guests.b.args.cancelToken)).toBeNull();
      expect(await view(env, SLUG_B, guests.a.args.cancelToken)).toBeNull();
      expect(await cancelByLink(env, SLUG_A, guests.b.args.cancelToken)).toEqual(NOT_FOUND_RESERVATION);
      expect(await cancelByLink(env, SLUG_B, guests.a.args.cancelToken)).toEqual(NOT_FOUND_RESERVATION);
      // The device cookie: a foreign reservation id with a foreign or an own device, and the own id at the other slug.
      expect(await cancelByDevice(env, SLUG_A, guests.b.args.deviceToken, guests.b.reservationId)).toEqual(NOT_FOUND_RESERVATION);
      expect(await cancelByDevice(env, SLUG_A, guests.a.args.deviceToken, guests.b.reservationId)).toEqual(NOT_FOUND_RESERVATION);
      expect(await cancelByDevice(env, SLUG_B, guests.a.args.deviceToken, guests.a.reservationId)).toEqual(NOT_FOUND_RESERVATION);
      expect(await cancelByDevice(env, SLUG_B, guests.b.args.deviceToken, guests.a.reservationId)).toEqual(NOT_FOUND_RESERVATION);
      // "Moji zahtevi": the key of one venue lists nothing at the other.
      expect(await mineOf(env, SLUG_A, keys.b)).toEqual([]);
      expect(await mineOf(env, SLUG_B, keys.a)).toEqual([]);

      expect(await dump(env.t, RESERVATION_TABLES)).toEqual(before);
      // Both reservations are still waiting for an answer.
      const rows = await env.t.run(async (ctx) => await ctx.db.query("menuReservations").take(10));
      expect(rows.map((row) => row.status)).toEqual(["new", "new"]);
    },
  );

  test("REZERVACIJE (a): the form of venue a writes into venue a only", { timeout: TIMEOUT }, async () => {
    const env = await world();
    await openForm(env, "a");
    const rowsOf = () => env.t.run(async (ctx) => await ctx.db.query("menuReservations").take(100));

    // Venue b has no form open: a request for b is refused as "off", and writes nothing anywhere.
    const refusedAtB = await env.t.mutation(api.menuReservations.submit, {
      slug: SLUG_B,
      deviceToken: newMenuToken(),
      clientRequestId: "req-90000001",
      cancelToken: newMenuToken(),
      guestName: "Marija Gost",
      partySize: 2,
      requestedAt: THU_19,
      contactEmail: "gost@example.com",
      ipHash: nextIp(),
    });
    expect(refusedAtB).toEqual({ ok: false, code: RESERVATION_ERROR.off });
    expect(await rowsOf()).toEqual([]);

    // A request for a lands in a, with a's ids.
    const first = await guestRequest(env, "a");
    let rows = await rowsOf();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      _id: first.reservationId,
      menuServiceId: env.w.a.menuServiceId,
      businessId: env.w.a.businessId,
    });

    // Once b opens its form, the requests are kept apart: one row per venue, each with its own ids.
    await openForm(env, "b");
    const aRowBefore = must(await env.t.run(async (ctx) => await ctx.db.get(first.reservationId)), "a's row");
    const second = await guestRequest(env, "b");
    rows = await rowsOf();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row._id === second.reservationId)).toMatchObject({
      menuServiceId: env.w.b.menuServiceId,
      businessId: env.w.b.businessId,
    });
    expect(must(await env.t.run(async (ctx) => await ctx.db.get(first.reservationId)), "a's row")).toEqual(aRowBefore);
    // The public entry of each venue is its own setting.
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toMatchObject({ mode: "form" });
    expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_B })).toMatchObject({ mode: "form" });
  });

  test(
    "REZERVACIJE (b): a staff session of venue b is nobody at the reservation panel of venue a",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await openForm(env, "a");
      await openForm(env, "b");
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const petar = await signedInStaff(env, "b", "Petar", "246");
      const reservations = { a: await guestRequest(env, "a"), b: await guestRequest(env, "b") };
      const positions = { a: await addPosition(env, "a", "Sto 7"), b: await addPosition(env, "b", "Sto B1") };

      // Control: at home each token sees only its own venue's reservation.
      expect(must(await forPanel(env.t, panel(env, "a", ana.token)), "panel a").rows.map((row) => row.id)).toEqual([
        reservations.a.reservationId,
      ]);
      expect(must(await forPanel(env.t, panel(env, "b", petar.token)), "panel b").rows.map((row) => row.id)).toEqual([
        reservations.b.reservationId,
      ]);

      const before = await dump(env.t, RESERVATION_STAFF_TABLES);
      const wrong: { name: string; p: TokenPanel; venue: Venue }[] = [
        { name: "b's token at a's panel", p: { ...homeOf(env, "a"), sessionToken: petar.token }, venue: "a" },
        { name: "a's token at b's panel", p: { ...homeOf(env, "b"), sessionToken: ana.token }, venue: "b" },
        { name: "b's token with a's slug and b's code", p: { slug: SLUG_A, panelCode: env.codeB, sessionToken: petar.token }, venue: "a" },
        { name: "a's token with b's slug and a's code", p: { slug: SLUG_B, panelCode: env.codeA, sessionToken: ana.token }, venue: "b" },
      ];
      for (const { name, p, venue } of wrong) {
        expect(await forPanel(env.t, p), name).toBeNull();
        expect(await reservationDetail(env.t, p, reservations[venue].reservationId), name).toBeNull();
        expect(
          await reservationActions(env.t, p, reservations[venue].reservationId, positions[venue]),
          name,
        ).toEqual(Array(7).fill(SIGNED_OUT));
      }

      expect(await dump(env.t, RESERVATION_STAFF_TABLES)).toEqual(before);
    },
  );

  test(
    "REZERVACIJE (b): staff of one venue cannot reach, or bind a table of, the other venue's reservation",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await openForm(env, "a");
      await openForm(env, "b");
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const petar = await signedInStaff(env, "b", "Petar", "246");
      const reservations = { a: await guestRequest(env, "a"), b: await guestRequest(env, "b") };
      const tableA = await addPosition(env, "a", "Sto 7");
      const tableB = await addPosition(env, "b", "Sto B1");
      // Control: Petar accepts his own venue's reservation (the base of the bind attack below).
      expect(
        await env.t.mutation(api.menuReservations.accept, { ...panel(env, "b", petar.token), reservationId: reservations.b.reservationId }),
      ).toEqual({ ok: true, status: "accepted", changed: true });

      const before = await dump(env.t, RESERVATION_TABLES);
      // Ana, at her own panel, with the reservation id of venue b - and Petar the other way round.
      const cross: [string, PanelArgs, Id<"menuReservations">, Id<"menuPositions">][] = [
        ["ana -> b's reservation", panel(env, "a", ana.token), reservations.b.reservationId, tableA],
        ["petar -> a's reservation", panel(env, "b", petar.token), reservations.a.reservationId, tableB],
      ];
      for (const [name, p, reservationId, positionId] of cross) {
        expect(await reservationDetail(env.t, p, reservationId), name).toBeNull();
        expect(await reservationActions(env.t, p, reservationId, positionId), name).toEqual(Array(7).fill(NOT_FOUND_RESERVATION));
      }
      // Petar binds, or marks arrived at, a table of venue a on his own venue's reservation.
      expect(
        await env.t.mutation(api.menuReservations.bindPosition, {
          ...panel(env, "b", petar.token),
          reservationId: reservations.b.reservationId,
          positionId: tableA,
        }),
      ).toEqual({ ok: false, code: RESERVATION_ERROR.positionInvalid, status: "accepted" });
      expect(
        await env.t.mutation(api.menuReservations.markArrived, {
          ...panel(env, "b", petar.token),
          reservationId: reservations.b.reservationId,
          positionId: tableA,
        }),
      ).toEqual({ ok: false, code: RESERVATION_ERROR.positionInvalid, status: "accepted" });

      expect(await dump(env.t, RESERVATION_TABLES)).toEqual(before);
      const row = must(await env.t.run(async (ctx) => await ctx.db.get(reservations.b.reservationId)), "b's reservation");
      expect(row.positionId).toBeUndefined();
    },
  );

  test(
    "REZERVACIJE (c): the owner of the other venue reads and changes no reservation",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await openForm(env, "a");
      await openForm(env, "b");
      const reservations = { a: await guestRequest(env, "a"), b: await guestRequest(env, "b") };
      const positions = { a: await addPosition(env, "a", "Sto 7"), b: await addPosition(env, "b", "Sto B1") };
      // Control: each owner sees exactly his own venue's reservation in the panel.
      for (const venue of ["a", "b"] as const) {
        const rows = must(await forPanel(ownerOf(env, venue), panel(env, venue)), `panel ${venue}`).rows;
        expect(rows.map((row) => row.id)).toEqual([reservations[venue].reservationId]);
      }
      const before = await dump(env.t, RESERVATION_TABLES);

      for (const [attacker, victim] of [
        ["b", "a"],
        ["a", "b"],
      ] as const) {
        const who = ownerOf(env, attacker);
        const id = reservations[victim].reservationId;
        const name = `${attacker} -> ${victim}`;
        // At the victim's panel: nobody there.
        expect(await forPanel(who, panel(env, victim)), name).toBeNull();
        expect(await reservationDetail(who, panel(env, victim), id), name).toBeNull();
        expect(await reservationActions(who, panel(env, victim), id, positions[victim]), name).toEqual(Array(7).fill(SIGNED_OUT));
        // At his own panel, with the victim's reservation id: it does not exist there.
        expect(await reservationDetail(who, panel(env, attacker), id), name).toBeNull();
        expect(await reservationActions(who, panel(env, attacker), id, positions[attacker]), name).toEqual(
          Array(7).fill(NOT_FOUND_RESERVATION),
        );
        // His own list never mentions the victim's reservation.
        expect(JSON.stringify(await forPanel(who, panel(env, attacker))), name).not.toContain(id);
      }

      expect(await dump(env.t, RESERVATION_TABLES)).toEqual(before);
    },
  );

  test(
    "REZERVACIJE (c): the owner of the other venue cannot switch the form, the hours or the modules",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await openForm(env, "a");
      await openForm(env, "b");
      const publicBefore = [
        await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A }),
        await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_B }),
      ];
      const before = await dump(env.t, RESERVATION_TABLES);

      for (const [attacker, victim] of [
        ["b", "a"],
        ["a", "b"],
      ] as const) {
        const who = ownerOf(env, attacker);
        const menuServiceId = tenantOf(env, victim).menuServiceId;
        const name = `${attacker} -> ${victim}`;
        expect(await codeOf(who.mutation(api.menuServices.setReservations, { menuServiceId, mode: "off" })), name).toBe(
          MENU_ERROR.notFound,
        );
        expect(
          await codeOf(who.mutation(api.menuSettings.setWorkingHours, { menuServiceId, workingHours: CLOSED_WEEK })),
          name,
        ).toBe(MENU_ERROR.notFound);
        expect(
          await codeOf(who.mutation(api.menuServices.setFeature, { menuServiceId, feature: "occupancy", enabled: true })),
          name,
        ).toBe(MENU_ERROR.notFound);
      }

      expect(await dump(env.t, RESERVATION_TABLES)).toEqual(before);
      expect([
        await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A }),
        await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_B }),
      ]).toEqual(publicBefore);
    },
  );

  test(
    "REZERVACIJE (d): Urednik, finance, view-only, outsiders and anonymous callers cannot work reservations or change their settings",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await openForm(env, "a");
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const { reservationId } = await guestRequest(env, "a");
      const positionId = await addPosition(env, "a", "Sto 7");
      const service = env.w.a.menuServiceId;

      // Control: a PIN waiter (waiter.work) and the Owner work the reservation list.
      expect(await forPanel(env.t, panel(env, "a", ana.token))).not.toBeNull();
      expect(await forPanel(env.ownerA, panel(env, "a"))).not.toBeNull();
      const before = await dump(env.t, RESERVATION_TABLES);

      // Hours and the form are settings: settings.edit / features.edit.
      const settingsCode: Record<string, string> = {
        editor: MENU_ERROR.forbidden, // a member without the permission
        finance: MENU_ERROR.notFound,
        viewOnly: MENU_ERROR.notFound,
        outsider: MENU_ERROR.notFound,
        anonymous: MENU_ERROR.unauthenticated, // the PIN waiter's device is this caller
      };
      for (const [name, who] of noRights(env)) {
        expect(await forPanel(who, panel(env, "a")), name).toBeNull();
        expect(await reservationDetail(who, panel(env, "a"), reservationId), name).toBeNull();
        expect(await reservationActions(who, panel(env, "a"), reservationId, positionId), name).toEqual(Array(7).fill(SIGNED_OUT));
        expect(await codeOf(who.mutation(api.menuServices.setReservations, { menuServiceId: service, mode: "off" })), name).toBe(
          settingsCode[name],
        );
        expect(
          await codeOf(who.mutation(api.menuSettings.setWorkingHours, { menuServiceId: service, workingHours: CLOSED_WEEK })),
          name,
        ).toBe(settingsCode[name]);
      }

      expect(await dump(env.t, RESERVATION_TABLES)).toEqual(before);
      expect(await env.t.query(api.menuReservations.publicEntry, { slug: SLUG_A })).toMatchObject({ mode: "form" });
    },
  );
});

// =============================================================================
// ANALITIKA
// =============================================================================

describe("ANALITIKA", () => {
  // (b) is not applicable: pregled, period and raspodela need an account (analytics.read) and ingest takes no identity at
  // all, so no staff session or PIN can be offered to them. The PIN waiter's device is an anonymous caller: see (d).
  test(
    "ANALITIKA (a): events that name a card of venue b, sent to venue a's slug, count for venue a only",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await goLive(env, "a"); // venue b stays unpublished: its menu is not publicly served
      await premiumForBoth(env);
      const cardB = nextCardCode();
      const { cardId } = await qrCard(env, { cardCode: cardB, card: "b", link: "b" });
      await env.t.run(async (ctx) => {
        await ctx.db.patch(cardId, { label: "Demo sto B7" });
      });
      const ingest = (slug: string) =>
        env.t.mutation(api.menuAnalytics.ingest, {
          slug,
          ipHash: nextIp(),
          uredjaj: "telefon",
          dogadjaji: Array.from({ length: 3 }, () => ({ vrsta: "stranica" as const, stranica: PAGE, kartica: cardId })),
        });
      const eventsOf = async (venue: Venue) =>
        (await env.t.run(async (ctx) => await ctx.db.query("menuAnalyticsEvents").take(100))).filter(
          (row) => row.menuServiceId === tenantOf(env, venue).menuServiceId,
        );

      // The slug decides the venue: a's slug takes the events (card of b and all), b's slug is not served.
      expect(await ingest(SLUG_A)).toEqual({ ok: true, primljeno: 3 });
      expect(await ingest(SLUG_B)).toEqual({ ok: false, primljeno: 0 });
      expect(await eventsOf("a")).toHaveLength(3);
      expect(await eventsOf("b")).toEqual([]);

      await rollup(env);
      const reportA = must(await pregled(env.ownerA, env.w.a.menuServiceId), "report of a");
      expect(reportA.metrike.otvaranja.ukupno).toBe(3);
      // Card names come from the venue's own cards: b's card is never named in a's report.
      expect(reportA.skenovi).toEqual([]);
      expect(JSON.stringify(reportA)).not.toContain("Demo sto B7");
      expect(JSON.stringify(reportA)).not.toContain(cardId);
      const byCard = must(
        await env.ownerA.query(api.menuAnalytics.raspodela, {
          menuServiceId: env.w.a.menuServiceId,
          danas: DANAS,
          od: dan(6),
          do: DANAS,
          metrika: "otvaranja",
          dimenzija: "kartica",
        }),
        "breakdown by card",
      );
      expect(byCard.vrednosti.map((row) => row.vrednost)).not.toContain(cardId);
      expect(JSON.stringify(byCard)).not.toContain("Demo sto B7");

      // Venue b's own report counted nothing.
      const reportB = must(await pregled(env.ownerB, env.w.b.menuServiceId), "report of b");
      expect(reportB.metrike.otvaranja.ukupno).toBe(0);
      expect(reportB.skenovi).toEqual([]);
      expect(JSON.stringify(reportB)).not.toContain("Demo sto B7");
    },
  );

  test("ANALITIKA (c): the owner of the other venue reads nothing of the analytics", { timeout: TIMEOUT }, async () => {
    const env = await world();
    await premiumForBoth(env); // the plan gate must not be what refuses
    await addPageOpens(env, "a", 2);
    await addPageOpens(env, "b", 1);
    await rollup(env);
    const services = { a: env.w.a.menuServiceId, b: env.w.b.menuServiceId };

    // Control: each owner reads his own numbers (a's 2 opens, b's 1).
    expect(must(await pregled(env.ownerA, services.a)).metrike.otvaranja.ukupno).toBe(2);
    expect(must(await pregled(env.ownerB, services.b)).metrike.otvaranja.ukupno).toBe(1);
    expect(must(await periodOf(env.ownerA, services.a)).metrike.otvaranja.ukupno).toBe(2);
    expect(must(await raspodelaOf(env.ownerB, services.b)).vrednosti).toHaveLength(1);

    const before = await dump(env.t, ANALYTICS_TABLES);
    for (const [attacker, victim] of [
      ["b", "a"],
      ["a", "b"],
    ] as const) {
      const who = ownerOf(env, attacker);
      const name = `${attacker} -> ${victim}`;
      expect(await pregled(who, services[victim]), name).toBeNull();
      expect(await periodOf(who, services[victim]), name).toBeNull();
      expect(await raspodelaOf(who, services[victim]), name).toBeNull();
    }
    // The ingest is the only analytics write and takes no identity: a signed-in owner of b gains nothing by it at a's slug.
    expect(await dump(env.t, ANALYTICS_TABLES)).toEqual(before);
  });

  test(
    "ANALITIKA (d): Urednik, finance, view-only, outsiders and anonymous callers get null",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await premiumForBoth(env);
      await addPageOpens(env, "a", 2);
      await rollup(env);
      const service = env.w.a.menuServiceId;

      // Control: the Owner, a Manager and ScanMe read.
      for (const userId of [env.w.ownerId, env.w.managerId, env.w.adminId]) {
        const who = as(env.t, userId);
        expect(must(await pregled(who, service), "pregled").metrike.otvaranja.ukupno).toBe(2);
        expect(await periodOf(who, service)).not.toBeNull();
        expect(await raspodelaOf(who, service)).not.toBeNull();
      }
      const before = await dump(env.t, ANALYTICS_TABLES);

      // The PIN waiter is the anonymous caller here: no analytics function takes a staff session.
      for (const [name, who] of noRights(env)) {
        expect(await pregled(who, service), name).toBeNull();
        expect(await periodOf(who, service), name).toBeNull();
        expect(await raspodelaOf(who, service), name).toBeNull();
      }
      expect(await dump(env.t, ANALYTICS_TABLES)).toEqual(before);
    },
  );
});

// =============================================================================
// TIM (team and staff)
// =============================================================================

describe("TIM (team and staff)", () => {
  test(
    "TIM (a): an invitation link of venue a is useless to the accounts of venue b",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const invite = await env.ownerA.mutation(api.menuTeam.invite, {
        menuServiceId: env.w.a.menuServiceId,
        email: "ana@example.com",
        role: "editor",
      });
      const before = await dump(env.t, TEAM_TABLES);

      // The owner of b, and every other account that is not "ana@example.com", gets a mismatch; the invitation stays.
      for (const userId of [env.w.otherOwnerId, env.w.outsiderId, env.w.financeId, env.w.editorId]) {
        expect(await codeOf(as(env.t, userId).mutation(api.menuTeam.acceptInvite, { token: invite.token }))).toBe(
          TEAM_ERROR.emailMismatch,
        );
      }
      expect(await codeOf(env.t.mutation(api.menuTeam.acceptInvite, { token: invite.token }))).toBe(MENU_ERROR.unauthenticated);
      // The public face of the link shows the venue, the role and "mismatch" - never the address.
      const status = await as(env.t, env.w.otherOwnerId).query(api.menuTeam.inviteStatus, { token: invite.token });
      expect(status).toMatchObject({ status: "pending", venue: "Kafana kod Mike", role: "editor", viewer: "mismatch" });
      expect(JSON.stringify(status)).not.toContain("ana@example.com");

      expect(await dump(env.t, TEAM_TABLES)).toEqual(before);
      const row = must(await env.t.run(async (ctx) => await ctx.db.get(invite.memberId)), "the invitation");
      expect(row.status).toBe("invited");
      expect(row.userId).toBeUndefined();
      expect(row.inviteTokenHash).toBe(await inviteTokenHash(invite.token));
    },
  );

  test(
    "TIM (b): the same PIN digits may live in both venues, each opens only its own member",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      await addStaff(env, "a", "Ana", "246");
      await addStaff(env, "b", "Jelena", "555");
      const markoId = await addStaff(env, "a", "Marko");

      // A PIN chosen by hand at venue a is not "taken" because venue b holds it: the answer never crosses the wall.
      expect(await env.ownerA.mutation(api.menuStaff.setPin, { staffId: markoId, pin: "555" })).toMatchObject({ pin: "555" });
      // Inside venue a a held PIN is taken.
      expect(await codeOf(env.ownerA.mutation(api.menuStaff.setPin, { staffId: markoId, pin: "246" }))).toBe(STAFF_ERROR.pinTaken);

      // 555 opens Marko at a and Jelena at b.
      expect(await loginAt(env, homeOf(env, "a"), "555")).toMatchObject({ ok: true, displayName: "Marko" });
      expect(await loginAt(env, homeOf(env, "b"), "555")).toMatchObject({ ok: true, displayName: "Jelena" });
      // The staff lists are the venues' own.
      const names = async (venue: Venue) =>
        (must(await ownerOf(env, venue).query(api.menuStaff.list, { menuServiceId: tenantOf(env, venue).menuServiceId }), "staff list"))
          .map((row) => row.displayName)
          .sort();
      expect(await names("a")).toEqual(["Ana", "Marko"]);
      expect(await names("b")).toEqual(["Jelena"]);

      // Freeing 555 at a (Marko leaves) does not free or touch it at b.
      await env.ownerA.mutation(api.menuStaff.deactivate, { staffId: markoId });
      expect(await loginAt(env, homeOf(env, "a"), "555")).toMatchObject({ ok: false, code: STAFF_ERROR.wrongPin });
      expect(await loginAt(env, homeOf(env, "b"), "555")).toMatchObject({ ok: true, displayName: "Jelena" });
    },
  );

  test(
    "TIM (b): rotating the panel code and lifting the PIN locks of venue a never touch venue b",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ana = await signedInStaff(env, "a", "Ana", "246");
      const jelena = await signedInStaff(env, "b", "Jelena", "555");

      // Lock one device at venue b: five wrong PINs from the same phone.
      let deviceToken: string | undefined;
      for (let miss = 1; miss <= 5; miss += 1) {
        const result = await loginAt(env, homeOf(env, "b"), "000", deviceToken);
        if (result.ok || !("deviceToken" in result)) throw new Error("a wrong PIN must answer with a device token");
        expect(result.code).toBe(miss < 5 ? STAFF_ERROR.wrongPin : STAFF_ERROR.locked);
        deviceToken = result.deviceToken;
      }
      const ofB = async () => {
        const sessions = await env.t.run(async (ctx) => await ctx.db.query("menuStaffSessions").take(100));
        const attempts = await env.t.run(async (ctx) => await ctx.db.query("menuPinAttempts").take(100));
        return {
          sessions: sessions.filter((row) => row.menuServiceId === env.w.b.menuServiceId),
          attempts: attempts.filter((row) => row.menuServiceId === env.w.b.menuServiceId),
        };
      };
      const before = await ofB();
      expect(before.sessions).toHaveLength(1);
      expect(before.attempts.some((row) => row.lockedUntil !== undefined && row.lockedUntil > T0)).toBe(true);

      // Venue a's owner rotates a's panel code (a's devices are signed out) and lifts a's locks.
      expect(await env.ownerA.mutation(api.menuStaff.rotatePanelCode, { menuServiceId: env.w.a.menuServiceId })).toMatchObject({
        endedSessions: 1,
      });
      expect(await env.ownerA.mutation(api.menuStaff.unlockPins, { menuServiceId: env.w.a.menuServiceId })).toEqual({ unlocked: 0 });

      // Venue b: same sessions, same lock rows, same panel code, Jelena still signed in, the device still locked.
      expect(await ofB()).toEqual(before);
      expect(await env.ownerB.query(api.menuStaff.panelLink, { menuServiceId: env.w.b.menuServiceId })).toMatchObject({ code: env.codeB });
      expect(await env.t.query(api.menuWaiter.me, panel(env, "b", jelena.token))).toMatchObject({ displayName: "Jelena" });
      expect(await loginAt(env, homeOf(env, "b"), "555", deviceToken)).toMatchObject({ ok: false, code: STAFF_ERROR.locked });
      // Venue a was changed, as asked: Ana's old session is gone.
      expect(await env.t.query(api.menuWaiter.me, panel(env, "a", ana.token))).toBeNull();
    },
  );

  test(
    "TIM (c): the owner of venue b reads and changes nothing of venue a's team and staff",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ids = { a: await teamFixture(env, "a"), b: await teamFixture(env, "b") };
      // Control: the rightful owner reads his team and staff.
      for (const reads of await teamReads(env.ownerA, ids.a)) expect(reads).not.toBeNull();
      const before = await dump(env.t, TEAM_TABLES);

      expect(await teamReads(env.ownerB, ids.a)).toEqual([null, null, null, null]);
      const { got, expected } = await teamOutcomes(env.ownerB, ids.a, (attack) =>
        attack.target === "row" ? MENU_ERROR.notFound : MENU_ERROR.forbidden,
      );
      expect(got).toEqual(expected);

      expect(await dump(env.t, TEAM_TABLES)).toEqual(before);
    },
  );

  test(
    "TIM (c): the owner of venue a cannot touch venue b's team and staff either",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ids = { a: await teamFixture(env, "a"), b: await teamFixture(env, "b") };
      for (const reads of await teamReads(env.ownerB, ids.b)) expect(reads).not.toBeNull();
      const before = await dump(env.t, TEAM_TABLES);

      expect(await teamReads(env.ownerA, ids.b)).toEqual([null, null, null, null]);
      const { got, expected } = await teamOutcomes(env.ownerA, ids.b, (attack) =>
        attack.target === "row" ? MENU_ERROR.notFound : MENU_ERROR.forbidden,
      );
      expect(got).toEqual(expected);
      // Rows of the two venues never mix: a's staff member with b's zone, b's staff member with a's zone.
      const zones = { a: await addZone(env, "a", "Terasa"), b: await addZone(env, "b", "Basta") };
      const withZones = await dump(env.t, [...TEAM_TABLES, "menuZones"] as const);
      expect(await codeOf(env.ownerA.mutation(api.menuStaff.setZone, { staffId: ids.a.staffId, zoneId: zones.b }))).toBe(
        MENU_ERROR.notFound,
      );
      expect(await codeOf(env.ownerA.mutation(api.menuStaff.setZone, { staffId: ids.b.staffId, zoneId: zones.a }))).toBe(
        MENU_ERROR.notFound,
      );
      expect(await codeOf(env.ownerB.mutation(api.menuStaff.setZone, { staffId: ids.a.staffId, zoneId: zones.a }))).toBe(
        MENU_ERROR.notFound,
      );

      expect(await dump(env.t, TEAM_TABLES)).toEqual(before);
      expect(await dump(env.t, [...TEAM_TABLES, "menuZones"] as const)).toEqual(withZones);
    },
  );

  test(
    "TIM (d): Urednik, finance, view-only, outsiders and anonymous callers cannot manage the team or the staff",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ids = await teamFixture(env, "a");
      const context = (who: Caller) => who.query(api.menuServices.context, { businessSlug: SLUG_A });
      // Control: the Owner, a Manager and ScanMe read the team.
      for (const userId of [env.w.ownerId, env.w.managerId, env.w.adminId]) {
        for (const reads of await teamReads(as(env.t, userId), ids)) expect(reads).not.toBeNull();
      }
      const before = await dump(env.t, TEAM_TABLES);

      // The Urednik is a member of the Menu service, without team.manage and staff.pin.
      const editorContext = must(await context(as(env.t, env.w.editorId)), "the Urednik's context");
      expect(editorContext.actor).toBe("editor");
      expect(editorContext.permissions).toEqual(permissionsOf("editor"));
      expect(editorContext.permissions).not.toContain("team.manage");
      expect(editorContext.permissions).not.toContain("staff.pin");
      // Finance and view-only account members have no Menu access at all.
      for (const userId of [env.w.financeId, env.w.viewOnlyId, env.w.outsiderId]) {
        expect(await context(as(env.t, userId))).toBeNull();
      }
      expect(await context(env.t)).toBeNull();

      for (const [name, who] of noRights(env)) {
        expect(await teamReads(who, ids), name).toEqual([null, null, null, null]);
        const { got, expected } = await teamOutcomes(who, ids, (attack) => {
          if (name === "anonymous") return MENU_ERROR.unauthenticated;
          // A member without the permission is told "forbidden"; somebody without any role gets "not found" for a row id.
          return attack.target === "row" && name !== "editor" ? MENU_ERROR.notFound : MENU_ERROR.forbidden;
        });
        expect(got, name).toEqual(expected);
      }

      expect(await dump(env.t, TEAM_TABLES)).toEqual(before);
    },
  );

  test(
    "TIM (d): a PIN waiter has no account: no team, no staff and no PIN management",
    { timeout: TIMEOUT },
    async () => {
      const env = await world();
      const ids = await teamFixture(env, "a"); // Ana (246) is the PIN waiter of the fixture
      // Ana and Marko (a panel manager) sign in with their PINs; their devices are anonymous callers for the account functions.
      const anaSession = await loginAt(env, homeOf(env, "a"), "246");
      expect(anaSession).toMatchObject({ ok: true, displayName: "Ana" });
      if (!anaSession.ok) throw new Error("Ana could not sign in");
      await signedInStaff(env, "a", "Marko", "135", "manager");
      expect(permissionsOf("staff")).toEqual(["waiter.work"]);
      const before = await dump(env.t, TEAM_TABLES);

      expect(await teamReads(env.t, ids)).toEqual([null, null, null, null]);
      const { got, expected } = await teamOutcomes(env.t, ids, () => MENU_ERROR.unauthenticated);
      expect(got).toEqual(expected);
      // The one staff power a panel manager has - assigning zones inside the panel - needs the panel role, and Ana lacks it.
      expect(
        await env.t.mutation(api.menuWaiter.setStaffZone, {
          ...panel(env, "a", anaSession.sessionToken),
          staffId: ids.staffId,
          zoneId: null,
        }),
      ).toEqual({ ok: false, code: MENU_ERROR.forbidden });

      expect(await dump(env.t, TEAM_TABLES)).toEqual(before);
    },
  );
});
