/// <reference types="vite/client" />

// ScanMe Menu V1 — K33 (security review B3): the gateway secret on the public
// guest, reservation and analytics functions. Their Next handlers send a salted
// hash of the caller IP (`ipHash`) as a rate-limit key; a direct caller could
// make up a new hash per call and slip past every per-IP bucket. With
// MENU_GATEWAY_SECRET set on the deployment an `ipHash` counts only together
// with that secret (`gateway`), everything else shares ONE bucket
// (convex/lib/menuGateway.ts); without the secret nothing changes.
//
// Proven here, for every public function that spends a per-IP bucket: (a)
// without the secret each hash has its own bucket (the behavior before K33);
// (b) with the secret, calls that make up a hash (no secret, or a wrong one)
// all land in one shared bucket and are refused after its limit, while a call
// with the right secret and a new hash is still served. The last block covers
// the audit gap of the analytics ingest: an event never writes into a venue
// other than the one its slug names.
//
// Time is frozen (fake timers, T0): the buckets refill with the clock, so a
// loop of 300 calls must not earn tokens back. Fictional tenants only (the
// repo is public). The helpers are copied per file on purpose (a test file is
// not a module to import from).

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { belgradeLocalToEpoch } from "../lib/belgrade-time";
import { RESERVATION_ERROR } from "../lib/menu/errors/reservations";
import { REQUEST_ERROR } from "../lib/menu/errors/requests";
import { newMenuKey } from "../lib/menu/keys";
import { newMenuToken } from "../lib/menu/tokens";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  seedQrLink,
  type MenuTenantSeed,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

afterEach(() => {
  delete process.env.MENU_GATEWAY_SECRET;
  vi.useRealTimers();
});

