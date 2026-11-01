/// <reference types="vite/client" />

// ScanMe Menu V1 — K34 review fixes for the guest QR hop, the Convex side.
//   C4  mintFromCard says WHICH "no session" it is: `throttled: true` only when the card HAS a
//       position and its per-card bucket was empty (the handler then drops the guest's cookie of
//       the previous table); a card without a position answers as before.
//   C9  `withoutSession` (sent by the handler when it has no secret to sign cookies with): the
//       destination only — no session row, no scheduled expiry, no per-card bucket spent.
//   C6  menuIpKey logs ONE warning per runtime instance when a valid-looking IP hash arrives
//       without the right gateway secret (every legitimate call would share one bucket).
//
// Time is frozen (fake timers): the buckets refill with the clock, so a loop of 31 hops must not
// earn a token back. Fictional tenants only (the repo is public). The helpers are copied per
// file on purpose (a test file is not a module to import from). Card codes avoid I, L, O, U.

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { newMenuKey } from "../lib/menu/keys";
import { SLUG_A, TEST_ADMIN_EMAIL, seedMenuWorld, seedQrLink, type MenuWorldSeed } from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

/** Wednesday 10:00 in Belgrade (CEST). */
const T0 = Date.UTC(2026, 9, 21, 8, 0, 0);
const IP = "0123456789abcdef0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  delete process.env.MENU_GATEWAY_SECRET;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;

const world = (t: T) => t.run(async (ctx) => await seedMenuWorld(ctx));

function hop(t: T, cardCode: string, extra: { withoutSession?: boolean } = {}) {
  return t.mutation(api.menuGuest.mintFromCard, { cardCode, ipHash: IP, ...extra });
}

async function addPosition(t: T, menuServiceId: Id<"menuServices">, label: string) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: newMenuKey("position"),
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** A Menu card of tenant A, optionally standing on a position and/or linked to a page. */
async function menuCard(
  t: T,
  w: MenuWorldSeed,
  input: { cardCode: string; pageKey?: string; positionId?: Id<"menuPositions">; cardStatus?: "active" | "disabled" },
) {
  return await t.run(async (ctx) => {
    const seeded = await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey: input.pageKey ?? "unused",
      createdByUserId: w.adminId,
      cardCode: input.cardCode,
      cardStatus: input.cardStatus,
    });
    await ctx.db.patch(seeded.linkId, { pageKey: input.pageKey, positionId: input.positionId });
    return seeded;
  });
}

async function defaultPage(t: T, w: MenuWorldSeed) {
  return await t.run(async (ctx) => {
    const page = await ctx.db.get(w.a.defaultPageId);
    if (!page) throw new Error("page");
    return page;
  });
}

const sessionCount = (t: T) => t.run(async (ctx) => (await ctx.db.query("menuGuestSessions").collect()).length);
const scheduledCount = (t: T) => t.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).length);

// =============================================================================
// C4: which "no session" is it
// =============================================================================

