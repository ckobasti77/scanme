/// <reference types="vite/client" />

// ScanMe Menu V1 — K21: the guest actions of a scanned position (master §8;
// plan K19 §4.2, K19-5…K19-10): call the waiter, ask for the bill (cash or
// card, a preference only), send an order to the waiter for review (standard
// pages or Room service), cancel a request that is still new and read "Moji
// zahtevi". Proven here: the gates (switches, session, published menu), the
// one-open-request rule, the order snapshot and server-side pricing (variants,
// add-ons, notes, promotions, availability, price confirmation, Room service),
// the shape limits and the buckets, the status transitions, the guest's own
// cancellation, the privacy of myRequests and the schema (no payment state).
//
// Fictional tenants only (the repo is public): "Kafana kod Mike", "Demo restoran".

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { applyRequestAction, type RequestActorDoc } from "./lib/menuRequests";
import { MENU_GUEST_SESSION_MS, type GuestRequestOutcome } from "./menuGuest";
import schema from "./schema";
import { REQUEST_ERROR } from "../lib/menu/errors/requests";
import { newMenuKey } from "../lib/menu/keys";
import { MENU_REQUEST_STATUSES, nextStatus, type RequestAction } from "../lib/menu/request-status";
import { deviceKeyHashFor, sessionTokenHash } from "../lib/menu/tokens";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  seedQrLink,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const IP = "0123456789abcdef0123456789abcdef";

const CODE = {
  invalidInput: "request/invalid_input",
  noSession: "request/no_session",
  actionOff: "request/action_off",
  rateLimited: "request/rate_limited",
  menuUnavailable: "request/menu_unavailable",
  cartUnavailable: "request/cart_unavailable",
  cartStale: "request/cart_stale",
  cartPriceChanged: "request/cart_price_changed",
  notFound: "request/not_found",
  notCancellable: "request/not_cancellable",
  invalidTransition: "request/invalid_transition",
  tooManyOpen: "request/too_many_open",
  taken: "request/taken",
} as const;

// -----------------------------------------------------------------------------
// World and content (the patterns of menuGuest.test.ts and menuPublicK13.test.ts)
// -----------------------------------------------------------------------------

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
}

async function addArticle(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
  priceRsd?: number,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
  });
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

/**
 * Tenant A's default page: "Pića" (Jelen pivo 200, Espreso 150) and "Hrana"
 * (Pljeskavica 450, Pita sa sirom 320).
 */
async function menuContent(t: T, w: MenuWorldSeed) {
  const drinks = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
  const food = await addSection(t, w.ownerId, w.a.defaultPageId, "Hrana");
  const beer = await addArticle(t, w.ownerId, drinks.sectionId, "Jelen pivo", 200);
  const coffee = await addArticle(t, w.ownerId, drinks.sectionId, "Espreso", 150);
  const burger = await addArticle(t, w.ownerId, food.sectionId, "Pljeskavica", 450);
  const pita = await addArticle(t, w.ownerId, food.sectionId, "Pita sa sirom", 320);
  return { drinks, food, beer, coffee, burger, pita };
}

async function base() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const c = await menuContent(t, w);
  return { t, w, c };
}
type Env = Awaited<ReturnType<typeof base>>;

type Feature = "callWaiter" | "billRequest" | "ordering" | "roomService";
const GUEST_FEATURES = ["callWaiter", "billRequest", "ordering"] as const;

async function setFeatures(env: Pick<Env, "t" | "w">, features: readonly Feature[], enabled = true) {
  for (const feature of features) {
    await as(env.t, env.w.ownerId).mutation(api.menuServices.setFeature, {
      menuServiceId: env.w.a.menuServiceId,
      feature,
      enabled,
    });
  }
}

async function addPosition(
  t: T,
  menuServiceId: Id<"menuServices">,
  label: string,
  kind: "table" | "room" | "other" = "table",
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: newMenuKey("position"),
      kind,
      label,
      labelNormalized: label.toLowerCase(),
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** A Menu card of tenant A standing on a position (its label is "Sto 1", see seedQrLink). */
async function menuCard(
  t: T,
  w: MenuWorldSeed,
  input: { cardCode: string; positionId: Id<"menuPositions">; pageKey?: string },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey: input.pageKey ?? "unused",
      createdByUserId: w.adminId,
      cardCode: input.cardCode,
    });
    await ctx.db.patch(seeded.linkId, { pageKey: input.pageKey, positionId: input.positionId });
    return seeded;
  });
}

// Card codes avoid I, L, O and U (the resolver alphabet).
let cardCounter = 0;
function nextCardCode() {
  cardCounter += 1;
  return `RQ${String(cardCounter).padStart(6, "0")}`;
}

type Guest = { guestToken: string; deviceToken: string };
type Seat = Guest & {
  positionId: Id<"menuPositions">;
  cardId: Id<"cards">;
  cardCode: string;
  pagePath: string | null;
};

/** The hop: opens a guest session on a card; without a device token the phone is a new device. */
async function scan(t: T, cardCode: string, deviceToken?: string) {
  const outcome = await t.mutation(api.menuGuest.mintFromCard, {
    cardCode,
    ipHash: IP,
    ...(deviceToken ? { deviceToken } : {}),
  });
  if (outcome.kind !== "menu" || !outcome.session) {
    throw new Error(`expected a session, got ${JSON.stringify(outcome)}`);
  }
  return { ...outcome.session, pagePath: outcome.pagePath };
}

/** A new position with a card on it and a phone that scanned the card. */
async function seat(
  env: Pick<Env, "t" | "w">,
  input: { label?: string; kind?: "table" | "room" | "other"; pageKey?: string; deviceToken?: string } = {},
): Promise<Seat> {
  const positionId = await addPosition(env.t, env.w.a.menuServiceId, input.label ?? "Sto 12", input.kind);
  const cardCode = nextCardCode();
  const { cardId } = await menuCard(env.t, env.w, {
    cardCode,
    positionId,
    ...(input.pageKey ? { pageKey: input.pageKey } : {}),
  });
  const guest = await scan(env.t, cardCode, input.deviceToken);
  return { ...guest, positionId, cardId, cardCode };
}

async function livePage(t: T) {
  const result = await t.query(api.menuPublic.page, { slug: SLUG_A });
  if (result === null || result.kind !== "page") throw new Error("expected the one published page");
  const articles = result.sections.flatMap((section) => section.articles);
  const get = (name: string) => {
    const found = articles.find((article) => article.name === name);
    if (!found) throw new Error(`no article ${name} on the published page`);
    return found;
  };
  return { pageKey: result.page.key, pageSlug: result.page.slug, versionNumber: result.versionNumber, get };
}
type LivePage = Awaited<ReturnType<typeof livePage>>;

/**
 * Content (optional), the three guest switches, a publication, a table "Sto 12"
 * with a phone on it, and the published page.
 */
async function ready(options: { features?: readonly Feature[]; prepare?: (env: Env) => Promise<void> } = {}) {
  const env = await base();
  await options.prepare?.(env);
  await setFeatures(env, options.features ?? GUEST_FEATURES);
  await publishNow(env.t, env.w.ownerId, env.w.a.menuServiceId);
  const table = await seat(env);
  const page = await livePage(env.t);
  return { ...env, table, page };
}
type Ready = Awaited<ReturnType<typeof ready>>;

// -----------------------------------------------------------------------------
// Guest calls
// -----------------------------------------------------------------------------

type OrderLine = {
  pageKey: string | null;
  articleKey: string;
  variantKey: string | null;
  addonKeys: string[];
  quantity: number;
  note: string | null;
};

function line(page: LivePage, name: string, extra: Partial<OrderLine> = {}): OrderLine {
  return {
    pageKey: page.pageKey,
    articleKey: page.get(name).key,
    variantKey: null,
    addonKeys: [],
    quantity: 1,
    note: null,
    ...extra,
  };
}

function variantKeyOf(page: LivePage, article: string, variant: string) {
  const found = page.get(article).variants.find((row) => row.name === variant);
  if (!found) throw new Error(`no variant ${variant} on ${article}`);
  return found.key;
}

function addonKeyOf(page: LivePage, article: string, option: string) {
  for (const group of page.get(article).addonGroups) {
    const found = group.options.find((row) => row.name === option);
    if (found) return found.key;
  }
  throw new Error(`no add-on ${option} on ${article}`);
}

const callWaiter = (t: T, guestToken: string, slug = SLUG_A) =>
  t.mutation(api.menuGuest.callWaiter, { slug, guestToken, ipHash: IP });

const requestBill = (t: T, guestToken: string, payment: "cash" | "card", slug = SLUG_A) =>
  t.mutation(api.menuGuest.requestBill, { slug, guestToken, ipHash: IP, payment });

const submit = (
  t: T,
  guestToken: string,
  lines: OrderLine[],
  seenTotalRsd: number,
  options: { channel?: "standard" | "room_service" | undefined; slug?: string | undefined } = {},
) =>
  t.mutation(api.menuGuest.submitOrder, {
    slug: options.slug ?? SLUG_A,
    guestToken,
    ipHash: IP,
    channel: options.channel ?? "standard",
    lines,
    seenTotalRsd,
  });

const cancel = (t: T, deviceToken: string, requestId: string, slug = SLUG_A) =>
  t.mutation(api.menuGuest.cancelRequest, { slug, deviceToken, requestId, ipHash: IP });

function ok(outcome: GuestRequestOutcome) {
  if (!outcome.ok) throw new Error(`expected ok, got ${JSON.stringify(outcome)}`);
  return outcome;
}

function idOf(outcome: GuestRequestOutcome): Id<"menuRequests"> {
  const requestId = ok(outcome).requestId;
  if (requestId === null) throw new Error("the outcome carries no request id");
  return requestId;
}

const codeOf = (outcome: GuestRequestOutcome) => (outcome.ok ? "ok" : outcome.code);

// -----------------------------------------------------------------------------
// Database reads
// -----------------------------------------------------------------------------

const allRequests = (t: T) => t.run(async (ctx) => await ctx.db.query("menuRequests").collect());
const allItems = (t: T) => t.run(async (ctx) => await ctx.db.query("menuRequestItems").collect());

async function requestRow(t: T, requestId: Id<"menuRequests">) {
  const row = await t.run(async (ctx) => await ctx.db.get(requestId));
  if (!row) throw new Error("request row missing");
  return row;
}

async function itemsOf(t: T, requestId: Id<"menuRequests">) {
  const rows = await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuRequestItems")
        .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
        .collect(),
  );
  return rows.sort((a, b) => a.order - b.order);
}

async function sessionRowOf(t: T, guestToken: string) {
  const tokenHash = await sessionTokenHash(guestToken);
  const row = await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuGuestSessions")
        .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
        .unique(),
  );
  if (!row) throw new Error("session row missing");
  return row;
}

async function auditRows(t: T, menuServiceId: Id<"menuServices">, prefix = "request.") {
  const rows = await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuAuditLog")
        .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
  return rows.filter((row) => row.action.startsWith(prefix));
}

