/// <reference types="vite/client" />

// ScanMe Menu V1 — K20: what a Menu QR card opens (master §9.1; plan K19 §3).
// The printed-card resolver keeps the pre-K20 outcome for every card without
// an active Menu link, adds the page for a linked page, and sends a card that
// stands on a table or room through the hop, which opens a server-side guest
// session. The guest never picks a position, the URL never carries one, and
// nothing invents one.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_GUEST_SESSION_MS } from "./menuGuest";
import { newMenuKey } from "../lib/menu/keys";
import { deviceKeyHashFor, isMenuToken, sessionTokenHash } from "../lib/menu/tokens";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
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

const IP = "0123456789abcdef0123456789abcdef";
let requestCounter = 0;

function scan(t: T, cardCode: string) {
  requestCounter += 1;
  return t.mutation(api.cards.resolveAndRecord, {
    cardCode,
    requestId: `k20-${requestCounter}`,
    deviceCategory: "mobile" as const,
    ipHash: IP,
  });
}

function hop(t: T, cardCode: string, deviceToken?: string) {
  return t.mutation(api.menuGuest.mintFromCard, {
    cardCode,
    ipHash: IP,
    ...(deviceToken ? { deviceToken } : {}),
  });
}

async function world(t: T) {
  return await t.run(async (ctx) => await seedMenuWorld(ctx));
}

async function addPosition(
  t: T,
  menuServiceId: Id<"menuServices">,
  label: string,
  input: { kind?: "table" | "room" | "other"; active?: boolean } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: newMenuKey("position"),
      kind: input.kind ?? "table",
      label,
      labelNormalized: label.toLowerCase(),
      order: 0,
      active: input.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function defaultPage(t: T, w: MenuWorldSeed) {
  return await t.run(async (ctx) => {
    const page = await ctx.db.get(w.a.defaultPageId);
    if (!page) throw new Error("page");
    return page;
  });
}

/** A Menu card of tenant A, optionally standing on a position. */
async function menuCard(
  t: T,
  w: MenuWorldSeed,
  input: {
    cardCode: string;
    pageKey?: string;
    positionId?: Id<"menuPositions">;
    linkActive?: boolean;
    cardStatus?: "active" | "disabled";
    targetKind?: "menu" | "url";
    noLink?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey: input.pageKey ?? "unused",
      createdByUserId: w.adminId,
      cardCode: input.cardCode,
      linkActive: input.linkActive,
      cardStatus: input.cardStatus,
      targetKind: input.targetKind,
    });
    if (input.noLink) {
      await ctx.db.delete(seeded.linkId);
    } else {
      await ctx.db.patch(seeded.linkId, {
        pageKey: input.pageKey,
        positionId: input.positionId,
      });
    }
    return seeded;
  });
}

describe("the resolver's menu branch (cards.resolveAndRecord)", () => {
  test("a card with no Menu link resolves EXACTLY as before K20", async () => {
    const t = newTest();
    const w = await world(t);
    await menuCard(t, w, { cardCode: "MNQR0001", noLink: true });
    expect(await scan(t, "MNQR0001")).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });
  });

  test("a linked page adds its slug; an archived page does not", async () => {
    const t = newTest();
    const w = await world(t);
    const page = await defaultPage(t, w);
    await menuCard(t, w, { cardCode: "MNQR0002", pageKey: page.key });
    expect(await scan(t, "MNQR0002")).toStrictEqual({
      kind: "menu",
      businessSlug: SLUG_A,
      pagePath: page.slug,
    });
    await t.run(async (ctx) => ctx.db.patch(page._id, { archivedAt: Date.now() }));
    expect(await scan(t, "MNQR0002")).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });
  });

  test("a card on an active position goes through the hop; archived position → no position", async () => {
    const t = newTest();
    const w = await world(t);
    const page = await defaultPage(t, w);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 12");
    await menuCard(t, w, { cardCode: "MNQR0003", pageKey: page.key, positionId });
    expect(await scan(t, "MNQR0003")).toStrictEqual({
      kind: "menu",
      businessSlug: SLUG_A,
      pagePath: page.slug,
      hop: true,
      cardCode: "MNQR0003",
    });
    await t.run(async (ctx) => ctx.db.patch(positionId, { active: false }));
    expect(await scan(t, "MNQR0003")).toStrictEqual({
      kind: "menu",
      businessSlug: SLUG_A,
      pagePath: page.slug,
    });
  });

  test("an inactive link or a link of another business's service counts as no link", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 1");
    await menuCard(t, w, { cardCode: "MNQR0004", positionId, linkActive: false });
    expect(await scan(t, "MNQR0004")).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });

    const foreignPosition = await addPosition(t, w.b.menuServiceId, "Sto 1");
    const { linkId } = await menuCard(t, w, { cardCode: "MNQR0005", positionId: foreignPosition });
    await t.run(async (ctx) => ctx.db.patch(linkId, { menuServiceId: w.b.menuServiceId }));
    expect(await scan(t, "MNQR0005")).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });
  });

  test("a position of another service on this business's link is ignored", async () => {
    const t = newTest();
    const w = await world(t);
    const foreignPosition = await addPosition(t, w.b.menuServiceId, "Sto 7");
    await menuCard(t, w, { cardCode: "MNQR0006", positionId: foreignPosition });
    expect(await scan(t, "MNQR0006")).toStrictEqual({ kind: "menu", businessSlug: SLUG_A });
  });

  test("one scan row per requestId, also for a position card", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 2");
    const { cardId } = await menuCard(t, w, { cardCode: "MNQR0007", positionId });
    const args = { cardCode: "MNQR0007", requestId: "k20-same", deviceCategory: "mobile" as const, ipHash: IP };
    await t.mutation(api.cards.resolveAndRecord, args);
    await t.mutation(api.cards.resolveAndRecord, args);
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("cardScanEvents")
        .withIndex("by_cardId_and_occurredAt", (q) => q.eq("cardId", cardId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].targetKind).toBe("menu");
  });

  test("a disabled Menu card is invalid, whatever its link", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 3");
    await menuCard(t, w, { cardCode: "MNQR0008", positionId, cardStatus: "disabled" });
    expect(await scan(t, "MNQR0008")).toStrictEqual({ kind: "invalid" });
  });
});

