/// <reference types="vite/client" />

// ScanMe Menu V1 - K34 review fixes N4 and N5 in convex/menuAnalytics.ts.
//
// N4: the Standard `pregled` answered the four Premium funnel series (sessions
//     that opened an article, sent a request, an order, a reservation) from the
//     stored daily rows, although the funnel is a Premium answer (`period`,
//     advancedAnalytics). Proven here: with sessions on and every step reached,
//     `pregled` carries a zero series for each metric whose definition is
//     Premium (the keys stay, so the report type is the same), every other
//     number is exactly what `period` shows, and a Premium venue gets the real
//     numbers from `period` (series, `konverzije`, the comparison).
// N5: the public ingest got a second bucket, menuAnalyticsService, per Menu
//     service (600 events a minute, sharded). Proven here: a flood from many
//     addresses is cut at the venue's bucket while another venue still records,
//     the bucket refills, and it is spent AFTER the address bucket.
//
// Time is frozen (fake timers, T0 = Wednesday 2026-10-21 12:00 in Belgrade).
// Fictional tenants only (the repo is public). The helpers are copied from
// convex/menuAnalytics.test.ts and convex/menuAnalyticsRollup.test.ts on
// purpose (a test file is not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { DEFINICIJE, METRIKE, type Korak } from "../lib/menu/analitika/definicije";
import { danUBeogradu, satUBeogradu } from "../lib/menu/analitika/vreme";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { addDays } from "../lib/menu/working-hours";
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
  delete process.env.MENU_GATEWAY_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
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

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

const T0 = Date.UTC(2026, 9, 21, 10, 0, 0); // Wednesday 12:00 in Belgrade (CEST)
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** The device's Belgrade day at T0. */
const DANAS = "2026-10-21";
/** The Belgrade day `back` days before today. */
const dan = (back: number) => addDays(DANAS, -back);

const PAGE = "pg_5k2m9q0x7c1d";
const ARTICLE = "ar_5k2m9q0x7c1d";
const REFUSED = { ok: false, primljeno: 0 } as const;
/** An IP hash: 32 lowercase hex characters. */
const ipOf = (n: number) => n.toString(16).padStart(32, "0");
const times = <V,>(n: number, value: V): V[] => Array.from({ length: n }, () => value);

/** The metrics whose definition is Premium: the funnel steps. */
const FUNNEL = METRIKE.filter((metrika) => DEFINICIJE[metrika].plan === "premium");
const zeros = (length: number) => Array.from({ length }, () => 0);

// -----------------------------------------------------------------------------
// World
// -----------------------------------------------------------------------------

/** A published (publicly served) service: one live version row and the pointer to it. */
async function goLive(t: T, w: MenuWorldSeed, tenant: MenuTenantSeed) {
  await t.run(async (ctx) => {
    const versionId = await ctx.db.insert("menuVersions", {
      menuServiceId: tenant.menuServiceId,
      number: 1,
      publishedAt: Date.now(),
      publishedByUserId: w.adminId,
      actorKind: "admin",
      draftRevision: 0,
      summary: {
        changedPrices: 0,
        newArticles: 0,
        removedArticles: 0,
        structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
      },
      languages: ["sr"],
      pageCount: 1,
      articleCount: 0,
      bytes: 0,
      partCount: 0,
      formatVersion: 1,
      contentHash: "fixture",
    });
    await ctx.db.patch(tenant.menuServiceId, { liveVersionId: versionId, liveVersionNumber: 1 });
  });
}

/** Both venues seeded on a frozen clock, both published. */
async function world() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  await goLive(t, w, w.a);
  await goLive(t, w, w.b);
  return { t, w };
}
type Env = Awaited<ReturnType<typeof world>>;

async function premium(env: Env, tenant: "a" | "b" = "a") {
  await env.t.run(async (ctx) => {
    await grantAccountPremium(ctx, { accountId: tenant === "a" ? env.w.a.accountId : env.w.b.accountId, via: "plan" });
  });
}

const pregled = (who: ReturnType<typeof as>, menuServiceId: Id<"menuServices">, dana: 7 | 30 = 7) =>
  who.query(api.menuAnalytics.pregled, { menuServiceId, danas: DANAS, dana });

const periodOf = (who: ReturnType<typeof as>, menuServiceId: Id<"menuServices">, od: string, doDana: string, poredi = false) =>
  who.query(api.menuAnalytics.period, { menuServiceId, danas: DANAS, od, do: doDana, poredi });

// -----------------------------------------------------------------------------
// Raw events with sessions, the rollup
// -----------------------------------------------------------------------------