async function apply(t: T, requestId: Id<"menuRequests">, action: RequestAction, actor: RequestActorDoc) {
  return await t.run(async (ctx) => {
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error("request row missing");
    return await applyRequestAction(ctx, request, action, actor, Date.now());
  });
}

const staff = (userId: Id<"users">) => ({ kind: "user", userId }) as const;

async function mine(t: T, menuServiceId: Id<"menuServices">, deviceToken: string, slug = SLUG_A) {
  return await t.query(api.menuGuest.myRequests, {
    slug,
    deviceKey: await deviceKeyHashFor(menuServiceId, deviceToken),
  });
}

async function setPromo(
  env: Pick<Env, "t" | "w">,
  articleId: Id<"menuArticles">,
  promo: {
    active: boolean;
    mode: "price" | "percent";
    priceRsd?: number;
    percent?: number;
    startsAt?: number;
    endsAt?: number;
  },
) {
  const result = await as(env.t, env.w.ownerId).mutation(api.menuPromos.setPromo, {
    articleId,
    expected: null,
    promo,
  });
  if (!result.ok) throw new Error(`setPromo refused: ${JSON.stringify(result)}`);
}

/** Kafa with variants Mala 150 / Velika 190, Kapućino 200 with an optional "Mleko" and a note, Pica 600 with a required "Prilog". */
async function optionsContent(env: Env) {
  const { t, w, c } = env;
  const owner = as(t, w.ownerId);
  const kafa = await addArticle(t, w.ownerId, c.drinks.sectionId, "Kafa", 150);
  await owner.mutation(api.menuArticleOptions.addVariant, { articleId: kafa.articleId, name: "Mala", priceRsd: 150 });
  await owner.mutation(api.menuArticleOptions.addVariant, { articleId: kafa.articleId, name: "Velika", priceRsd: 190 });
  const kapucino = await addArticle(t, w.ownerId, c.drinks.sectionId, "Kapućino", 200);
  await owner.mutation(api.menuArticleOptions.createAddonGroup, {
    articleId: kapucino.articleId,
    name: "Mleko",
    selection: "single",
    required: false,
    options: [
      { name: "Sojino", priceDeltaRsd: 30 },
      { name: "Bademovo", priceDeltaRsd: 40 },
    ],
  });
  await owner.mutation(api.menuArticleOptions.setArticleOptionSwitches, {
    articleId: kapucino.articleId,
    noteEnabled: true,
  });
  const pica = await addArticle(t, w.ownerId, c.food.sectionId, "Pica", 600);
  await owner.mutation(api.menuArticleOptions.createAddonGroup, {
    articleId: pica.articleId,
    name: "Prilog",
    selection: "single",
    required: true,
    options: [
      { name: "Kačkavalj", priceDeltaRsd: 60 },
      { name: "Pavlaka", priceDeltaRsd: 0 },
    ],
  });
}

// =============================================================================
// 1. Gates
// =============================================================================

describe("gates", () => {
  test.each(GUEST_FEATURES)(
    "%s off: refused with request/action_off and nothing is written; switched on it works at once",
    async (feature) => {
      const env = await ready({ features: GUEST_FEATURES.filter((name) => name !== feature) });
      const { t, page, table } = env;
      const act = (): Promise<GuestRequestOutcome> =>
        feature === "callWaiter"
          ? callWaiter(t, table.guestToken)
          : feature === "billRequest"
            ? requestBill(t, table.guestToken, "cash")
            : submit(t, table.guestToken, [line(page, "Jelen pivo")], 200);

      expect(await act()).toEqual({ ok: false, code: CODE.actionOff });
      expect(await allRequests(t)).toHaveLength(0);
      expect(await allItems(t)).toHaveLength(0);

      await setFeatures(env, [feature]);
      expect((await act()).ok).toBe(true);
      expect(await allRequests(t)).toHaveLength(1);
    },
  );

  async function refusedEverywhere(env: Ready, guestToken: string, slug = SLUG_A) {
    return [
      await callWaiter(env.t, guestToken, slug),
      await requestBill(env.t, guestToken, "cash", slug),
      await submit(env.t, guestToken, [line(env.page, "Jelen pivo")], 200, { slug }),
    ].map(codeOf);
  }
  const NO_SESSION_X3 = [CODE.noSession, CODE.noSession, CODE.noSession];

  test("a made-up or malformed token has no session", async () => {
    const env = await ready();
    expect(await refusedEverywhere(env, "x".repeat(43))).toEqual(NO_SESSION_X3);
    expect(await refusedEverywhere(env, "kratak")).toEqual(NO_SESSION_X3);
    expect(await allRequests(env.t)).toHaveLength(0);
  });

  test("another venue's slug with this venue's token has no session, even when that venue is live", async () => {
    const env = await ready();
    const { t, w } = env;
    const pasta = await addSection(t, w.otherOwnerId, w.b.defaultPageId, "Pasta");
    await addArticle(t, w.otherOwnerId, pasta.sectionId, "Špageti", 600);
    await as(t, w.otherOwnerId).mutation(api.menuServices.setFeature, {
      menuServiceId: w.b.menuServiceId,
      feature: "callWaiter",
      enabled: true,
    });
    await publishNow(t, w.otherOwnerId, w.b.menuServiceId);

    expect(await refusedEverywhere(env, env.table.guestToken, SLUG_B)).toEqual(NO_SESSION_X3);
    expect(await refusedEverywhere(env, env.table.guestToken, "nepoznat-lokal")).toEqual(NO_SESSION_X3);
    expect(await allRequests(t)).toHaveLength(0);
    // The venue the session belongs to still works.
    expect(codeOf(await callWaiter(t, env.table.guestToken))).toBe("ok");
  });

  test("an expired session has no session (a mutation compares expiresAt with the clock)", async () => {
    const env = await ready();
    const session = await sessionRowOf(env.t, env.table.guestToken);
    const now = Date.now();
    await env.t.run(async (ctx) => {
      await ctx.db.patch(session._id, { createdAt: now - MENU_GUEST_SESSION_MS - 1, expiresAt: now - 1 });
    });
    expect(await refusedEverywhere(env, env.table.guestToken)).toEqual(NO_SESSION_X3);
    expect(await allRequests(env.t)).toHaveLength(0);
  });

  test("an archived position has no session", async () => {
    const env = await ready();
    await env.t.run(async (ctx) => {
      await ctx.db.patch(env.table.positionId, { active: false });
    });
    expect(await refusedEverywhere(env, env.table.guestToken)).toEqual(NO_SESSION_X3);
    expect(await allRequests(env.t)).toHaveLength(0);
  });

  test("the same phone scanning another table ends the old session for actions", async () => {
    const env = await ready();
    const second = await seat(env, { label: "Sto 13", deviceToken: env.table.deviceToken });
    expect(await refusedEverywhere(env, env.table.guestToken)).toEqual(NO_SESSION_X3);
    const outcome = ok(await callWaiter(env.t, second.guestToken));
    expect((await requestRow(env.t, idOf(outcome))).positionLabel).toBe("Sto 13");
  });

  test("nothing published: request/menu_unavailable for call, bill and order", async () => {
    const env = await base();
    await setFeatures(env, GUEST_FEATURES);
    const table = await seat(env);
    const lines: OrderLine[] = [
      { pageKey: "pg_nepoznata", articleKey: "ar_nepoznat", variantKey: null, addonKeys: [], quantity: 1, note: null },
    ];
    expect(
      [
        await callWaiter(env.t, table.guestToken),
        await requestBill(env.t, table.guestToken, "card"),
        await submit(env.t, table.guestToken, lines, 100),
      ].map(codeOf),
    ).toEqual([CODE.menuUnavailable, CODE.menuUnavailable, CODE.menuUnavailable]);
    expect(await allRequests(env.t)).toHaveLength(0);
    expect(await env.t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: table.guestToken })).toMatchObject({
      actions: { call: false, bill: false, order: false, roomService: false },
    });
  });

  test("sessionView offers a table the actions the venue switched on, and other spots behave like a table", async () => {
    const env = await ready({ features: ["callWaiter", "ordering"] });
    expect(await env.t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: env.table.guestToken })).toEqual({
      position: { label: "Sto 12", kind: "table" },
      actions: { call: true, bill: false, order: true, roomService: false },
      expiresAt: (await sessionRowOf(env.t, env.table.guestToken)).expiresAt,
    });
    const terrace = await seat(env, { label: "Terasa", kind: "other" });
    expect(codeOf(await callWaiter(env.t, terrace.guestToken))).toBe("ok");
    expect(await allRequests(env.t)).toMatchObject([{ positionKind: "other", positionLabel: "Terasa" }]);
  });
});

// =============================================================================
// 2. Call and bill
// =============================================================================