const newTest = () => {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;

/** Wednesday 10:00 in Belgrade (CEST). */
const T0 = Date.UTC(2026, 9, 21, 8, 0, 0);
/** The deployment's secret in the tests that set it (the minimum is 32 characters). */
const SECRET = "k33-gateway-secret-0123456789abcdef0123";
const WRONG_SECRET = "k33-not-the-secret-0123456789abcdef012";
/** An IP hash: 32 lowercase hex characters. */
const ipOf = (n: number) => n.toString(16).padStart(32, "0");

const PAGE = "pg_5k2m9q0x7c1d";
const ARTICLE = "ar_5k2m9q0x7c1d";

async function freshWorld() {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

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

// -----------------------------------------------------------------------------
// The functions under test. A probe makes one call with the given IP hash (and
// the gateway argument when given) and says whether the PER-IP BUCKET refused it.
// -----------------------------------------------------------------------------

type Probe = (ipHash: string, gateway?: string) => Promise<boolean>;
type Target = {
  name: string;
  /** How many calls the per-IP bucket takes before it refuses the next one. */
  calls: number;
  make: () => Promise<Probe>;
};

const withGateway = (gateway: string | undefined) => (gateway ? { gateway } : {});

/** A Menu card of tenant A standing on a table, and the guest session its scan opens. */
async function tableGuest(t: T, w: MenuWorldSeed) {
  const cardCode = "GW000001";
  await t.run(async (ctx) => {
    const now = Date.now();
    const positionId = await ctx.db.insert("menuPositions", {
      menuServiceId: w.a.menuServiceId,
      key: newMenuKey("position"),
      kind: "table",
      label: "Sto 12",
      labelNormalized: "sto 12",
      order: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const seeded = await seedQrLink(ctx, {
      menuServiceId: w.a.menuServiceId,
      businessId: w.a.businessId,
      pageKey: "unused",
      createdByUserId: w.adminId,
      cardCode,
    });
    await ctx.db.patch(seeded.linkId, { pageKey: undefined, positionId });
  });
  const hop = await t.mutation(api.menuGuest.mintFromCard, { cardCode, ipHash: ipOf(0) });
  if (hop.kind !== "menu" || !hop.session) throw new Error(`expected a session, got ${JSON.stringify(hop)}`);
  return hop.session;
}

// Reservations: the same helpers as convex/menuReservations.test.ts.
const THU_19 = belgradeLocalToEpoch("2026-10-22T19:00");
const DAILY = [{ start: 12 * 60, end: 23 * 60 }];
const WEEK = { days: [DAILY, DAILY, DAILY, DAILY, DAILY, DAILY, DAILY] };

type SubmitArgs = FunctionArgs<typeof api.menuReservations.submit>;
let seq = 0;

/** A complete, valid request of a fresh device, so only the IP bucket can refuse it. */
function submitArgs(ipHash: string, gateway: string | undefined): SubmitArgs {
  seq += 1;
  if (THU_19 === null) throw new Error("no Belgrade time");
  return {
    slug: SLUG_A,
    deviceToken: newMenuToken(),
    clientRequestId: `req-${String(seq).padStart(8, "0")}`,
    cancelToken: newMenuToken(),
    guestName: "Marija Gost",
    partySize: 4,
    requestedAt: THU_19,
    contactEmail: "gost@example.com",
    contactPhone: "+381 60 000 0000",
    ipHash,
    ...withGateway(gateway),
  };
}

const openPage = { vrsta: "stranica", stranica: PAGE };

const targets: Target[] = [
  {
    name: "menuGuest.mintFromCard",
    calls: 300,
    make: async () => {
      const { t } = await freshWorld();
      return async (ipHash, gateway) => {
        // An unknown card: the bucket is spent first, whatever the card is.
        const outcome = await t.mutation(api.menuGuest.mintFromCard, {
          cardCode: "GWZZZZ99",
          ipHash,
          ...withGateway(gateway),
        });
        return outcome.kind === "rate_limited";
      };
    },
  },
  {
    name: "menuGuest.callWaiter",
    calls: 300,
    make: async () => {
      const { t, w } = await freshWorld();
      const { guestToken } = await tableGuest(t, w);
      return async (ipHash, gateway) => {
        // Past the bucket the unpublished menu answers menu_unavailable.
        const outcome = await t.mutation(api.menuGuest.callWaiter, {
          slug: SLUG_A,
          guestToken,
          ipHash,
          ...withGateway(gateway),
        });
        return !outcome.ok && outcome.code === REQUEST_ERROR.rateLimited;
      };
    },
  },
  {
    name: "menuGuest.cancelRequest",
    calls: 300,
    make: async () => {
      const { t } = await freshWorld();
      return async (ipHash, gateway) => {
        const outcome = await t.mutation(api.menuGuest.cancelRequest, {
          slug: SLUG_A,
          deviceToken: newMenuToken(),
          requestId: "none",
          ipHash,
          ...withGateway(gateway),
        });
        return !outcome.ok && outcome.code === REQUEST_ERROR.rateLimited;
      };
    },
  },
  {
    name: "menuReservations.submit",
    calls: 5,
    make: async () => {
      const { t, w } = await freshWorld();
      const owner = t.withIdentity({ subject: w.ownerId, issuer: TEST_ISSUER });
      await owner.mutation(api.menuSettings.setWorkingHours, { menuServiceId: w.a.menuServiceId, workingHours: WEEK });
      const set = await owner.mutation(api.menuServices.setReservations, {
        menuServiceId: w.a.menuServiceId,
        mode: "form",
        contact: "both",
      });
      if (!set.ok) throw new Error(`setReservations refused: ${JSON.stringify(set)}`);
      return async (ipHash, gateway) => {
        const result = await t.mutation(api.menuReservations.submit, submitArgs(ipHash, gateway));
        return !result.ok && result.code === RESERVATION_ERROR.rateLimited;
      };
    },
  },
  {
    name: "menuReservations.cancelByToken",
    calls: 10,
    make: async () => {
      const { t } = await freshWorld();
      return async (ipHash, gateway) => {
        const result = await t.mutation(api.menuReservations.cancelByToken, {
          slug: SLUG_A,
          token: newMenuToken(),
          ipHash,
          ...withGateway(gateway),
        });
        return !result.ok && result.code === RESERVATION_ERROR.rateLimited;
      };
    },
  },
  {
    name: "menuReservations.cancelByDevice",
    calls: 10,
    make: async () => {
      const { t } = await freshWorld();
      return async (ipHash, gateway) => {
        const result = await t.mutation(api.menuReservations.cancelByDevice, {
          slug: SLUG_A,
          deviceToken: newMenuToken(),
          reservationId: "none",
          ipHash,
          ...withGateway(gateway),
        });
        return !result.ok && result.code === RESERVATION_ERROR.rateLimited;
      };
    },
  },
  {
    name: "menuAnalytics.ingest",
    // The bucket counts events: 300 a minute is 30 calls of ten.
    calls: 30,
    make: async () => {
      const { t, w } = await freshWorld();
      await goLive(t, w, w.a);
      return async (ipHash, gateway) => {
        const result = await t.mutation(api.menuAnalytics.ingest, {
          slug: SLUG_A,
          ipHash,
          ...withGateway(gateway),
          uredjaj: "telefon",
          dogadjaji: Array.from({ length: 10 }, () => openPage),
        });
        return !result.ok;
      };
    },
  },
];

for (const target of targets) {
  describe(`${target.name}: the per-IP bucket`, () => {
    test("without MENU_GATEWAY_SECRET each IP hash has its own bucket (as before K33)", { timeout: 120_000 }, async () => {
      const probe = await target.make();
      for (let call = 0; call < target.calls; call += 1) expect(await probe(ipOf(1))).toBe(false);
      expect(await probe(ipOf(1))).toBe(true);
      // Another hash is not affected; a gateway argument means nothing without a secret to match.
      expect(await probe(ipOf(2))).toBe(false);
      expect(await probe(ipOf(3), WRONG_SECRET)).toBe(false);
    });

    test("with the secret set, made-up hashes share ONE bucket; the right secret keeps its own", { timeout: 120_000 }, async () => {
      process.env.MENU_GATEWAY_SECRET = SECRET;
      const probe = await target.make();
      // Every call claims a new address but sends no secret.
      for (let call = 0; call < target.calls; call += 1) expect(await probe(ipOf(100 + call))).toBe(false);
      expect(await probe(ipOf(900))).toBe(true);
      // A wrong secret is no secret.
      expect(await probe(ipOf(901), WRONG_SECRET)).toBe(true);
      // The Next handler's call: the right secret and a new hash.
      expect(await probe(ipOf(902), SECRET)).toBe(false);
    });
  });
}

// =============================================================================
// The analytics ingest: the slug decides the venue (audit gap)
// =============================================================================

describe("menuAnalytics.ingest: an event never lands in another venue", () => {
  const eventsOf = (t: T) => t.run(async (ctx) => await ctx.db.query("menuAnalyticsEvents").take(500));

  /** The card and a real page key of tenant B. */
  async function venueBParts(t: T, w: MenuWorldSeed) {
    return await t.run(async (ctx) => {
      const { cardId } = await seedQrLink(ctx, {
        menuServiceId: w.b.menuServiceId,
        businessId: w.b.businessId,
        pageKey: PAGE,
        createdByUserId: w.adminId,
        cardCode: "GWB00001",
      });
      const page = await ctx.db.get(w.b.defaultPageId);
      if (!page) throw new Error("no default page of tenant b");
      return { cardId, pageKey: page.key };
    });
  }

  test("a card and a page of venue b sent to venue a's slug write nothing for b", async () => {
    const { t, w } = await freshWorld();
    await goLive(t, w, w.a);
    await goLive(t, w, w.b);
    const b = await venueBParts(t, w);

    const result = await t.mutation(api.menuAnalytics.ingest, {
      slug: SLUG_A,
      ipHash: ipOf(1),
      uredjaj: "telefon",
      dogadjaji: [
        { vrsta: "stranica", stranica: b.pageKey, kartica: b.cardId },
        { vrsta: "detalj", stranica: b.pageKey, artikal: ARTICLE },
      ],
    });
    expect(result).toEqual({ ok: true, primljeno: 2 });

    const rows = await eventsOf(t);
    expect(rows.filter((row) => row.menuServiceId === w.b.menuServiceId)).toHaveLength(0);
    expect(rows.filter((row) => row.menuServiceId === w.a.menuServiceId)).toHaveLength(2);
  });

  test("the same event sent to venue b's slug is stored for b only", async () => {
    const { t, w } = await freshWorld();
    await goLive(t, w, w.a);
    await goLive(t, w, w.b);
    const b = await venueBParts(t, w);

    const result = await t.mutation(api.menuAnalytics.ingest, {
      slug: SLUG_B,
      ipHash: ipOf(1),
      uredjaj: "telefon",
      dogadjaji: [{ vrsta: "stranica", stranica: b.pageKey, kartica: b.cardId }],
    });
    expect(result).toEqual({ ok: true, primljeno: 1 });

    const rows = await eventsOf(t);
    expect(rows.filter((row) => row.menuServiceId === w.a.menuServiceId)).toHaveLength(0);
    expect(rows.filter((row) => row.menuServiceId === w.b.menuServiceId)).toHaveLength(1);
  });

  test("a venue that is not published, or a slug nobody has, takes nothing", async () => {
    const { t, w } = await freshWorld();
    await goLive(t, w, w.a);
    const b = await venueBParts(t, w);

    for (const slug of [SLUG_B, "nema-takvog-lokala"]) {
      const result = await t.mutation(api.menuAnalytics.ingest, {
        slug,
        ipHash: ipOf(1),
        uredjaj: "telefon",
        dogadjaji: [{ vrsta: "stranica", stranica: b.pageKey, kartica: b.cardId }],
      });
      expect(result).toEqual({ ok: false, primljeno: 0 });
    }
    expect(await eventsOf(t)).toHaveLength(0);
  });
});