type Raw = {
  vrsta: "stranica" | "detalj" | "korak";
  at: number;
  sesija: string;
  stranica?: string;
  artikal?: string;
  korak?: Korak;
};

async function addRaw(t: T, menuServiceId: Id<"menuServices">, events: Raw[]) {
  await t.run(async (ctx) => {
    for (const { at, ...fields } of events) {
      await ctx.db.insert("menuAnalyticsEvents", {
        ...fields,
        menuServiceId,
        occurredAt: at,
        dayKey: danUBeogradu(at),
        sat: satUBeogradu(at),
      });
    }
  });
}

type Steps = { detalj?: boolean; koraci?: Korak[] };

/** One session: the menu open (with the session id), then its steps a few seconds apart. */
function session(id: string, at: number, steps: Steps = {}): Raw[] {
  const events: Raw[] = [{ vrsta: "stranica", at, sesija: id, stranica: PAGE }];
  if (steps.detalj) events.push({ vrsta: "detalj", at: at + 1_000, sesija: id, stranica: PAGE, artikal: ARTICLE });
  (steps.koraci ?? []).forEach((korak, index) => {
    events.push({ vrsta: "korak", at: at + 2_000 + index * 1_000, sesija: id, korak });
  });
  return events;
}

/**
 * Sessions on, every open carries an id (100% coverage, so the session count is reliable). 20 sessions:
 *   today (12)      t00 article + order + reservation, t01 article + order, t02 article + request,
 *                   t03 article, t04..t11 nothing
 *   yesterday (8)   y00 article + request + reservation, y01 article + request, y02 article, y03..y07 nothing
 * An order is also a request, so over the two days: 7 sessions with an article, 5 with a request, 2 with an
 * order, 2 with a reservation. Returns the number of events written.
 */
async function seedFunnel(t: T, menuServiceId: Id<"menuServices">): Promise<number> {
  const today = T0 - 60 * MINUTE;
  const yesterday = T0 - DAY - 60 * MINUTE;
  const plan: [string, number, Steps][] = [
    ["t-00", today, { detalj: true, koraci: ["porudzbina", "rezervacija"] }],
    ["t-01", today, { detalj: true, koraci: ["porudzbina"] }],
    ["t-02", today, { detalj: true, koraci: ["zahtev"] }],
    ["t-03", today, { detalj: true }],
    ...Array.from({ length: 8 }, (_, n): [string, number, Steps] => [`t-${String(n + 4).padStart(2, "0")}`, today, {}]),
    ["y-00", yesterday, { detalj: true, koraci: ["zahtev", "rezervacija"] }],
    ["y-01", yesterday, { detalj: true, koraci: ["zahtev"] }],
    ["y-02", yesterday, { detalj: true }],
    ...Array.from({ length: 5 }, (_, n): [string, number, Steps] => [`y-${String(n + 3).padStart(2, "0")}`, yesterday, {}]),
  ];
  const events = plan.flatMap(([id, base, steps], index) => session(id, base + index * 10_000, steps));
  await addRaw(t, menuServiceId, events);
  return events.length;
}

/** Moves the clock past the two-minute guard and runs the events rollup once. */
async function rollup(t: T) {
  vi.setSystemTime(Date.now() + 3 * MINUTE);
  return await t.mutation(internal.menuAnalyticsRollup.zbir, {});
}

async function totalsOf(t: T, menuServiceId: Id<"menuServices">, dayKey: string): Promise<Record<string, number>> {
  const row = await t.run(async (ctx) =>
    ctx.db
      .query("menuAnalyticsDaily")
      .withIndex("by_menuServiceId_and_dayKey", (q) => q.eq("menuServiceId", menuServiceId).eq("dayKey", dayKey))
      .unique(),
  );
  return row?.brojevi ?? {};
}

// =============================================================================
// N4 - the Premium funnel series stay out of the Standard `pregled`
// =============================================================================