describe("call the waiter and ask for the bill", () => {
  test("a call writes one new request with the snapshots and no personal data", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const outcome = ok(await callWaiter(t, table.guestToken));
    expect(outcome).toMatchObject({ ok: true, status: "new", deduped: false, totals: null });
    const requestId = idOf(outcome);

    const rows = await allRequests(t);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    const session = await sessionRowOf(t, table.guestToken);
    expect(row).toMatchObject({
      _id: requestId,
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      kind: "call",
      status: "new",
      channel: "standard",
      positionId: table.positionId,
      positionLabel: "Sto 12",
      positionKind: "table",
      cardId: table.cardId,
      sourceLabel: "Sto 1",
      guestSessionId: session._id,
      deviceKeyHash: await deviceKeyHashFor(w.a.menuServiceId, table.deviceToken),
      createdAt: outcome.createdAt,
    });
    // Nothing else is on the row: no payment, no sums, no staff, no contact data.
    expect(Object.keys(row).sort()).toEqual(
      [
        "_creationTime",
        "_id",
        "businessId",
        "cardId",
        "channel",
        "createdAt",
        "deviceKeyHash",
        "guestSessionId",
        "kind",
        "menuServiceId",
        "positionId",
        "positionKind",
        "positionLabel",
        "sourceLabel",
        "status",
        "updatedAt",
      ].sort(),
    );
    const json = JSON.stringify(row);
    expect(json).not.toContain(table.guestToken);
    expect(json).not.toContain(table.deviceToken);
  });

  test("a second call while the first is open returns the same request and writes nothing", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const first = ok(await callWaiter(t, table.guestToken));
    const again = ok(await callWaiter(t, table.guestToken));
    expect(again).toMatchObject({ deduped: true, status: "new", createdAt: first.createdAt, totals: null });
    expect(again.requestId).toBe(first.requestId);
    expect(await allRequests(t)).toHaveLength(1);

    // Still the same request once the waiter took it.
    await apply(t, idOf(first), "accept", staff(w.ownerId));
    const afterAccept = ok(await callWaiter(t, table.guestToken));
    expect(afterAccept).toMatchObject({ deduped: true, status: "accepted" });
    expect(afterAccept.requestId).toBe(first.requestId);
    expect(await allRequests(t)).toHaveLength(1);
  });

  test("a call and a bill are separate open requests", async () => {
    const env = await ready();
    const call = ok(await callWaiter(env.t, env.table.guestToken));
    const bill = ok(await requestBill(env.t, env.table.guestToken, "cash"));
    expect(bill.deduped).toBe(false);
    expect(bill.requestId).not.toBe(call.requestId);
    expect((await allRequests(env.t)).map((row) => row.kind).sort()).toEqual(["bill", "call"]);
  });

  test("a bill stores the payment preference; another one updates it while the bill is new", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const first = ok(await requestBill(t, table.guestToken, "cash"));
    expect(await requestRow(t, idOf(first))).toMatchObject({ kind: "bill", status: "new", paymentPreference: "cash" });

    const second = ok(await requestBill(t, table.guestToken, "card"));
    expect(second).toMatchObject({ deduped: true, status: "new" });
    expect(second.requestId).toBe(first.requestId);
    expect(await allRequests(t)).toHaveLength(1);
    expect((await requestRow(t, idOf(first))).paymentPreference).toBe("card");

    // Once the waiter took the bill the preference stays.
    await apply(t, idOf(first), "accept", staff(w.ownerId));
    expect(ok(await requestBill(t, table.guestToken, "cash")).status).toBe("accepted");
    expect((await requestRow(t, idOf(first))).paymentPreference).toBe("card");
  });

  test("an invalid payment literal fails argument validation and writes nothing", async () => {
    const env = await ready();
    await expect(
      env.t.mutation(api.menuGuest.requestBill, {
        slug: SLUG_A,
        guestToken: env.table.guestToken,
        ipHash: IP,
        payment: "paid" as unknown as "cash",
      }),
    ).rejects.toThrow();
    await expect(
      env.t.mutation(api.menuGuest.requestBill, { slug: SLUG_A, guestToken: env.table.guestToken, ipHash: IP } as never),
    ).rejects.toThrow();
    expect(await allRequests(env.t)).toHaveLength(0);
  });

  test("a second phone at the same table is deduped and never learns the request id", async () => {
    const env = await ready();
    const { t, table } = env;
    const first = ok(await callWaiter(t, table.guestToken));
    const phone2 = await scan(t, table.cardCode);
    expect(phone2.deviceToken).not.toBe(table.deviceToken);

    const second = ok(await callWaiter(t, phone2.guestToken));
    expect(second).toMatchObject({ requestId: null, status: "new", deduped: true, createdAt: first.createdAt, totals: null });
    expect(await allRequests(t)).toHaveLength(1);

    const bill = ok(await requestBill(t, table.guestToken, "cash"));
    const billFromPhone2 = ok(await requestBill(t, phone2.guestToken, "card"));
    expect(billFromPhone2).toMatchObject({ requestId: null, deduped: true });
    // The other phone's preference is the table's current one.
    expect((await requestRow(t, idOf(bill))).paymentPreference).toBe("card");
    expect(await allRequests(t)).toHaveLength(2);
  });
});

// =============================================================================
// 3. Order snapshot
// =============================================================================

describe("an order is a snapshot", () => {
  test("lines are re-priced from the live version and stored with names and prices; a later publication changes nothing", async () => {
    const env = await ready({
      prepare: async ({ t, w, c }) => {
        await as(t, w.ownerId).mutation(api.menuArticleOptions.setArticleOptionSwitches, {
          articleId: c.pita.articleId,
          noteEnabled: true,
        });
      },
    });
    const { t, w, c, page, table } = env;
    const outcome = ok(
      await submit(
        t,
        table.guestToken,
        [
          line(page, "Jelen pivo", { quantity: 2 }),
          line(page, "Pljeskavica"),
          line(page, "Pita sa sirom", { note: "bez luka" }),
        ],
        1170,
      ),
    );
    expect(outcome).toMatchObject({
      status: "new",
      deduped: false,
      totals: { subtotalRsd: 1170, deliveryFeeRsd: 0, totalRsd: 1170 },
    });
    const requestId = idOf(outcome);

    const request = await requestRow(t, requestId);
    expect(request).toMatchObject({
      kind: "order",
      status: "new",
      channel: "standard",
      positionLabel: "Sto 12",
      itemCount: 3,
      subtotalRsd: 1170,
      totalRsd: 1170,
      versionNumber: 1,
    });
    expect(request.deliveryFeeRsd).toBeUndefined();
    expect(request.paymentPreference).toBeUndefined();

    const items = await itemsOf(t, requestId);
    expect(items).toHaveLength(3);
    expect(
      items.map((item) => ({
        pageKey: item.pageKey,
        articleKey: item.articleKey,
        name: item.name,
        unitPriceRsd: item.unitPriceRsd,
        quantity: item.quantity,
        lineTotalRsd: item.lineTotalRsd,
        addons: item.addons,
        note: item.note,
        order: item.order,
      })),
    ).toEqual([
      {
        pageKey: page.pageKey,
        articleKey: page.get("Jelen pivo").key,
        name: "Jelen pivo",
        unitPriceRsd: 200,
        quantity: 2,
        lineTotalRsd: 400,
        addons: [],
        note: undefined,
        order: 0,
      },
      {
        pageKey: page.pageKey,
        articleKey: page.get("Pljeskavica").key,
        name: "Pljeskavica",
        unitPriceRsd: 450,
        quantity: 1,
        lineTotalRsd: 450,
        addons: [],
        note: undefined,
        order: 1,
      },
      {
        pageKey: page.pageKey,
        articleKey: page.get("Pita sa sirom").key,
        name: "Pita sa sirom",
        unitPriceRsd: 320,
        quantity: 1,
        lineTotalRsd: 320,
        addons: [],
        note: "bez luka",
        order: 2,
      },
    ]);

    // The owner changes a price and a name and publishes version 2.
    const owner = as(t, w.ownerId);
    await owner.mutation(api.menuCatalog.setBasePrice, { articleId: c.beer.articleId, expectedPriceRsd: 200, priceRsd: 250 });
    await owner.mutation(api.menuCatalog.updateArticleFields, {
      articleId: c.beer.articleId,
      expected: { name: "Jelen pivo" },
      patch: { name: "Jelen pivo 0,5 l" },
    });
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    const page2 = await livePage(t);
    expect(page2.versionNumber).toBe(2);
    expect(page2.get("Jelen pivo 0,5 l").priceRsd).toBe(250);

    // The sent order is exactly as it was.
    expect(await requestRow(t, requestId)).toEqual(request);
    expect(await itemsOf(t, requestId)).toEqual(items);

    // A new order uses the new price and name.
    const second = ok(await submit(t, table.guestToken, [line(page2, "Jelen pivo 0,5 l")], 250));
    expect(second.totals).toEqual({ subtotalRsd: 250, deliveryFeeRsd: 0, totalRsd: 250 });
    const secondItems = await itemsOf(t, idOf(second));
    expect(secondItems).toMatchObject([{ name: "Jelen pivo 0,5 l", unitPriceRsd: 250, quantity: 1, lineTotalRsd: 250 }]);
    expect(await requestRow(t, idOf(second))).toMatchObject({ versionNumber: 2, totalRsd: 250 });
  });
});

// =============================================================================
// 4. Variants, add-ons and note
// =============================================================================

describe("variants, add-ons and notes", () => {
  test("a variant is required when the article has variants; it is priced by the variant", async () => {
    const env = await ready({ prepare: optionsContent });
    const { t, page, table } = env;
    const velika = variantKeyOf(page, "Kafa", "Velika");
    const mala = variantKeyOf(page, "Kafa", "Mala");

    // Missing, unknown, and a variant on an article that has none: stale, with the line index.
    expect(await submit(t, table.guestToken, [line(page, "Jelen pivo"), line(page, "Kafa")], 350)).toMatchObject({
      ok: false,
      code: CODE.cartStale,
      staleLines: [1],
    });
    expect(await submit(t, table.guestToken, [line(page, "Kafa", { variantKey: "va_nepostojeci" })], 150)).toMatchObject({
      ok: false,
      code: CODE.cartStale,
      staleLines: [0],
    });
    expect(await submit(t, table.guestToken, [line(page, "Espreso", { variantKey: velika })], 150)).toMatchObject({
      ok: false,
      code: CODE.cartStale,
      staleLines: [0],
    });
    expect(await allRequests(t)).toHaveLength(0);

    const outcome = ok(
      await submit(t, table.guestToken, [line(page, "Kafa", { variantKey: velika, quantity: 2 }), line(page, "Kafa", { variantKey: mala })], 530),
    );
    expect(outcome.totals).toEqual({ subtotalRsd: 530, deliveryFeeRsd: 0, totalRsd: 530 });
    expect(await itemsOf(t, idOf(outcome))).toMatchObject([
      { name: "Kafa", variantKey: velika, variantName: "Velika", unitPriceRsd: 190, quantity: 2, lineTotalRsd: 380 },
      { name: "Kafa", variantKey: mala, variantName: "Mala", unitPriceRsd: 150, quantity: 1, lineTotalRsd: 150 },
    ]);
  });

  test("a required add-on group below its minimum, an unknown add-on and too many add-ons are stale", async () => {
    const env = await ready({ prepare: optionsContent });
    const { t, page, table } = env;
    const kackavalj = addonKeyOf(page, "Pica", "Kačkavalj");
    const pavlaka = addonKeyOf(page, "Pica", "Pavlaka");
    const sojino = addonKeyOf(page, "Kapućino", "Sojino");
    const bademovo = addonKeyOf(page, "Kapućino", "Bademovo");
    const stale = { ok: false, code: CODE.cartStale, staleLines: [0] };

    // Pica: the group "Prilog" is required.
    expect(await submit(t, table.guestToken, [line(page, "Pica")], 600)).toMatchObject(stale);
    expect(await submit(t, table.guestToken, [line(page, "Pica", { addonKeys: ["ad_nepostojeci"] })], 600)).toMatchObject(stale);
    expect(await submit(t, table.guestToken, [line(page, "Pica", { addonKeys: [kackavalj, pavlaka] })], 660)).toMatchObject(stale);
    // Kapućino: the optional group "Mleko" still has a maximum of one, and only its own options exist.
    expect(await submit(t, table.guestToken, [line(page, "Kapućino", { addonKeys: [sojino, bademovo] })], 270)).toMatchObject(stale);
    expect(await submit(t, table.guestToken, [line(page, "Kapućino", { addonKeys: ["ad_nepostojeci"] })], 200)).toMatchObject(stale);
    expect(await submit(t, table.guestToken, [line(page, "Kapućino", { addonKeys: [kackavalj] })], 260)).toMatchObject(stale);
    // The same add-on twice is not a valid shape at all.
    expect(await submit(t, table.guestToken, [line(page, "Kapućino", { addonKeys: [sojino, sojino] })], 260)).toEqual({
      ok: false,
      code: CODE.invalidInput,
    });
    expect(await allRequests(t)).toHaveLength(0);
  });

  test("an add-on surcharge is added to the piece and stored with its group and option", async () => {
    const env = await ready({ prepare: optionsContent });
    const { t, page, table } = env;
    const sojino = addonKeyOf(page, "Kapućino", "Sojino");
    const kackavalj = addonKeyOf(page, "Pica", "Kačkavalj");
    const milk = page.get("Kapućino").addonGroups[0];
    const side = page.get("Pica").addonGroups[0];

    const outcome = ok(
      await submit(
        t,
        table.guestToken,
        [
          line(page, "Kapućino"),
          line(page, "Kapućino", { addonKeys: [sojino], quantity: 2 }),
          line(page, "Pica", { addonKeys: [kackavalj] }),
        ],
        // 200 + 2 x (200 + 30) + (600 + 60)
        1320,
      ),
    );
    expect(outcome.totals).toEqual({ subtotalRsd: 1320, deliveryFeeRsd: 0, totalRsd: 1320 });
    expect(await itemsOf(t, idOf(outcome))).toMatchObject([
      { name: "Kapućino", addons: [], unitPriceRsd: 200, quantity: 1, lineTotalRsd: 200 },
      {
        name: "Kapućino",
        unitPriceRsd: 200,
        quantity: 2,
        lineTotalRsd: 460,
        addons: [{ groupKey: milk.key, groupName: "Mleko", optionKey: sojino, optionName: "Sojino", priceDeltaRsd: 30 }],
      },
      {
        name: "Pica",
        unitPriceRsd: 600,
        quantity: 1,
        lineTotalRsd: 660,
        addons: [{ groupKey: side.key, groupName: "Prilog", optionKey: kackavalj, optionName: "Kačkavalj", priceDeltaRsd: 60 }],
      },
    ]);
  });

  test("a note needs the article's note switch; with it the cleaned note is stored", async () => {
    const env = await ready({ prepare: optionsContent });
    const { t, page, table } = env;

    // Espreso has no note switch.
    expect(await submit(t, table.guestToken, [line(page, "Espreso", { note: "bez šećera" })], 150)).toMatchObject({
      ok: false,
      code: CODE.cartStale,
      staleLines: [0],
    });
    expect(await allRequests(t)).toHaveLength(0);

    // A blank note is no note; Kapućino has the switch.
    const outcome = ok(
      await submit(
        t,
        table.guestToken,
        [line(page, "Espreso", { note: "   " }), line(page, "Kapućino", { note: "  bez   šećera " })],
        350,
      ),
    );
    const items = await itemsOf(t, idOf(outcome));
    expect(items.map((item) => item.note)).toEqual([undefined, "bez šećera"]);
  });
});

