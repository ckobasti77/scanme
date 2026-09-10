/// <reference types="vite/client" />

// TASK-42, dokaz 2: CEO PUT OD LANDINGA DO ISTEKA — jedan test, jedan klijent.
//
// Klik na paket "Događaj" (Venue + Memories) sa landinga → checkout (server) →
// provizioniranje → getEntitlement vraća KUPLJENI nivo iz plana naloga (korak 3,
// nula entitlement redova) → sat prelazi datum naplate + GRACE_DAYS → izvedeni
// statusi prelaze aktivan → ističe → istekao → cron sweep gasi nalog i
// entitlement PRESTAJE da važi → ručna uplata (glavni tok naplate, TASK-32)
// vraća sve.
//
// Sat: convex-test ne ume da pomeri Date.now() unutar mutacija, pa se vreme
// simulira kao i u billing.test.ts — izvedeni statusi se čitaju kroz
// billingOverview({ now }) sa sintetičkim `now`, a za skladišteni rez (sweep)
// se planValidUntil unazadi relativno na stvarno `now`. Ista činjenica, druga
// strana sata.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";
import { addBillingPeriod, DAY_MS, GRACE_DAYS } from "./lib/billingCycle";
import { buildPriceSnapshot } from "./lib/orderSnapshot";
import { price } from "../lib/pricing/engine";
import { priceSelection } from "../components/purchase/step-services-model";
import {
  computeProductsOneTime,
  createDefaultProductSelection,
} from "../lib/scanme-pricing";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://test.local";
const ADMIN_EMAIL = "admin@scanme.test";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