describe("N4: pregled does not carry the Premium funnel", () => {
  test("[N4] the funnel metrics are exactly the four session steps of the definitions", () => {
    expect(FUNNEL).toEqual(["sesijeSaDetaljem", "sesijeSaZahtevom", "sesijeSaPorudzbinom", "sesijeSaRezervacijom"]);
  });

  test("[N4] Standard: with sessions on and every step reached, pregled answers a zero series for each funnel metric; the Standard numbers and every key are untouched", async () => {
    const { t, w } = await world();
    const service = w.a.menuServiceId;
    const written = await seedFunnel(t, service);
    expect(await rollup(t)).toEqual({ obradjeno: written, jos: false });

    // The numbers ARE stored; only the report must not show them to Standard.
    expect(await totalsOf(t, service, DANAS)).toMatchObject({
      sesije: 12,
      sesijeSaDetaljem: 4,
      sesijeSaZahtevom: 3,
      sesijeSaPorudzbinom: 2,
      sesijeSaRezervacijom: 1,
    });
    expect(await totalsOf(t, service, dan(1))).toMatchObject({
      sesije: 8,
      sesijeSaDetaljem: 3,
      sesijeSaZahtevom: 2,
      sesijeSaRezervacijom: 1,
    });

    const owner = as(t, w.ownerId);
    for (const dana of [7, 30] as const) {
      const report = must(await pregled(owner, service, dana), `pregled ${dana}`);
      for (const metrika of FUNNEL) {
        expect(report.metrike[metrika], `${dana} days, ${metrika}`).toEqual({ ukupno: 0, poDanu: zeros(dana) });
      }
      // The key set of the report is unchanged: every metric is there.
      expect(Object.keys(report.metrike).sort()).toEqual([...METRIKE].sort());
      // Standard session numbers and the coverage they depend on are real.
      expect(report.metrike.otvaranja.ukupno).toBe(20);
      expect(report.metrike.otvaranjaSaSesijom.ukupno).toBe(20);
      expect(report.metrike.sesije.ukupno).toBe(20);
      expect(report.metrike.detalji.ukupno).toBe(7);
      expect(report.sesije).toEqual({ broj: 20, pokrivenost: 1 });
      expect(report.konverzije).toBeNull();
    }
    const week = must(await pregled(owner, service, 7));
    expect(week.metrike.sesije.poDanu).toEqual([0, 0, 0, 0, 0, 8, 12]);
    expect(week.dani).toHaveLength(7);
  });

  test("[N4] Premium: period carries the real funnel (series, konverzije, comparison) and every other metric equals the Standard report; pregled still carries no funnel; a Standard venue with the same data gets zeros", async () => {
    const env = await world();
    const { t, w } = env;
    const a = w.a.menuServiceId;
    const b = w.b.menuServiceId;
    await seedFunnel(t, a);
    await seedFunnel(t, b);
    // Three sessions that opened an article in the previous period (7 days right before the week).
    const before = T0 - 10 * DAY - 60 * MINUTE;
    await addRaw(
      t,
      a,
      [0, 1, 2].flatMap((n) => session(`p-${n}`, before + n * 10_000, { detalj: true })),
    );
    await rollup(t);

    const ownerA = as(t, w.ownerId);
    const ownerB = as(t, w.otherOwnerId);
    const standard = must(await pregled(ownerA, a, 7), "standard pregled of a");
    for (const metrika of FUNNEL) expect(standard.metrike[metrika].ukupno, metrika).toBe(0);

    await premium(env, "a");
    const week = must(await periodOf(ownerA, a, dan(6), DANAS, true), "period of a");
    expect(week.metrike.sesijeSaDetaljem).toEqual({ ukupno: 7, poDanu: [0, 0, 0, 0, 0, 3, 4] });
    expect(week.metrike.sesijeSaZahtevom).toEqual({ ukupno: 5, poDanu: [0, 0, 0, 0, 0, 2, 3] });
    expect(week.metrike.sesijeSaPorudzbinom).toEqual({ ukupno: 2, poDanu: [0, 0, 0, 0, 0, 0, 2] });
    expect(week.metrike.sesijeSaRezervacijom).toEqual({ ukupno: 2, poDanu: [0, 0, 0, 0, 0, 1, 1] });
    expect(week.konverzije).toEqual({
      sesije: 20,
      saDetaljem: 7,
      saZahtevom: 5,
      saPorudzbinom: 2,
      saRezervacijom: 2,
      udeo: { detalj: 35, zahtev: 25, porudzbina: 10, rezervacija: 10 },
    });
    // The comparison covers the funnel metrics too: 3 sessions with an article before, 7 now.
    expect(week.prethodni?.ukupno.sesijeSaDetaljem).toBe(3);
    expect(week.prethodni?.poredjenje.sesijeSaDetaljem).toEqual({ razlika: 4, procenat: null });
    expect(week.prethodni?.poredjenje.sesijeSaZahtevom).toEqual({ razlika: 5, procenat: null });

    // Nothing but the four funnel series differs between the Standard and the Premium report of the same days.
    for (const metrika of METRIKE) {
      if (FUNNEL.includes(metrika)) continue;
      expect(week.metrike[metrika], metrika).toEqual(standard.metrike[metrika]);
    }

    // pregled never carries the funnel, whoever asks (like konverzije): the panel reads Premium numbers from period.
    const premiumPregled = must(await pregled(ownerA, a, 7), "pregled of the Premium venue");
    for (const metrika of FUNNEL) expect(premiumPregled.metrike[metrika], metrika).toEqual({ ukupno: 0, poDanu: zeros(7) });
    expect(premiumPregled.konverzije).toBeNull();
    expect(premiumPregled.metrike.sesije).toEqual(week.metrike.sesije);

    // Premium is an account fact: venue b has the same stored numbers and is still Standard.
    const standardB = must(await pregled(ownerB, b, 7), "pregled of b");
    for (const metrika of FUNNEL) expect(standardB.metrike[metrika], metrika).toEqual({ ukupno: 0, poDanu: zeros(7) });
    expect(standardB.metrike.sesije.ukupno).toBe(20);
    await expect(periodOf(ownerB, b, dan(6), DANAS)).rejects.toThrow(MENU_PLAN_ERROR.premiumRequired);
  });
});