// =============================================================================
// 5. Promotions
// =============================================================================

describe("promotions", () => {
  test("a running percent or price promotion lowers the unit price and is flagged on the line", async () => {
    const env = await ready({
      prepare: async (e) => {
        await setPromo(e, e.c.beer.articleId, { active: true, mode: "percent", percent: 25 });
        await setPromo(e, e.c.coffee.articleId, { active: true, mode: "price", priceRsd: 120 });
      },
    });
    const { t, page, table } = env;
    const lines = [line(page, "Jelen pivo", { quantity: 2 }), line(page, "Espreso"), line(page, "Pljeskavica")];

    // The regular total is no longer today's total.
    expect(await submit(t, table.guestToken, lines, 1000)).toMatchObject({
      ok: false,
      code: CODE.cartPriceChanged,
      totals: { subtotalRsd: 870, deliveryFeeRsd: 0, totalRsd: 870 },
      prices: [
        { index: 0, pieceRsd: 150, lineTotalRsd: 300 },
        { index: 1, pieceRsd: 120, lineTotalRsd: 120 },
        { index: 2, pieceRsd: 450, lineTotalRsd: 450 },
      ],
    });
    const outcome = ok(await submit(t, table.guestToken, lines, 870));
    expect(outcome.totals?.totalRsd).toBe(870);
    const items = await itemsOf(t, idOf(outcome));
    expect(items.map((item) => [item.name, item.unitPriceRsd, item.lineTotalRsd, item.promoApplied])).toEqual([
      ["Jelen pivo", 150, 300, true],
      ["Espreso", 120, 120, true],
      ["Pljeskavica", 450, 450, undefined],
    ]);
  });

  test("an ended or not yet started promotion charges the regular price; a running scheduled one applies (Premium)", async () => {
    const hour = 60 * 60 * 1000;
    const env = await ready({
      prepare: async (e) => {
        await e.t.run(async (ctx) => {
          await grantAccountPremium(ctx, { accountId: e.w.a.accountId, via: "plan" });
        });
        const now = Date.now();
        await setPromo(e, e.c.pita.articleId, { active: true, mode: "percent", percent: 50, startsAt: now - 2 * hour, endsAt: now - hour });
        await setPromo(e, e.c.burger.articleId, { active: true, mode: "percent", percent: 10, startsAt: now - hour, endsAt: now + hour });
        await setPromo(e, e.c.coffee.articleId, { active: true, mode: "percent", percent: 20, startsAt: now + hour, endsAt: now + 2 * hour });
      },
    });
    const { t, page, table } = env;
    // Pita ended (320), Pljeskavica running (450 - 10 % = 405), Espreso not started (150).
    const outcome = ok(
      await submit(t, table.guestToken, [line(page, "Pita sa sirom"), line(page, "Pljeskavica"), line(page, "Espreso")], 875),
    );
    const items = await itemsOf(t, idOf(outcome));
    expect(items.map((item) => [item.name, item.unitPriceRsd, item.promoApplied])).toEqual([
      ["Pita sa sirom", 320, undefined],
      ["Pljeskavica", 405, true],
      ["Espreso", 150, undefined],
    ]);
  });
});

// =============================================================================
// 6. Unavailable articles
// =============================================================================

describe("unavailable articles", () => {
  test("one unavailable article refuses the WHOLE order and nothing is written; it is live, no publication needed", async () => {
    const env = await ready();
    const { t, w, c, page, table } = env;
    const owner = as(t, w.ownerId);
    await owner.mutation(api.menuAvailability.setAvailability, { articleId: c.beer.articleId, available: false });

    const lines = [line(page, "Jelen pivo"), line(page, "Pljeskavica")];
    expect(await submit(t, table.guestToken, lines, 650)).toEqual({
      ok: false,
      code: CODE.cartUnavailable,
      unavailableKeys: [page.get("Jelen pivo").key],
    });
    expect(await allRequests(t)).toHaveLength(0);
    expect(await allItems(t)).toHaveLength(0);

    // Two unavailable articles are both named.
    await owner.mutation(api.menuAvailability.setAvailability, { articleId: c.coffee.articleId, available: false });
    const both = await submit(t, table.guestToken, [...lines, line(page, "Espreso")], 800);
    if (both.ok || both.code !== CODE.cartUnavailable) throw new Error(`expected unavailable, got ${JSON.stringify(both)}`);
    expect([...(both.unavailableKeys ?? [])].sort()).toEqual([page.get("Jelen pivo").key, page.get("Espreso").key].sort());

    // A vanished article is reported before an unavailable one.
    const ghost = { ...line(page, "Jelen pivo"), articleKey: "ar_nepostojeci" };
    expect(await submit(t, table.guestToken, [line(page, "Jelen pivo"), ghost], 400)).toMatchObject({
      ok: false,
      code: CODE.cartStale,
      staleLines: [1],
    });
    expect(await allRequests(t)).toHaveLength(0);

    // Available again: the same cart goes through at once.
    await owner.mutation(api.menuAvailability.setAvailability, { articleId: c.beer.articleId, available: true });
    expect((await submit(t, table.guestToken, lines, 650)).ok).toBe(true);
    expect(await allRequests(t)).toHaveLength(1);
  });
});

// =============================================================================
// 7. Price confirmation
// =============================================================================

describe("price confirmation", () => {
  test("a total that differs from the server's returns the prices and totals and writes nothing; resending the total succeeds", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const lines = [line(page, "Jelen pivo", { quantity: 2 }), line(page, "Pljeskavica")];

    const refused = await submit(t, table.guestToken, lines, 800);
    expect(refused).toEqual({
      ok: false,
      code: CODE.cartPriceChanged,
      prices: [
        { index: 0, pieceRsd: 200, lineTotalRsd: 400 },
        { index: 1, pieceRsd: 450, lineTotalRsd: 450 },
      ],
      totals: { subtotalRsd: 850, deliveryFeeRsd: 0, totalRsd: 850 },
    });
    expect(await allRequests(t)).toHaveLength(0);
    expect(await allItems(t)).toHaveLength(0);

    const accepted = ok(await submit(t, table.guestToken, lines, 850));
    expect(accepted.totals).toEqual({ subtotalRsd: 850, deliveryFeeRsd: 0, totalRsd: 850 });
    expect(await allRequests(t)).toHaveLength(1);
    expect(await allItems(t)).toHaveLength(2);
  });
});

// =============================================================================
// 8. Limits and shape
// =============================================================================

describe("limits and shape", () => {
  test("a malformed order is refused with request/invalid_input and writes nothing", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const beer = line(page, "Jelen pivo");
    const cases: { name: string; lines: OrderLine[]; seen?: number; channel?: "standard" | "room_service" }[] = [
      { name: "no lines", lines: [], seen: 0 },
      { name: "31 lines", lines: Array.from({ length: 31 }, () => beer), seen: 6200 },
      { name: "quantity 0", lines: [{ ...beer, quantity: 0 }] },
      { name: "quantity 51", lines: [{ ...beer, quantity: 51 }] },
      { name: "fractional quantity", lines: [{ ...beer, quantity: 1.5 }] },
      { name: "note of 281 characters", lines: [{ ...beer, note: "x".repeat(281) }] },
      { name: "six different pages", lines: ["a", "b", "c", "d", "e", "f"].map((s) => ({ ...beer, pageKey: `pg_${s}` })) },
      { name: "negative seen total", lines: [beer], seen: -1 },
      { name: "fractional seen total", lines: [beer], seen: 200.5 },
      { name: "standard line without a page", lines: [{ ...beer, pageKey: null }] },
      { name: "room service line with a page", lines: [beer], channel: "room_service" },
      { name: "article key with a space", lines: [{ ...beer, articleKey: "ar x" }] },
      { name: "duplicate add-ons", lines: [{ ...beer, addonKeys: ["ad_1", "ad_1"] }] },
      { name: "21 add-ons", lines: [{ ...beer, addonKeys: Array.from({ length: 21 }, (_, i) => `ad_${i}`) }] },
    ];
    for (const bad of cases) {
      const outcome = await submit(t, table.guestToken, bad.lines, bad.seen ?? 200, { channel: bad.channel });
      expect(outcome, bad.name).toEqual({ ok: false, code: CODE.invalidInput });
    }
    expect(await allRequests(t)).toHaveLength(0);
    expect(await allItems(t)).toHaveLength(0);
  });

  test("the boundaries are allowed: 5 pages pass the shape check, 30 lines and quantity 50 are accepted", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const beer = line(page, "Jelen pivo");

    // Five different (here unknown) pages are a valid shape; the lines are stale, not invalid.
    const fivePages = ["a", "b", "c", "d", "e"].map((s) => ({ ...beer, pageKey: `pg_${s}` }));
    expect(await submit(t, table.guestToken, fivePages, 1000)).toMatchObject({
      ok: false,
      code: CODE.cartStale,
      staleLines: [0, 1, 2, 3, 4],
    });

    // 29 lines of one piece and one of 50 pieces.
    const lines = [...Array.from({ length: 29 }, () => beer), { ...beer, quantity: 50 }];
    const outcome = ok(await submit(t, table.guestToken, lines, 29 * 200 + 50 * 200));
    expect(await requestRow(t, idOf(outcome))).toMatchObject({ itemCount: 30, totalRsd: 15800 });
    expect(await itemsOf(t, idOf(outcome))).toHaveLength(30);
  });

  test("the table's order bucket is not spent by an invalid argument: 10 invalid orders, then 4 valid ones, then the limit", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const beer = line(page, "Jelen pivo");
    // K21 hardening: one phone may have at most 3 orders waiting, so the 4th valid order comes from a second phone.
    const phone2 = await scan(t, table.cardCode);

    for (let i = 0; i < 10; i += 1) {
      const outcome = await submit(t, table.guestToken, [{ ...beer, quantity: 0 }], 200);
      expect(outcome).toEqual({ ok: false, code: CODE.invalidInput });
    }
    for (let i = 0; i < 3; i += 1) {
      expect((await submit(t, table.guestToken, [beer], 200)).ok, `valid order ${i + 1}`).toBe(true);
    }
    expect((await submit(t, phone2.guestToken, [beer], 200)).ok, "valid order 4").toBe(true);
    expect(await submit(t, phone2.guestToken, [beer], 200)).toEqual({ ok: false, code: CODE.rateLimited });
    expect(await allRequests(t)).toHaveLength(4);
  });
});