describe("C4: mintFromCard marks the outcome whose per-card bucket was empty", () => {
  test("30 hops open a session without the field; the 31st (bucket empty) is throttled: true, and stays so", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 6");
    await menuCard(t, w, { cardCode: "KQ340001", positionId });

    for (let i = 0; i < 30; i += 1) {
      const outcome = await hop(t, "KQ340001");
      if (outcome.kind !== "menu" || !outcome.session) throw new Error(`hop ${i + 1} opened no session`);
      expect(outcome).not.toHaveProperty("throttled");
    }
    const expected = { kind: "menu", slug: SLUG_A, pagePath: null, session: null, throttled: true };
    expect(await hop(t, "KQ340001")).toEqual(expected);
    expect(await hop(t, "KQ340001")).toEqual(expected);
  });

  test("a card without a position is never throttled: a page card, and a card whose link has neither page nor position", async () => {
    const t = newTest();
    const w = await world(t);
    const page = await defaultPage(t, w);
    await menuCard(t, w, { cardCode: "KQ340002", pageKey: page.key });
    await menuCard(t, w, { cardCode: "KQ340003" });

    for (let i = 0; i < 40; i += 1) {
      const onPage = await hop(t, "KQ340002");
      expect(onPage).toEqual({ kind: "menu", slug: SLUG_A, pagePath: page.slug, session: null });
      expect(onPage).not.toHaveProperty("throttled");
    }
    const entry = await hop(t, "KQ340003");
    expect(entry.kind).toBe("menu");
    expect(entry).not.toHaveProperty("throttled");
    expect(await sessionCount(t)).toBe(0);
  });

  test("the bucket is the card's: another card of the venue still opens its session, unmarked", async () => {
    const t = newTest();
    const w = await world(t);
    const first = await addPosition(t, w.a.menuServiceId, "Sto 5");
    const second = await addPosition(t, w.a.menuServiceId, "Sto 6");
    await menuCard(t, w, { cardCode: "KQ340004", positionId: first });
    await menuCard(t, w, { cardCode: "KQ340005", positionId: second });

    for (let i = 0; i < 31; i += 1) await hop(t, "KQ340004");
    expect(await hop(t, "KQ340004")).toMatchObject({ kind: "menu", session: null, throttled: true });

    const other = await hop(t, "KQ340005");
    if (other.kind !== "menu" || !other.session) throw new Error("the other card opened no session");
    expect(other).not.toHaveProperty("throttled");
  });

  test("the other refusals are unchanged and carry no such field", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 7");
    await menuCard(t, w, { cardCode: "KQ340006", positionId, cardStatus: "disabled" });
    expect(await hop(t, "KQ340006")).toEqual({ kind: "invalid" });
    expect(await hop(t, "NEPOSTOJ")).toEqual({ kind: "invalid" });
  });
});

// =============================================================================
// C9: no secret, no session
// =============================================================================

describe("C9: withoutSession answers where the menu is and opens nothing", () => {
  test("a position card: the same destination as a normal hop, no session row, nothing scheduled", async () => {
    const t = newTest();
    const w = await world(t);
    const page = await defaultPage(t, w);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 8");
    await menuCard(t, w, { cardCode: "KQ340007", pageKey: page.key, positionId });

    const scheduledBefore = await scheduledCount(t);
    const outcome = await hop(t, "KQ340007", { withoutSession: true });
    expect(outcome).toEqual({ kind: "menu", slug: SLUG_A, pagePath: page.slug, session: null });
    expect(outcome).not.toHaveProperty("throttled");
    expect(await sessionCount(t)).toBe(0);
    expect(await scheduledCount(t)).toBe(scheduledBefore);

    // The normal hop of the same card lands on the same page (and does write a session).
    const normal = await hop(t, "KQ340007");
    if (normal.kind !== "menu" || !normal.session) throw new Error("expected a session");
    expect(normal.slug).toBe(SLUG_A);
    expect(normal.pagePath).toBe(page.slug);
    expect(await sessionCount(t)).toBe(1);
    // ...and schedules its expiry, which shows the count above can see a scheduled job.
    expect(await scheduledCount(t)).toBe(scheduledBefore + 1);
  });

  test("it spends no per-card bucket: the card still opens its 30 sessions afterwards", async () => {
    const t = newTest();
    const w = await world(t);
    const positionId = await addPosition(t, w.a.menuServiceId, "Sto 9");
    await menuCard(t, w, { cardCode: "KQ340008", positionId });

    for (let i = 0; i < 40; i += 1) expect(await hop(t, "KQ340008", { withoutSession: true })).toMatchObject({ session: null });
    expect(await sessionCount(t)).toBe(0);
    for (let i = 0; i < 30; i += 1) {
      const outcome = await hop(t, "KQ340008");
      if (outcome.kind !== "menu" || !outcome.session) throw new Error(`hop ${i + 1} opened no session`);
    }
    expect(await hop(t, "KQ340008")).toMatchObject({ session: null, throttled: true });
  });

  test("a card without a position and a dead card answer as they always did", async () => {
    const t = newTest();
    const w = await world(t);
    const page = await defaultPage(t, w);
    await menuCard(t, w, { cardCode: "KQ340009", pageKey: page.key });
    await menuCard(t, w, { cardCode: "KQ34000A", cardStatus: "disabled" });
    expect(await hop(t, "KQ340009", { withoutSession: true })).toEqual({ kind: "menu", slug: SLUG_A, pagePath: page.slug, session: null });
    expect(await hop(t, "KQ34000A", { withoutSession: true })).toEqual({ kind: "invalid" });
    expect(await hop(t, "NEPOSTOJ", { withoutSession: true })).toEqual({ kind: "invalid" });
  });
});