// =============================================================================
// N5 - a bucket per Menu service on the public ingest
// =============================================================================

describe("N5: menuAnalyticsService on the ingest", () => {
  const openPage = { vrsta: "stranica", stranica: PAGE };

  async function ingest(
    t: T,
    dogadjaji: { vrsta: string; stranica?: string }[],
    over: { slug?: string; ipHash?: string } = {},
  ) {
    return await t.mutation(api.menuAnalytics.ingest, {
      slug: over.slug ?? SLUG_A,
      ipHash: over.ipHash ?? ipOf(1),
      uredjaj: "telefon",
      dogadjaji,
    });
  }

  const storedFor = (t: T, menuServiceId: Id<"menuServices">) =>
    t.run(async (ctx) => {
      const rows = await ctx.db.query("menuAnalyticsEvents").collect();
      return rows.filter((row) => row.menuServiceId === menuServiceId);
    });

  test("[N5] a flood from many addresses is cut at the venue's bucket (600 events); another venue still records; a minute later the venue records again", async () => {
    const { t, w } = await world();
    const a = w.a.menuServiceId;
    const ten = times(10, openPage);

    // 110 calls of ten events, every call from a NEW address: the per-IP bucket (300 a minute) never decides.
    let accepted = 0;
    let refusedCalls = 0;
    for (let call = 0; call < 110; call += 1) {
      const result = await ingest(t, ten, { ipHash: ipOf(call) });
      if (result.ok) accepted += result.primljeno;
      else {
        expect(result).toEqual(REFUSED);
        refusedCalls += 1;
      }
    }
    // The bucket holds 600 tokens and the clock is frozen, so it can never take more. A sharded bucket is
    // approximate only in the last few tokens (the lower bound leaves room for that), so nearly all of the
    // 600 must have been used.
    expect(accepted).toBeLessThanOrEqual(600);
    expect(accepted).toBeGreaterThanOrEqual(560);
    expect(refusedCalls).toBe(110 - accepted / 10);
    expect(refusedCalls).toBeGreaterThanOrEqual(50);
    expect(await storedFor(t, a)).toHaveLength(accepted);

    // The other venue has its own bucket (its own key).
    expect(await ingest(t, [openPage], { slug: SLUG_B, ipHash: ipOf(900) })).toEqual({ ok: true, primljeno: 1 });
    expect(await storedFor(t, w.b.menuServiceId)).toHaveLength(1);

    // A minute refills the venue's bucket: it takes events again.
    vi.setSystemTime(Date.now() + MINUTE);
    expect(await ingest(t, ten, { ipHash: ipOf(901) })).toEqual({ ok: true, primljeno: 10 });
    expect(await storedFor(t, a)).toHaveLength(accepted + 10);
  });

  test("[N5] the venue's bucket is spent after the address bucket: calls the address bucket refuses cost the venue nothing", async () => {
    const { t, w } = await world();
    const ten = times(10, openPage);

    // One address uses its whole bucket (300 events) - and 300 tokens of the venue's.
    for (let call = 0; call < 30; call += 1) {
      expect(await ingest(t, ten, { ipHash: ipOf(1) })).toEqual({ ok: true, primljeno: 10 });
    }
    // 25 more calls from it are refused by ITS bucket.
    for (let call = 0; call < 25; call += 1) expect(await ingest(t, ten, { ipHash: ipOf(1) })).toEqual(REFUSED);
    // Had those spent the venue's tokens, only 50 of 600 would be left. With 300 left, 15 calls from other
    // addresses all fit.
    for (let call = 0; call < 15; call += 1) {
      expect(await ingest(t, ten, { ipHash: ipOf(100 + call) })).toEqual({ ok: true, primljeno: 10 });
    }
    expect(await storedFor(t, w.a.menuServiceId)).toHaveLength(450);
  });
});