// =============================================================================
// 9. Room service
// =============================================================================

describe("Room service", () => {
  async function roomEnv(options: { features?: readonly Feature[] } = {}) {
    const env = await base();
    const { t, w, c } = env;
    const owner = as(t, w.ownerId);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    expect(
      await owner.mutation(api.menuRoomService.updateSettings, {
        menuServiceId: w.a.menuServiceId,
        expected: { markupPercent: null, deliveryFeeRsd: null },
        patch: { markupPercent: 15, deliveryFeeRsd: 300 },
      }),
    ).toEqual({ ok: true });
    const category = await owner.mutation(api.menuRoomService.addCategory, {
      menuServiceId: w.a.menuServiceId,
      name: "Hrana u sobu",
    });
    await owner.mutation(api.menuRoomService.addItems, {
      categoryId: category.categoryId,
      articleIds: [c.burger.articleId, c.pita.articleId],
    });
    // A promotion on the standard page must never reach the Room service price.
    await setPromo(env, c.burger.articleId, { active: true, mode: "percent", percent: 10 });
    await setFeatures(env, options.features ?? ["callWaiter", "billRequest", "ordering", "roomService"]);
    await publishNow(t, w.ownerId, w.a.menuServiceId);

    const page = await livePage(t);
    const rs = await t.query(api.menuPublic.roomService, { slug: SLUG_A });
    if (!rs) throw new Error("Room service is not published");
    const rsArticles = rs.categories.flatMap((category) => category.articles);
    const rsLine = (name: string, quantity: number): OrderLine => {
      const article = rsArticles.find((row) => row.name === name);
      if (!article) throw new Error(`no Room service article ${name}`);
      return { pageKey: null, articleKey: article.key, variantKey: null, addonKeys: [], quantity, note: null };
    };
    const room = await seat(env, { label: "Soba 204", kind: "room" });
    const table = await seat(env, { label: "Sto 12" });
    return { ...env, page, rs, rsArticles, rsLine, room, table };
  }

  test("a room orders at the Room service prices (markup, half up) and the delivery fee is added once", async () => {
    const env = await roomEnv();
    const { t, w, page, rs, rsArticles, rsLine, room } = env;

    // Published prices: 450 + 15 % = 517,5 -> 518; 320 + 15 % = 368. The promotion of the standard page is not used.
    expect(page.get("Pljeskavica").promo).not.toBeNull();
    expect(rsArticles.map((row) => [row.name, row.priceRsd])).toEqual([
      ["Pljeskavica", 518],
      ["Pita sa sirom", 368],
    ]);
    expect(rs.deliveryFeeRsd).toBe(300);

    const lines = [rsLine("Pljeskavica", 2), rsLine("Pita sa sirom", 3)];
    // Items only (2 x 518 + 3 x 368 = 2140): the fee is part of the total the server expects.
    expect(await submit(t, room.guestToken, lines, 2140, { channel: "room_service" })).toMatchObject({
      ok: false,
      code: CODE.cartPriceChanged,
      prices: [
        { index: 0, pieceRsd: 518, lineTotalRsd: 1036 },
        { index: 1, pieceRsd: 368, lineTotalRsd: 1104 },
      ],
      totals: { subtotalRsd: 2140, deliveryFeeRsd: 300, totalRsd: 2440 },
    });
    expect(await allRequests(t)).toHaveLength(0);

    const outcome = ok(await submit(t, room.guestToken, lines, 2440, { channel: "room_service" }));
    expect(outcome.totals).toEqual({ subtotalRsd: 2140, deliveryFeeRsd: 300, totalRsd: 2440 });
    const request = await requestRow(t, idOf(outcome));
    expect(request).toMatchObject({
      kind: "order",
      status: "new",
      channel: "room_service",
      positionKind: "room",
      positionLabel: "Soba 204",
      itemCount: 2,
      subtotalRsd: 2140,
      deliveryFeeRsd: 300,
      totalRsd: 2440,
      versionNumber: 1,
    });
    const items = await itemsOf(t, idOf(outcome));
    expect(items.map((item) => [item.name, item.pageKey, item.unitPriceRsd, item.quantity, item.lineTotalRsd, item.promoApplied])).toEqual([
      ["Pljeskavica", undefined, 518, 2, 1036, undefined],
      ["Pita sa sirom", undefined, 368, 3, 1104, undefined],
    ]);
    expect(w.a.menuServiceId).toBe(request.menuServiceId);
  });

  test("a room offers only Room service; a table never gets it; a room cannot send a standard order, call or ask for the bill", async () => {
    const env = await roomEnv();
    const { t, page, rsLine, room, table } = env;

    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: room.guestToken })).toMatchObject({
      position: { label: "Soba 204", kind: "room" },
      actions: { call: false, bill: false, order: false, roomService: true },
    });
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: table.guestToken })).toMatchObject({
      actions: { call: true, bill: true, order: true, roomService: false },
    });

    const actionOff = { ok: false, code: CODE.actionOff };
    expect(await submit(t, room.guestToken, [line(page, "Pljeskavica")], 405)).toEqual(actionOff);
    expect(await callWaiter(t, room.guestToken)).toEqual(actionOff);
    expect(await requestBill(t, room.guestToken, "cash")).toEqual(actionOff);
    expect(await submit(t, table.guestToken, [rsLine("Pljeskavica", 1)], 818, { channel: "room_service" })).toEqual(actionOff);
    expect(await allRequests(t)).toHaveLength(0);
  });

  test("the hop of a room card without a page opens Room service; a card with its own page keeps it", async () => {
    const env = await roomEnv();
    const { t, page, room } = env;
    expect(room.pagePath).toBe("room-service");
    // The same room scanned again.
    expect((await scan(t, room.cardCode, room.deviceToken)).pagePath).toBe("room-service");

    const withPage = await seat(env, { label: "Soba 205", kind: "room", pageKey: page.pageKey });
    expect(withPage.pagePath).toBe(page.pageSlug);
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: withPage.guestToken })).toMatchObject({
      actions: { roomService: true },
    });
    // A table card without a page has no Room service path.
    const table = await seat(env, { label: "Sto 14" });
    expect(table.pagePath).toBeNull();
  });

  test("the room does not get Room service while it is unavailable: no Premium, switch off, ordering off or nothing published", async () => {
    // Nothing published and no Premium: the hop opens no Room service path.
    const bare = await base();
    const bareRoom = await seat(bare, { label: "Soba 1", kind: "room" });
    expect(bareRoom.pagePath).toBeNull();
    expect(await bare.t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: bareRoom.guestToken })).toMatchObject({
      actions: { call: false, bill: false, order: false, roomService: false },
    });

    // ordering off, then the Room service switch off: refused live, no publication needed.
    const env = await roomEnv();
    const { t, rsLine, room } = env;
    const lines = [rsLine("Pljeskavica", 1)];
    await setFeatures(env, ["ordering"], false);
    expect(await submit(t, room.guestToken, lines, 818, { channel: "room_service" })).toEqual({ ok: false, code: CODE.actionOff });
    await setFeatures(env, ["ordering"]);
    expect((await submit(t, room.guestToken, lines, 818, { channel: "room_service" })).ok).toBe(true);
    await setFeatures(env, ["roomService"], false);
    expect(await submit(t, room.guestToken, lines, 818, { channel: "room_service" })).toEqual({ ok: false, code: CODE.actionOff });
    expect(await allRequests(t)).toHaveLength(1);
  });

  test("losing Premium refuses the Room service order even though the published part stays", async () => {
    const env = await roomEnv();
    const { t, w, rsLine, room } = env;
    const lines = [rsLine("Pljeskavica", 1)];
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: room.guestToken })).toMatchObject({
      actions: { roomService: true },
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.accountId, { plan: "basic", updatedAt: Date.now() });
    });
    expect(await submit(t, room.guestToken, lines, 818, { channel: "room_service" })).toEqual({
      ok: false,
      code: CODE.actionOff,
    });
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: room.guestToken })).toMatchObject({
      actions: { call: false, bill: false, order: false, roomService: false },
    });
    expect(await allRequests(t)).toHaveLength(0);
  });
});

// =============================================================================
// 10. Rate limits
// =============================================================================