// =============================================================================
// C6: the gateway mismatch is logged once
// =============================================================================

describe("C6: menuIpKey logs one warning when a valid-looking IP hash comes without the right secret", () => {
  const SECRET = "k34-gateway-secret-0123456789abcdef0123";
  const SAME_LENGTH_WRONG = "k34-gateway-secret-0123456789abcdef9999";
  const HASH = "fedcba9876543210fedcba9876543210";

  /** The module afresh, so its once-per-runtime flag starts unset (each test is one "runtime instance"). */
  async function freshGateway() {
    vi.resetModules();
    return await import("./lib/menuGateway");
  }

  test("with the secret set, a missing or wrong secret warns once, naming the condition only", async () => {
    process.env.MENU_GATEWAY_SECRET = SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { menuIpKey, MENU_SHARED_IP_KEY } = await freshGateway();

    expect(menuIpKey(HASH, undefined)).toBe(MENU_SHARED_IP_KEY);
    expect(warn).toHaveBeenCalledOnce();
    // Further calls, missing or wrong, are the same condition: the log stays at one line.
    expect(menuIpKey(HASH, undefined)).toBe(MENU_SHARED_IP_KEY);
    expect(menuIpKey(HASH, `${SECRET}x`)).toBe(MENU_SHARED_IP_KEY);
    expect(menuIpKey(HASH, SAME_LENGTH_WRONG)).toBe(MENU_SHARED_IP_KEY);
    expect(warn).toHaveBeenCalledOnce();

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("MENU_GATEWAY_MISMATCH");
    for (const secret of [SECRET, SAME_LENGTH_WRONG, HASH]) expect(logged).not.toContain(secret);
  });

  test("a wrong secret alone is enough to warn", async () => {
    process.env.MENU_GATEWAY_SECRET = SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { menuIpKey, MENU_SHARED_IP_KEY } = await freshGateway();
    expect(menuIpKey(HASH, SAME_LENGTH_WRONG)).toBe(MENU_SHARED_IP_KEY);
    expect(warn).toHaveBeenCalledOnce();
  });

  test("the right secret never warns, and neither does a call that has no valid-looking hash anyway", async () => {
    process.env.MENU_GATEWAY_SECRET = SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { menuIpKey, MENU_SHARED_IP_KEY } = await freshGateway();

    expect(menuIpKey(HASH, SECRET)).toBe(HASH);
    for (const hash of [undefined, "", "not-hex", "ab"]) expect(menuIpKey(hash, undefined)).toBe(MENU_SHARED_IP_KEY);
    expect(warn).not.toHaveBeenCalled();
  });

  test("a deployment without a usable secret never warns: the hash is trusted as before", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { menuIpKey } = await freshGateway();
    expect(menuIpKey(HASH, undefined)).toBe(HASH);
    expect(menuIpKey(HASH, "anything")).toBe(HASH);

    process.env.MENU_GATEWAY_SECRET = "too-short";
    expect(menuIpKey(HASH, undefined)).toBe(HASH);
    expect(warn).not.toHaveBeenCalled();
  });

  test("the flag belongs to the runtime instance: a new one warns again", async () => {
    process.env.MENU_GATEWAY_SECRET = SECRET;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const first = await freshGateway();
    first.menuIpKey(HASH, undefined);
    first.menuIpKey(HASH, undefined);
    expect(warn).toHaveBeenCalledTimes(1);
    const second = await freshGateway();
    second.menuIpKey(HASH, undefined);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