describe("the hop (menuGuest.mintFromCard) and the guest session", () => {
  test("a position card opens a session; the view knows the table, the URL does not", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 12");
    await menuCard(t, w, { cardCode: "HPQR0001", positionId });
    const outcome = await hop(t, "HPQR0001");
    expect(outcome.kind).toBe("menu");
    if (outcome.kind !== "menu" || !outcome.session) throw new Error("expected a session");
    expect(outcome.slug).toBe(SLUG_A);
    expect(outcome.pagePath).toBeNull();
    expect(isMenuToken(outcome.session.guestToken)).toBe(true);
    expect(isMenuToken(outcome.session.deviceToken)).toBe(true);

    const sessions = await t.run(async (ctx) => ctx.db.query("menuGuestSessions").collect());
    expect(sessions).toHaveLength(1);
    // Only hashes are stored.
    expect(sessions[0].tokenHash).toBe(await sessionTokenHash(outcome.session.guestToken));
    expect(sessions[0].deviceKeyHash).toBe(await deviceKeyHashFor(w.a.menuServiceId, outcome.session.deviceToken));
    expect(JSON.stringify(sessions[0])).not.toContain(outcome.session.guestToken);
    expect(sessions[0].positionId).toBe(positionId);
    expect(sessions[0].expiresAt - sessions[0].createdAt).toBe(MENU_GUEST_SESSION_MS);

    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: outcome.session.guestToken })).toEqual({
      position: { label: "Sto 12", kind: "table" },
      // K21: the actions the position offers; none while the venue has no published menu.
      actions: { call: false, bill: false, order: false, roomService: false },
      expiresAt: sessions[0].expiresAt,
      // K29 (intentional): the card of the session, the analytics "QR kartica".
      cardId: sessions[0].cardId ?? null,
    });
    // Another venue's menu never sees this session.
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_B, guestToken: outcome.session.guestToken })).toBeNull();
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: "x".repeat(43) })).toBeNull();
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: "kratak" })).toBeNull();
  });

  test("a card without a position opens its page with no session (nothing invented)", async () => {
    const t = newTest();
    const w = await world(t);
    const page = await defaultPage(t, w);
    await menuCard(t, w, { cardCode: "HPQR0002", pageKey: page.key });
    expect(await hop(t, "HPQR0002")).toEqual({ kind: "menu", slug: SLUG_A, pagePath: page.slug, session: null });
    await menuCard(t, w, { cardCode: "HPQR0003", noLink: true });
    expect(await hop(t, "HPQR0003")).toEqual({ kind: "menu", slug: SLUG_A, pagePath: null, session: null });
    expect(await t.run(async (ctx) => ctx.db.query("menuGuestSessions").collect())).toHaveLength(0);
  });

  test("dead, foreign-target and unknown cards are invalid", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 4");
    await menuCard(t, w, { cardCode: "HPQR0004", positionId, cardStatus: "disabled" });
    await menuCard(t, w, { cardCode: "HPQR0005", positionId, targetKind: "url" });
    expect(await hop(t, "HPQR0004")).toEqual({ kind: "invalid" });
    expect(await hop(t, "HPQR0005")).toEqual({ kind: "invalid" });
    expect(await hop(t, "NEPOSTOJ")).toEqual({ kind: "invalid" });
    expect(await hop(t, "")).toEqual({ kind: "invalid" });
  });

  test("scanning again on the same phone renews the same session with a new token", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 5");
    await menuCard(t, w, { cardCode: "HPQR0006", positionId });
    const first = await hop(t, "HPQR0006");
    if (first.kind !== "menu" || !first.session) throw new Error("session");
    const second = await hop(t, "HPQR0006", first.session.deviceToken);
    if (second.kind !== "menu" || !second.session) throw new Error("session");
    expect(second.session.deviceToken).toBe(first.session.deviceToken);
    expect(second.session.guestToken).not.toBe(first.session.guestToken);
    expect(await t.run(async (ctx) => ctx.db.query("menuGuestSessions").collect())).toHaveLength(1);
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: first.session.guestToken })).toBeNull();
    expect(
      (await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: second.session.guestToken }))?.position.label,
    ).toBe("Sto 5");
  });

  test("the same phone at another table ends the old position at once", async () => {
    const t = newTest();
    const w = await world(t);
    const first = await addPosition(t, w.a.menuServiceId, "Sto 6");
    const second = await addPosition(t, w.a.menuServiceId, "Sto 7");
    await menuCard(t, w, { cardCode: "HPQR0007", positionId: first });
    await menuCard(t, w, { cardCode: "HPQR0008", positionId: second });
    const a = await hop(t, "HPQR0007");
    if (a.kind !== "menu" || !a.session) throw new Error("session");
    const b = await hop(t, "HPQR0008", a.session.deviceToken);
    if (b.kind !== "menu" || !b.session) throw new Error("session");
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: a.session.guestToken })).toBeNull();
    expect(
      (await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: b.session.guestToken }))?.position.label,
    ).toBe("Sto 7");
  });

  test("an archived position ends what the session can show", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Soba 204", { kind: "room" });
    await menuCard(t, w, { cardCode: "HPQR0009", positionId });
    const outcome = await hop(t, "HPQR0009");
    if (outcome.kind !== "menu" || !outcome.session) throw new Error("session");
    expect((await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: outcome.session.guestToken }))?.position).toEqual({
      label: "Soba 204",
      kind: "room",
    });
    await t.run(async (ctx) => ctx.db.patch(positionId, { active: false }));
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: outcome.session.guestToken })).toBeNull();
  });

  test("a burst on one card is throttled per card: the menu still opens, without a position", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 8");
    await menuCard(t, w, { cardCode: "HPQR0010", positionId });
    let withSession = 0;
    let last = null as Awaited<ReturnType<typeof hop>> | null;
    for (let i = 0; i < 31; i += 1) {
      last = await hop(t, "HPQR0010");
      if (last.kind === "menu" && last.session) withSession += 1;
    }
    expect(withSession).toBe(30);
    expect(last).toEqual({ kind: "menu", slug: SLUG_A, pagePath: null, session: null });
  });

  test("expiry is materialized and the sweep deletes day-old sessions", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 9");
    await menuCard(t, w, { cardCode: "HPQR0011", positionId });
    const outcome = await hop(t, "HPQR0011");
    if (outcome.kind !== "menu" || !outcome.session) throw new Error("session");
    const [session] = await t.run(async (ctx) => ctx.db.query("menuGuestSessions").collect());

    // Not yet expired: expireSession is a no-op.
    await t.mutation(internal.menuGuest.expireSession, { sessionId: session._id });
    expect((await t.run(async (ctx) => ctx.db.get(session._id)))?.endedAt).toBeUndefined();

    await t.run(async (ctx) => ctx.db.patch(session._id, { expiresAt: Date.now() - 1000 }));
    await t.mutation(internal.menuGuest.expireSession, { sessionId: session._id });
    expect((await t.run(async (ctx) => ctx.db.get(session._id)))?.endedAt).toBeDefined();
    expect(await t.query(api.menuGuest.sessionView, { slug: SLUG_A, guestToken: outcome.session.guestToken })).toBeNull();

    await t.run(async (ctx) => ctx.db.patch(session._id, { expiresAt: Date.now() - 2 * 24 * 60 * 60 * 1000 }));
    await t.mutation(internal.menuGuest.sweepExpiredSessions, {});
    expect(await t.run(async (ctx) => ctx.db.get(session._id))).toBeNull();
  });
});