describe("rate limits", () => {
  test("orders are limited per POSITION: 4 from the table succeed, the 5th (also from a second phone) is refused, another table is free", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const phone2 = await scan(t, table.cardCode);
    const beer = [line(page, "Jelen pivo")];

    for (let i = 0; i < 3; i += 1) {
      expect((await submit(t, table.guestToken, beer, 200)).ok, `order ${i + 1}`).toBe(true);
    }
    expect((await submit(t, phone2.guestToken, beer, 200)).ok, "order 4 (second phone)").toBe(true);
    // K21 hardening: the first phone already has 3 orders waiting for the waiter.
    expect(await submit(t, table.guestToken, beer, 200)).toEqual({ ok: false, code: CODE.tooManyOpen });
    // The second phone has its own session bucket, but the table's bucket is empty.
    expect(await submit(t, phone2.guestToken, beer, 200)).toEqual({ ok: false, code: CODE.rateLimited });

    const other = await seat(env, { label: "Sto 13" });
    expect((await submit(t, other.guestToken, beer, 200)).ok).toBe(true);
    expect(await allRequests(t)).toHaveLength(5);
  });

  test("calls are limited per position: after the waiter finishes each one a new call is allowed, the 4th new call is refused", async () => {
    const env = await ready();
    const { t, w, table } = env;
    for (let i = 0; i < 3; i += 1) {
      const outcome = ok(await callWaiter(t, table.guestToken));
      expect(outcome.deduped, `call ${i + 1}`).toBe(false);
      expect(await apply(t, idOf(outcome), "done", staff(w.ownerId))).toMatchObject({ ok: true, status: "done" });
    }
    expect(await callWaiter(t, table.guestToken)).toEqual({ ok: false, code: CODE.rateLimited });
    expect((await allRequests(t)).filter((row) => row.kind === "call")).toHaveLength(3);
    // The bill has its own bucket.
    expect(ok(await requestBill(t, table.guestToken, "cash")).deduped).toBe(false);
  });

  test("bills are limited per position: the 4th new bill in a minute is refused", async () => {
    const env = await ready();
    const { t, w, table } = env;
    for (let i = 0; i < 3; i += 1) {
      const outcome = ok(await requestBill(t, table.guestToken, "cash"));
      expect(outcome.deduped, `bill ${i + 1}`).toBe(false);
      await apply(t, idOf(outcome), "done", staff(w.ownerId));
    }
    expect(await requestBill(t, table.guestToken, "card")).toEqual({ ok: false, code: CODE.rateLimited });
    expect(ok(await callWaiter(t, table.guestToken)).deduped).toBe(false);
  });

  test("the guest session bucket (10 a minute) is spent by refused carts too and is per session", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const beer = [line(page, "Jelen pivo")];
    const wrongTotal = 1;

    for (let i = 0; i < 10; i += 1) {
      const outcome = await submit(t, table.guestToken, beer, wrongTotal);
      expect(outcome, `refused cart ${i + 1}`).toMatchObject({ ok: false, code: CODE.cartPriceChanged });
    }
    expect(await submit(t, table.guestToken, beer, wrongTotal)).toEqual({ ok: false, code: CODE.rateLimited });

    // Another phone at the table has its own session bucket, and the refused carts never spent the table's.
    const phone2 = await scan(t, table.cardCode);
    expect((await submit(t, phone2.guestToken, beer, 200)).ok).toBe(true);
  });

  test("cancelling is limited per device (10 a minute); requests that do not exist spend nothing", async () => {
    const env = await ready();
    const { t, table } = env;
    const requestId = idOf(await callWaiter(t, table.guestToken));

    for (let i = 0; i < 15; i += 1) {
      expect(await cancel(t, table.deviceToken, "nije-zahtev")).toEqual({ ok: false, code: CODE.notFound });
    }
    for (let i = 0; i < 10; i += 1) {
      expect(await cancel(t, table.deviceToken, requestId), `cancel ${i + 1}`).toEqual({ ok: true, status: "cancelled" });
    }
    expect(await cancel(t, table.deviceToken, requestId)).toEqual({ ok: false, code: CODE.rateLimited });
  });
});

// =============================================================================
// 11. Status transitions (applyRequestAction)
// =============================================================================