describe("ceo put kupovine: landing → checkout → entitlement → istek → uplata (TASK-42)", () => {
  test("kupljeni nivo živi iz plana naloga, umire posle grace-a, i vraća se uplatom", async () => {
    const t = convexTest(schema, modules);

    // Onboarding ostavlja: prijavljen vlasnik + lokal + aktivno članstvo.
    const { userId, businessId, adminId } = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        email: "vlasnik@lokal.test",
        emailVerificationTime: now,
      });
      const businessId = await ctx.db.insert("businesses", {
        name: "Kafana Ceo Put",
        slug: "kafana-ceo-put",
        status: "active",
        createdAt: now,
      });
      await ctx.db.insert("businessMemberships", {
        userId,
        businessId,
        accessRole: "viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const adminId = await ctx.db.insert("users", {
        email: ADMIN_EMAIL,
        emailVerificationTime: now,
      });
      return { userId, businessId, adminId };
    });
    const asBuyer = t.withIdentity({ subject: userId, issuer: ISSUER });
    const asAdmin = t.withIdentity({ subject: adminId, issuer: ISSUER });

    // ── 1. Klik na paket "Događaj" (landing šalje venue+memories u /kupovina)
    // → četiri koraka → checkout. Korpa: Događaj godišnje, Premium godišnje,
    // plus jedna fizička stavka vezana za Venue.
    const physical = createDefaultProductSelection("two-piece-stand");
    const result = await asBuyer.mutation(api.checkout.checkout, {
      accountName: "Kafana Ceo Put",
      plan: "premium",
      planPeriod: "annual",
      serviceLines: [
        { businessId, service: "scanme_venue", period: "annual" },
        { businessId, service: "scanme_memories", period: "annual" },
      ],
      physicalLines: [
        { businessId, boundServices: ["scanme_venue"], selection: physical },
      ],
    });
    expect(result.provisioning).toBe("complete");

    // Snapshot fakture ≡ ono što je korpa na ekranu pokazivala (dokaz 1 na
    // ovom konkretnom putu): isti motor, iste brojke.
    const quoted = priceSelection({
      services: [
        { service: "venue", period: "annual" },
        { service: "memories", period: "annual" },
      ],
      plan: "premium",
      planPeriod: "annual",
      products: [physical],
      step: 4,
    });
    expect(quoted).not.toBeNull();
    expect(result.priceSnapshot).toEqual(
      buildPriceSnapshot(quoted!, computeProductsOneTime([physical])),
    );

    // ── 2. Provizioniranje: usluge aktivne, tier iz PLANA NALOGA, nula
    // entitlement redova (RFC-002 §2.2.3 — "true by construction").
    const afterCheckout = await t.run(async (ctx) => {
      const business = await ctx.db.get(businessId);
      const account = business?.accountId
        ? await ctx.db.get(business.accountId)
        : null;
      const memories = await getEntitlement(ctx, businessId, "scanme_memories");
      const venue = await getEntitlement(ctx, businessId, "scanme_venue");
      const entitlementRows = await ctx.db.query("entitlements").collect();
      const profiles = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
        .collect();
      return { account, memories, venue, entitlementRows, profiles };
    });
    const accountId = afterCheckout.account?._id as Id<"accounts">;
    expect(afterCheckout.account?.plan).toBe("premium");
    expect(afterCheckout.account?.status).toBe("active");
    expect(afterCheckout.memories?.planKey).toBe("premium");
    expect(afterCheckout.memories?.limits.photosPerGuest).toBe(10);
    expect(afterCheckout.venue?.planKey).toBe("premium");
    expect(afterCheckout.entitlementRows).toHaveLength(0);
    expect(
      afterCheckout.profiles.map((p) => [p.type, p.status].join(":")).sort(),
    ).toEqual(["scanme_memories:active", "scanme_venue:active"]);

    // ── 3. Pre uplate i pre podešavanja: churn-prediktor status.
    const now0 = Date.now();
    const rowBefore = (
      await asAdmin.query(api.billing.billingOverview, { now: now0 })
    ).find((row) => row.accountId === accountId);
    expect(rowBefore?.status).toBe("paid_never_configured");

    // Klijent podesi Memories (napravi prostor) — više nije "nikad podešeno".
    await t.run(async (ctx) => {
      const profile = afterCheckout.profiles.find(
        (p) => p.type === "scanme_memories",
      )!;
      await ctx.db.insert("memoriesSpaces", {
        businessId,
        memoriesProfileId: profile._id,
        code: "CEOP1234",
        name: "Uspomene",
        mode: "recurring",
        status: "active",
        defaultVisibility: "everyone",
        guestVisibilityChoice: true,
        publicGalleryEnabled: false,
        wallEnabled: false,
        totalPhotos: 0,
        totalGuests: 0,
        createdAt: now0,
        updatedAt: now0,
      });
    });

    // ── 4. Admin označi porudžbinu plaćenom (stub naplate, RFC-002 §2.5):
    // jedna uplata sa iznosom snapshota, ciklus kreće od datuma uplate.
    await asAdmin.mutation(api.orders.markOrderPaid, { orderId: result.orderId });
    const paid = await t.run(async (ctx) => {
      const account = await ctx.db.get(accountId);
      const payments = await ctx.db.query("payments").collect();
      const order = await ctx.db.get(result.orderId);
      return { account, payments, order };
    });
    expect(paid.order?.status).toBe("provisioned");
    expect(paid.payments).toHaveLength(1);
    expect(paid.payments[0].amountRsd).toBe(
      result.priceSnapshot.recurringTotalRsd +
        result.priceSnapshot.oneTimeTotalRsd,
    );
    const dueAt = paid.account?.planValidUntil;
    expect(dueAt).toBeDefined();

    // ── 5. Sat ide napred — izvedeni statusi prelaze kako treba.
    const overviewStatusAt = async (now: number) =>
      (await asAdmin.query(api.billing.billingOverview, { now })).find(
        (row) => row.accountId === accountId,
      )?.status;
    // Daleko od naplate: aktivan.
    expect(await overviewStatusAt(dueAt! - 30 * DAY_MS)).toBe("active");
    // Unutar 14 dana pre naplate: ističe uskoro.
    expect(await overviewStatusAt(dueAt! - 7 * DAY_MS)).toBe("expiring_soon");
    // Posle datuma naplate, unutar grace-a: i dalje "ističe" (kasni), i
    // entitlement i dalje važi — grace štiti klijenta koji kasni sa prenosom.
    expect(await overviewStatusAt(dueAt! + 3 * DAY_MS)).toBe("expiring_soon");
    const inGrace = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(inGrace?.planKey).toBe("premium");
    // Posle grace-a: izvedeno "istekao" — pre nego što je cron išta pipnuo.
    expect(await overviewStatusAt(dueAt! + (GRACE_DAYS + 1) * DAY_MS)).toBe(
      "expired",
    );

    // ── 6. Skladišteni rez: unazadi planValidUntil preko datuma naplate +
    // grace (ekvivalent pomeranja sata), pusti dnevni sweep — nalog je
    // "expired" i getEntitlement korak 3 PRESTAJE da rešava.
    const realNow = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.patch(accountId, {
        planValidUntil: realNow - (GRACE_DAYS + 1) * DAY_MS,
      });
    });
    await t.mutation(internal.billing.sweepBillingCycles, {});
    const afterSweep = await t.run(async (ctx) => {
      const account = await ctx.db.get(accountId);
      const memories = await getEntitlement(ctx, businessId, "scanme_memories");
      const venue = await getEntitlement(ctx, businessId, "scanme_venue");
      return { account, memories, venue };
    });
    expect(afterSweep.account?.status).toBe("expired");
    expect(afterSweep.memories).toBeNull();
    expect(afterSweep.venue).toBeNull();
    expect(await overviewStatusAt(realNow)).toBe("expired");

    // ── 7. Ručna uplata (glavni tok prvih pedeset klijenata) vraća SVE:
    // status, tier iz plana naloga, i nov ciklus od datuma uplate.
    const paidAt = Date.now();
    await asAdmin.mutation(api.billing.recordManualPayment, {
      accountId,
      amountRsd: result.priceSnapshot.recurringTotalRsd,
      paidAt,
      reference: "izvod-042",
    });
    const restored = await t.run(async (ctx) => {
      const account = await ctx.db.get(accountId);
      const memories = await getEntitlement(ctx, businessId, "scanme_memories");
      const venue = await getEntitlement(ctx, businessId, "scanme_venue");
      const audit = await ctx.db.query("adminAuditLog").collect();
      return { account, memories, venue, audit };
    });
    expect(restored.account?.status).toBe("active");
    // Posle duge pauze ciklus kreće ispočetka od uplate, ne od starog duga.
    expect(restored.account?.planValidUntil).toBe(
      addBillingPeriod(paidAt, "annual"),
    );
    expect(restored.memories?.planKey).toBe("premium");
    expect(restored.memories?.limits.photosPerGuest).toBe(10);
    expect(restored.venue?.planKey).toBe("premium");
    expect(await overviewStatusAt(Date.now())).toBe("active");
    // Svaka ručna promena je u tragu: checkout + 2× record_payment.
    const actions = restored.audit.map((row) => row.action);
    expect(actions.filter((a) => a === "record_payment")).toHaveLength(2);
    expect(actions).toContain("checkout");
  });
});