describe("status transitions", () => {
  async function newCall() {
    const env = await ready();
    const requestId = idOf(await callWaiter(env.t, env.table.guestToken));
    return { ...env, requestId };
  }

  test("new -> accepted -> done writes who and when, and neither is audited", async () => {
    const { t, w, requestId } = await newCall();
    expect(await apply(t, requestId, "accept", staff(w.ownerId))).toEqual({ ok: true, status: "accepted", changed: true });
    const accepted = await requestRow(t, requestId);
    expect(accepted).toMatchObject({ status: "accepted", acceptedByUserId: w.ownerId });
    expect(typeof accepted.acceptedAt).toBe("number");
    expect(accepted.doneAt).toBeUndefined();

    expect(await apply(t, requestId, "done", staff(w.ownerId))).toEqual({ ok: true, status: "done", changed: true });
    const done = await requestRow(t, requestId);
    expect(done).toMatchObject({ status: "done", doneByUserId: w.ownerId, acceptedAt: accepted.acceptedAt });
    expect(typeof done.doneAt).toBe("number");
    expect(await auditRows(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("new -> done in one tap: accepted and finished at the same moment", async () => {
    const { t, w, requestId } = await newCall();
    expect(await apply(t, requestId, "done", staff(w.managerId))).toEqual({ ok: true, status: "done", changed: true });
    const row = await requestRow(t, requestId);
    expect(row.status).toBe("done");
    expect(typeof row.doneAt).toBe("number");
    expect(row.acceptedAt).toBe(row.doneAt);
    expect(row.acceptedByUserId).toBe(w.managerId);
    expect(row.doneByUserId).toBe(w.managerId);
  });

  test("done and cancelled are final: other transitions are request/invalid_transition, repeating the same one is a no-op", async () => {
    const { t, w, table, requestId } = await newCall();
    const owner = staff(w.ownerId);
    await apply(t, requestId, "done", owner);
    expect(await apply(t, requestId, "accept", owner)).toEqual({ ok: false, code: CODE.invalidTransition });
    expect(await apply(t, requestId, "cancel", owner)).toEqual({ ok: false, code: CODE.invalidTransition });
    expect(await apply(t, requestId, "done", owner)).toEqual({ ok: true, status: "done", changed: false });
    expect((await requestRow(t, requestId)).status).toBe("done");

    // A cancelled request: a second, separate one.
    const second = idOf(await callWaiter(t, table.guestToken));
    expect(await apply(t, second, "cancel", owner)).toEqual({ ok: true, status: "cancelled", changed: true });
    expect(await apply(t, second, "accept", owner)).toEqual({ ok: false, code: CODE.invalidTransition });
    expect(await apply(t, second, "done", owner)).toEqual({ ok: false, code: CODE.invalidTransition });
    expect(await apply(t, second, "cancel", owner)).toEqual({ ok: true, status: "cancelled", changed: false });
    expect((await requestRow(t, second)).status).toBe("cancelled");
  });

  test("accepting twice by the same user changes nothing; another user gets request/taken", async () => {
    const { t, w, requestId } = await newCall();
    await apply(t, requestId, "accept", staff(w.ownerId));
    const before = await requestRow(t, requestId);

    expect(await apply(t, requestId, "accept", staff(w.ownerId))).toEqual({ ok: true, status: "accepted", changed: false });
    expect(await apply(t, requestId, "accept", staff(w.managerId))).toEqual({ ok: false, code: CODE.taken });
    expect(await requestRow(t, requestId)).toEqual(before);
  });

  test("a guest cannot accept or finish; staff can cancel an accepted request and it is audited", async () => {
    const { t, w, requestId } = await newCall();
    expect(await apply(t, requestId, "accept", { kind: "guest" })).toEqual({ ok: false, code: CODE.invalidTransition });
    expect(await apply(t, requestId, "done", { kind: "guest" })).toEqual({ ok: false, code: CODE.invalidTransition });
    expect((await requestRow(t, requestId)).status).toBe("new");

    await apply(t, requestId, "accept", staff(w.ownerId));
    expect(await apply(t, requestId, "cancel", staff(w.managerId))).toEqual({ ok: true, status: "cancelled", changed: true });
    const row = await requestRow(t, requestId);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "staff", cancelledByUserId: w.managerId });
    expect(typeof row.cancelledAt).toBe("number");

    const audit = await auditRows(t, w.a.menuServiceId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      actorKind: "user",
      actorUserId: w.managerId,
      action: "request.cancelled",
      entityType: "request",
      entityKey: requestId,
      details: { kind: "call", channel: "standard", from: "accepted", by: "staff" },
    });
  });
});

// =============================================================================
// 12. The guest cancels their own request
// =============================================================================

describe("guest cancellation (cancelRequest)", () => {
  test("an own new request is cancelled by the guest and audited; a new call is possible again", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const requestId = idOf(await callWaiter(t, table.guestToken));

    expect(await cancel(t, table.deviceToken, requestId)).toEqual({ ok: true, status: "cancelled" });
    const row = await requestRow(t, requestId);
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "guest" });
    expect(typeof row.cancelledAt).toBe("number");
    expect(row.cancelledByUserId).toBeUndefined();

    const audit = await auditRows(t, w.a.menuServiceId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "guest",
      action: "request.cancelled",
      entityType: "request",
      entityKey: requestId,
      details: { kind: "call", channel: "standard", from: "new", by: "guest" },
    });
    expect(audit[0].actorUserId).toBeUndefined();

    const again = ok(await callWaiter(t, table.guestToken));
    expect(again.deduped).toBe(false);
    expect(again.requestId).not.toBe(requestId);
  });

  test("cancelling twice is idempotent and audits once", async () => {
    const env = await ready();
    const requestId = idOf(await callWaiter(env.t, env.table.guestToken));
    expect(await cancel(env.t, env.table.deviceToken, requestId)).toEqual({ ok: true, status: "cancelled" });
    expect(await cancel(env.t, env.table.deviceToken, requestId)).toEqual({ ok: true, status: "cancelled" });
    expect(await auditRows(env.t, env.w.a.menuServiceId)).toHaveLength(1);
  });

  test("an own order can be cancelled while new; its lines stay as sent", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const requestId = idOf(await submit(t, table.guestToken, [line(page, "Jelen pivo", { quantity: 2 })], 400));
    const items = await itemsOf(t, requestId);
    expect(await cancel(t, table.deviceToken, requestId)).toEqual({ ok: true, status: "cancelled" });
    expect(await itemsOf(t, requestId)).toEqual(items);
    expect(await auditRows(t, env.w.a.menuServiceId)).toMatchObject([{ details: { kind: "order", by: "guest" } }]);
  });

  test("an accepted or finished request is request/not_cancellable for the guest", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const accepted = idOf(await callWaiter(t, table.guestToken));
    await apply(t, accepted, "accept", staff(w.ownerId));
    expect(await cancel(t, table.deviceToken, accepted)).toEqual({ ok: false, code: CODE.notCancellable });
    expect((await requestRow(t, accepted)).status).toBe("accepted");

    await apply(t, accepted, "done", staff(w.ownerId));
    expect(await cancel(t, table.deviceToken, accepted)).toEqual({ ok: false, code: CODE.notCancellable });
    expect((await requestRow(t, accepted)).status).toBe("done");
    expect(await auditRows(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("another device's request, another venue, a garbage id and a bad device token are all refused without a trace", async () => {
    const env = await ready();
    const { t, table } = env;
    const requestId = idOf(await callWaiter(t, table.guestToken));
    const other = await seat(env, { label: "Sto 13" });

    expect(await cancel(t, other.deviceToken, requestId)).toEqual({ ok: false, code: CODE.notFound });
    expect(await cancel(t, table.deviceToken, requestId, SLUG_B)).toEqual({ ok: false, code: CODE.notFound });
    expect(await cancel(t, table.deviceToken, requestId, "nepoznat-lokal")).toEqual({ ok: false, code: CODE.notFound });
    for (const garbage of ["", "nije-id", "x".repeat(40), table.positionId]) {
      expect(await cancel(t, table.deviceToken, garbage), garbage).toEqual({ ok: false, code: CODE.notFound });
    }
    expect(await cancel(t, "kratak", requestId)).toEqual({ ok: false, code: CODE.noSession });
    // A made-up (well-formed) device token owns nothing.
    expect(await cancel(t, "x".repeat(43), requestId)).toEqual({ ok: false, code: CODE.notFound });

    expect((await requestRow(t, requestId)).status).toBe("new");
    expect(await auditRows(t, env.w.a.menuServiceId)).toHaveLength(0);
  });
});

// =============================================================================
// 13. Moji zahtevi
// =============================================================================

describe("myRequests", () => {
  const LIST_KEYS = [
    "id",
    "kind",
    "status",
    "channel",
    "positionLabel",
    "paymentPreference",
    "subtotalRsd",
    "deliveryFeeRsd",
    "totalRsd",
    "createdAt",
    "acceptedAt",
    "doneAt",
    "cancelledAt",
    "cancelledBy",
    "items",
  ];
  const ITEM_KEYS = ["name", "variantName", "addons", "quantity", "unitPriceRsd", "lineTotalRsd", "note"];

  async function listOf(env: Pick<Env, "t" | "w">, deviceToken: string, slug = SLUG_A) {
    const list = await mine(env.t, env.w.a.menuServiceId, deviceToken, slug);
    if (list === null) throw new Error("myRequests returned null");
    return list;
  }

  async function insertDone(
    env: Pick<Env, "t" | "w">,
    seatOf: Seat,
    session: Doc<"menuGuestSessions">,
    createdAt: number,
    kind: "call" | "order" = "call",
  ) {
    return await env.t.run(
      async (ctx) =>
        await ctx.db.insert("menuRequests", {
          menuServiceId: env.w.a.menuServiceId,
          businessId: env.w.a.businessId,
          kind,
          status: "done",
          channel: "standard",
          positionId: seatOf.positionId,
          positionLabel: "Sto 12",
          positionKind: "table",
          guestSessionId: session._id,
          deviceKeyHash: session.deviceKeyHash,
          createdAt,
          updatedAt: createdAt,
        }),
    );
  }

  test("only this device's requests of this venue, newest first, with their lines mapped and nothing internal", async () => {
    const env = await ready({ prepare: optionsContent });
    const { t, w, page, table } = env;
    const sojino = addonKeyOf(page, "Kapućino", "Sojino");
    const velika = variantKeyOf(page, "Kafa", "Velika");

    const call = idOf(await callWaiter(t, table.guestToken));
    const bill = idOf(await requestBill(t, table.guestToken, "card"));
    const order = idOf(
      await submit(
        t,
        table.guestToken,
        [
          line(page, "Kapućino", { addonKeys: [sojino], quantity: 2, note: "bez šećera" }),
          line(page, "Kafa", { variantKey: velika }),
        ],
        // 2 x 230 + 190
        650,
      ),
    );
    // Distinct, increasing times (requests made in one millisecond would tie).
    const t0 = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(call, { createdAt: t0 + 1000 });
      await ctx.db.patch(bill, { createdAt: t0 + 2000 });
      await ctx.db.patch(order, { createdAt: t0 + 3000 });
    });
    // The waiter took the call: no staff name or id may reach the phone.
    await apply(t, call, "accept", staff(w.ownerId));

    const list = await listOf(env, table.deviceToken);
    expect(list.map((row) => row.id)).toEqual([order, bill, call]);

    expect(list[0]).toEqual({
      id: order,
      kind: "order",
      status: "new",
      channel: "standard",
      positionLabel: "Sto 12",
      paymentPreference: null,
      subtotalRsd: 650,
      deliveryFeeRsd: null,
      totalRsd: 650,
      createdAt: t0 + 3000,
      acceptedAt: null,
      doneAt: null,
      cancelledAt: null,
      cancelledBy: null,
      items: [
        {
          name: "Kapućino",
          variantName: null,
          addons: [{ optionName: "Sojino", priceDeltaRsd: 30 }],
          quantity: 2,
          unitPriceRsd: 200,
          lineTotalRsd: 460,
          note: "bez šećera",
        },
        { name: "Kafa", variantName: "Velika", addons: [], quantity: 1, unitPriceRsd: 190, lineTotalRsd: 190, note: null },
      ],
    });
    expect(list[1]).toMatchObject({ kind: "bill", paymentPreference: "card", items: [] });
    expect(list[2]).toMatchObject({ kind: "call", status: "accepted", items: [] });
    expect(typeof list[2].acceptedAt).toBe("number");

    // The shape is fixed: no internal ids, no device pseudonym, no staff.
    for (const row of list) {
      expect(Object.keys(row).sort()).toEqual([...LIST_KEYS].sort());
      for (const item of row.items) {
        expect(Object.keys(item).sort()).toEqual([...ITEM_KEYS].sort());
        for (const addon of item.addons) expect(Object.keys(addon).sort()).toEqual(["optionName", "priceDeltaRsd"]);
      }
    }
    const session = await sessionRowOf(t, table.guestToken);
    const json = JSON.stringify(list);
    for (const secret of [
      session.deviceKeyHash,
      session._id,
      table.positionId,
      table.cardId,
      w.ownerId,
      table.guestToken,
      table.deviceToken,
    ]) {
      expect(json).not.toContain(secret);
    }
    for (const field of ["deviceKeyHash", "guestSessionId", "positionId", "cardId", "acceptedByUserId", "zoneId"]) {
      expect(json).not.toContain(field);
    }
  });

  test("another device, another venue and bad keys: [] or null, never someone else's list", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const mineId = idOf(await callWaiter(t, table.guestToken));
    const other = await seat(env, { label: "Sto 13" });
    const otherId = idOf(await callWaiter(t, other.guestToken));

    expect((await listOf(env, table.deviceToken)).map((row) => row.id)).toEqual([mineId]);
    expect((await listOf(env, other.deviceToken)).map((row) => row.id)).toEqual([otherId]);

    // A device that never sent anything.
    expect(await mine(t, w.a.menuServiceId, "x".repeat(43))).toEqual([]);
    // This device's key is a different pseudonym in every venue; B has nothing for it.
    expect(await mine(t, w.a.menuServiceId, table.deviceToken, SLUG_B)).toEqual([]);
    expect(await mine(t, w.a.menuServiceId, table.deviceToken, "nepoznat-lokal")).toBeNull();
    for (const deviceKey of ["", "kratak", "A".repeat(64), "g".repeat(64), "a".repeat(63), "a".repeat(65)]) {
      expect(await t.query(api.menuGuest.myRequests, { slug: SLUG_A, deviceKey }), deviceKey).toBeNull();
    }
    expect(await t.query(api.menuGuest.myRequests, { slug: SLUG_A, deviceKey: "a".repeat(64) })).toEqual([]);
  });

  test("at most 20 requests (the newest) and at most 30 lines per order", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const session = await sessionRowOf(t, table.guestToken);
    const start = Date.now();

    const ids: Id<"menuRequests">[] = [];
    for (let i = 0; i < 21; i += 1) ids.push(await insertDone(env, table, session, start + i * 1000));
    // The 22nd is an order with 32 stored lines.
    const orderId = await insertDone(env, table, session, start + 21 * 1000, "order");
    await t.run(async (ctx) => {
      for (let i = 0; i < 32; i += 1) {
        await ctx.db.insert("menuRequestItems", {
          requestId: orderId,
          menuServiceId: w.a.menuServiceId,
          articleKey: `ar_${i}`,
          name: `Artikal ${i}`,
          addons: [],
          unitPriceRsd: 100,
          quantity: 1,
          lineTotalRsd: 100,
          order: i,
        });
      }
    });

    const list = await listOf(env, table.deviceToken);
    expect(list).toHaveLength(20);
    expect(list[0].id).toBe(orderId);
    expect(list.map((row) => row.id)).toEqual([orderId, ...ids.slice(2).reverse()]);
    expect(list[0].items).toHaveLength(30);
    expect(list[0].items.map((item) => item.name)).toEqual(Array.from({ length: 30 }, (_, i) => `Artikal ${i}`));
    expect(list[1].items).toEqual([]);
  });
});

// =============================================================================
// 14. Structural: no payment state, only four statuses
// =============================================================================

describe("the request tables carry no payment or kitchen state", () => {
  test("menuRequests has no paid/payment/kitchen field except paymentPreference; menuRequestItems has none", () => {
    const requestFields = Object.keys(schema.tables.menuRequests.validator.fields);
    const itemFields = Object.keys(schema.tables.menuRequestItems.validator.fields);
    const forbidden = /paid|payment|kitchen/i;

    expect(requestFields).toContain("paymentPreference");
    expect(requestFields.filter((name) => forbidden.test(name))).toEqual(["paymentPreference"]);
    expect(itemFields.filter((name) => forbidden.test(name))).toEqual([]);
  });

  test("the stored status is one of new, accepted, done, cancelled", () => {
    const members = schema.tables.menuRequests.validator.fields.status.members.map((member) => member.value);
    expect([...members].sort()).toEqual(["accepted", "cancelled", "done", "new"]);
    expect([...MENU_REQUEST_STATUSES].sort()).toEqual(["accepted", "cancelled", "done", "new"]);
  });

  test("no transition leaves the four statuses or moves a final request", () => {
    const actions: RequestAction[] = ["accept", "done", "cancel"];
    const actors = [
      { kind: "guest" },
      { kind: "staff", ref: "user:1" },
      { kind: "staff", ref: "staff:2" },
    ] as const;
    for (const status of MENU_REQUEST_STATUSES) {
      for (const acceptedByRef of [null, "user:1"]) {
        for (const action of actions) {
          for (const actor of actors) {
            const result = nextStatus({ status, acceptedByRef }, action, actor);
            if (result.kind !== "change") continue;
            const label = `${status} + ${action} by ${actor.kind}`;
            expect(MENU_REQUEST_STATUSES, label).toContain(result.to);
            expect(status === "new" || status === "accepted", label).toBe(true);
          }
        }
      }
    }
  });

  test("the machine codes of the guest actions are the documented strings", () => {
    expect(REQUEST_ERROR).toEqual({
      invalidInput: "request/invalid_input",
      noSession: "request/no_session",
      actionOff: "request/action_off",
      rateLimited: "request/rate_limited",
      menuUnavailable: "request/menu_unavailable",
      cartUnavailable: "request/cart_unavailable",
      cartStale: "request/cart_stale",
      cartPriceChanged: "request/cart_price_changed",
      notFound: "request/not_found",
      notCancellable: "request/not_cancellable",
      invalidTransition: "request/invalid_transition",
      tooManyOpen: "request/too_many_open",
      requestTaken: "request/taken",
    });
  });
});

// =============================================================================
// 15. Hardening after the security review (K21): idempotent sends, the open
//     order caps, the per-table attempt bucket, only recent requests dedupe, a
//     changed way of paying spends the guest's bucket, Room service images.
// =============================================================================

describe("hardening", () => {
  const submitWithKey = (t: T, guestToken: string, lines: OrderLine[], seenTotalRsd: number, clientRequestId: string) =>
    t.mutation(api.menuGuest.submitOrder, {
      slug: SLUG_A,
      guestToken,
      ipHash: IP,
      channel: "standard",
      lines,
      seenTotalRsd,
      clientRequestId,
    });

  test("the same send key returns the order already written (a lost answer never makes a second order)", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const beer = [line(page, "Jelen pivo", { quantity: 2 })];
    const first = ok(await submitWithKey(t, table.guestToken, beer, 400, "kljuc-slanja-0001"));
    expect(first.deduped).toBe(false);
    const again = ok(await submitWithKey(t, table.guestToken, beer, 400, "kljuc-slanja-0001"));
    expect(again).toMatchObject({ requestId: first.requestId, deduped: true, status: "new" });
    expect(again.totals).toEqual({ subtotalRsd: 400, deliveryFeeRsd: 0, totalRsd: 400 });
    expect(await allRequests(t)).toHaveLength(1);
    expect(await allItems(t)).toHaveLength(1);
    // A new attempt (another key) is a new order.
    expect(ok(await submitWithKey(t, table.guestToken, beer, 400, "kljuc-slanja-0002")).deduped).toBe(false);
    expect(await allRequests(t)).toHaveLength(2);
    // The key belongs to the guest session: another phone with the same key writes its own order.
    const phone2 = await scan(t, table.cardCode);
    expect(ok(await submitWithKey(t, phone2.guestToken, beer, 400, "kljuc-slanja-0001")).deduped).toBe(false);
    expect(await allRequests(t)).toHaveLength(3);
  });

  test("a malformed send key is refused before anything is spent or written", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const beer = [line(page, "Jelen pivo")];
    for (const key of ["", "kratak", "x".repeat(65), "ima razmak u sebi", "ćevapi-ćevapi"]) {
      expect(await submitWithKey(t, table.guestToken, beer, 200, key), key).toEqual({ ok: false, code: CODE.invalidInput });
    }
    expect(await allRequests(t)).toHaveLength(0);
    // Nothing was spent: the table still sends.
    expect(ok(await submitWithKey(t, table.guestToken, beer, 200, "kljuc-slanja-0003")).deduped).toBe(false);
  });

  test("a table with 5 orders still waiting for the waiter sends no more (any phone)", async () => {
    const env = await ready();
    const { t, w, page, table } = env;
    const session = await sessionRowOf(t, table.guestToken);
    await t.run(async (ctx) => {
      const now = Date.now();
      for (let i = 0; i < 5; i += 1) {
        await ctx.db.insert("menuRequests", {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          kind: "order",
          status: "new",
          channel: "standard",
          positionId: table.positionId,
          positionLabel: "Sto 12",
          positionKind: "table",
          guestSessionId: session._id,
          deviceKeyHash: `drugi-uredjaj-${i}`,
          createdAt: now,
          updatedAt: now,
        });
      }
    });
    const phone2 = await scan(t, table.cardCode);
    expect(await submit(t, phone2.guestToken, [line(page, "Jelen pivo")], 200)).toEqual({ ok: false, code: CODE.tooManyOpen });
    // Calls and bills are not orders: the table can still call the waiter.
    expect(ok(await callWaiter(t, phone2.guestToken)).deduped).toBe(false);
    // Once the waiter takes one, the table may order again.
    const waiting = (await allRequests(t)).filter((row) => row.kind === "order");
    expect(await apply(t, waiting[0]._id, "accept", staff(w.ownerId))).toMatchObject({ ok: true });
    expect((await submit(t, phone2.guestToken, [line(page, "Jelen pivo")], 200)).ok).toBe(true);
  });

  test("priced attempts of one table are bounded across fresh sessions (menuOrderAttempt, 30 a minute)", async () => {
    const env = await ready();
    const { t, page, table } = env;
    const gone = [{ ...line(page, "Jelen pivo"), articleKey: "ar_nepostoji000" }];
    const codes: string[] = [];
    for (let phone = 0; phone < 4; phone += 1) {
      const guest = phone === 0 ? table : await scan(t, table.cardCode);
      for (let i = 0; i < 8; i += 1) codes.push(codeOf(await submit(t, guest.guestToken, gone, 200)));
    }
    expect(codes.filter((code) => code === CODE.cartStale)).toHaveLength(30);
    expect(codes.slice(30)).toEqual([CODE.rateLimited, CODE.rateLimited]);
  });

  test("an open call older than 30 minutes no longer swallows a new call", async () => {
    const env = await ready();
    const { t, table } = env;
    const old = idOf(await callWaiter(t, table.guestToken));
    await t.run(async (ctx) => {
      await ctx.db.patch(old, { createdAt: Date.now() - 31 * 60 * 1000 });
    });
    const fresh = ok(await callWaiter(t, table.guestToken));
    expect(fresh.deduped).toBe(false);
    expect(fresh.requestId).not.toBe(old);
    // The new one dedupes from now on.
    expect(ok(await callWaiter(t, table.guestToken))).toMatchObject({ requestId: fresh.requestId, deduped: true });
  });

  test("changing the way of paying an open bill spends the guest's bucket and returns the effective choice", async () => {
    const env = await ready();
    const { t, table } = env;
    expect(ok(await requestBill(t, table.guestToken, "cash")).paymentPreference).toBe("cash");
    const codes: string[] = [];
    const preferences: (string | null)[] = [];
    for (let i = 0; i < 12; i += 1) {
      const outcome = await requestBill(t, table.guestToken, i % 2 === 0 ? "card" : "cash");
      codes.push(codeOf(outcome));
      if (outcome.ok) preferences.push(outcome.paymentPreference);
    }
    // The creation spent one token of 10: nine changes pass, then a change is held; asking again
    // for the way the bill already carries (card after the refused cash) changes nothing and costs nothing.
    expect(codes.slice(0, 9)).toEqual(Array(9).fill("ok"));
    expect(codes.slice(9)).toEqual([CODE.rateLimited, "ok", CODE.rateLimited]);
    expect(preferences[0]).toBe("card");
    const bill = (await allRequests(t)).filter((row) => row.kind === "bill");
    expect(bill).toHaveLength(1);
  });

  test("a phone deduped onto another phone's bill learns the way of paying the bill really carries", async () => {
    const env = await ready();
    const { t, w, table } = env;
    const bill = idOf(await requestBill(t, table.guestToken, "card"));
    await apply(t, bill, "accept", staff(w.ownerId));
    const phone2 = await scan(t, table.cardCode);
    // Accepted: the choice of the second phone is not written, and it is told so.
    expect(ok(await requestBill(t, phone2.guestToken, "cash"))).toMatchObject({
      requestId: null,
      deduped: true,
      status: "accepted",
      paymentPreference: "card",
    });
    expect((await requestRow(t, bill)).paymentPreference).toBe("card");
  });
});

describe("roomServiceMedia", () => {
  type Refs = { avif: Id<"_storage">; webp: Id<"_storage">; thumb: Id<"_storage"> };

  async function refs(t: T, label: string): Promise<Refs> {
    return await t.run(async (ctx) => ({
      avif: await ctx.storage.store(new Blob([`avif-${label}`])),
      webp: await ctx.storage.store(new Blob([`webp-${label}`])),
      thumb: await ctx.storage.store(new Blob([`thumb-${label}`])),
    }));
  }

  async function asset(t: T, businessId: Id<"businesses">, label: string, status: "ready" | "purged" = "ready") {
    const r = await refs(t, label);
    return await t.run(
      async (ctx) =>
        await ctx.db.insert("mediaAssets", {
          businessId,
          kind: "image",
          provider: "convex",
          variants: {
            avif: { ref: r.avif, width: 1200, height: 800, bytes: 4 },
            webp: { ref: r.webp, width: 1200, height: 800, bytes: 4 },
            thumb: { ref: r.thumb, width: 300, height: 200, bytes: 5 },
          },
          status,
          createdAt: Date.now(),
        }),
    );
  }

  /** Room service with Pljeskavica (own image), Pita sa sirom (tenant B's image) and Espreso (an asset that is not ready). */
  async function rsWithImages(options: { publish?: boolean } = {}) {
    const env = await base();
    const { t, w, c } = env;
    const owner = as(t, w.ownerId);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
    const category = await owner.mutation(api.menuRoomService.addCategory, { menuServiceId: w.a.menuServiceId, name: "Hrana u sobu" });
    await owner.mutation(api.menuRoomService.addItems, {
      categoryId: category.categoryId,
      articleIds: [c.burger.articleId, c.pita.articleId, c.coffee.articleId],
    });
    const own = await asset(t, w.a.businessId, "own");
    const foreign = await asset(t, w.b.businessId, "foreign");
    const purged = await asset(t, w.a.businessId, "purged", "purged");
    await t.run(async (ctx) => {
      await ctx.db.patch(c.burger.articleId, { mediaMode: "image", imageMediaId: own });
      await ctx.db.patch(c.pita.articleId, { mediaMode: "image", imageMediaId: foreign });
      await ctx.db.patch(c.coffee.articleId, { mediaMode: "image", imageMediaId: purged });
    });
    await setFeatures(env, ["ordering", "roomService"]);
    if (options.publish !== false) await publishNow(t, w.ownerId, w.a.menuServiceId);
    return { ...env, own, foreign, purged };
  }

  test("only ready images of the venue itself, for the published Room service", async () => {
    const { t, own, foreign, purged } = await rsWithImages();
    const media = await t.query(api.menuGuest.roomServiceMedia, { slug: SLUG_A });
    expect(Object.keys(media)).toEqual([own]);
    expect(media[own]).toMatchObject({ width: 1200, height: 800 });
    expect(media[own].url).toBeTruthy();
    expect(media[own].thumbUrl).toBeTruthy();
    expect(media[foreign]).toBeUndefined();
    expect(media[purged]).toBeUndefined();
  });

  test("empty when nothing is published, when the switch is off and for an unknown venue", async () => {
    const unpublished = await rsWithImages({ publish: false });
    expect(await unpublished.t.query(api.menuGuest.roomServiceMedia, { slug: SLUG_A })).toEqual({});

    const env = await rsWithImages();
    await setFeatures(env, ["roomService"], false);
    expect(await env.t.query(api.menuGuest.roomServiceMedia, { slug: SLUG_A })).toEqual({});
    expect(await env.t.query(api.menuGuest.roomServiceMedia, { slug: "nepostojeci-lokal" })).toEqual({});
    // Another venue's slug never shows tenant A's images.
    expect(await env.t.query(api.menuGuest.roomServiceMedia, { slug: SLUG_B })).toEqual({});
  });
});
