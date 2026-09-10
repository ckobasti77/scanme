import { internalMutation } from "./_generated/server";
import { upsertManualEntitlement } from "./lib/entitlements";
import { generateCode } from "./lib/codes";
import { hashPin } from "./orderingShifts";
import type { Id } from "./_generated/dataModel";

// TASK-66 dev tooling: provisions, on a DEV deployment, everything the guest
// ordering flow needs end to end — a business with an active scanme_venue
// Premium entitlement (ordering: true), an enabled orderingConfig, a short item
// list, a staff PIN, and two `table_ordering` cards (two tables, so the
// per-cardId call ceiling can be seen holding at one table while the other
// still works).
//
// This exists because the guest surface CANNOT be QA'd from a fixture: the
// screen is only correct if the identity arrived through the real card-aware
// hop (/r/[cardCode]/o → mint with cardId → Path=/o/[code] cookie). A fixture
// page would prove the chrome and hide the one thing that matters.
//
// internalMutation ⇒ callable only via `npx convex run` with a deploy key,
// never from a client. Idempotent: re-running returns the existing codes.
//
// Browser QA loop:
//   npx convex run orderingDevSeed:seed
//   npx convex run orderingShifts:openShift '{"code":"<venueCode>","pin":"1234"}'
//   open http://localhost:3000/r/<cardCode>/o?venue=<venueCode>
// The shift goes stale ~60 s after the last heartbeat (there is no panel yet,
// TASK-68), which is itself the cause-A half of the disabled state to observe.

const SEED_SLUG = "porucivanje-primer";
const SEED_NAME = "Poručivanje primer — Kafana Dva Jelena";
const SEED_PIN = "1234";
const SEED_ITEMS: Array<{ name: string; priceRsd?: number }> = [
  { name: "Domaće pivo 0.5", priceRsd: 280 },
  { name: "Kisela voda", priceRsd: 180 },
  { name: "Domaća rakija", priceRsd: 320 },
  { name: "Espreso", priceRsd: 200 },
  { name: "Čaša vode", priceRsd: undefined },
];

export const seed = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_slug", (q) => q.eq("slug", SEED_SLUG))
      .unique();
    if (existing) {
      const config = await ctx.db
        .query("orderingConfig")
        .withIndex("by_businessId", (q) => q.eq("businessId", existing._id))
        .unique();
      const cards = await ctx.db
        .query("cards")
        .withIndex("by_businessId", (q) => q.eq("businessId", existing._id))
        .take(10);
      // TASK-71 backfill: the original seed (TASK-66) never needed the owner
      // client-panel to render, since prior QA only exercised the guest/panel
      // surfaces. TASK-71's browser QA opens the owner client-panel too, which
      // gates the Venue section on an ACTIVE scanme_venue serviceProfile
      // (clientPanel.venuePanel), not just the entitlement row above — so a
      // deployment seeded before TASK-71 is missing it. Backfilled once, here.
      const existingProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", existing._id).eq("type", "scanme_venue"),
        )
        .unique();
      if (!existingProfile) {
        await ctx.db.insert("serviceProfiles", {
          businessId: existing._id,
          type: "scanme_venue",
          slug: SEED_SLUG,
          status: "active",
          clientEditingEnabled: true,
          totalScans: 0,
          totalPageViews: 0,
          totalConvertedSessions: 0,
          createdAt: now,
          updatedAt: now,
        });
      }
      return {
        created: false,
        venueCode: config?.code ?? null,
        cardCodes: cards.map((card) => card.cardCode),
        pin: SEED_PIN,
      };
    }

    const businessId = await ctx.db.insert("businesses", {
      name: SEED_NAME,
      slug: SEED_SLUG,
      status: "active",
      createdAt: now,
    });
    // Premium venue: PLAN_LIMITS gives it `ordering: true`, which is what
    // venueOrderingEnabled reads. The per-venue toggle below is the second gate.
    await upsertManualEntitlement(ctx, {
      businessId,
      product: "scanme_venue",
      planKey: "premium",
      now,
    });

    // An active scanme_venue serviceProfile is what clientPanel.venuePanel
    // gates the owner-facing Venue section on (separate from the entitlement
    // above) — needed so the seeded business's client-panel actually renders
    // the ordering config card.
    await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: SEED_SLUG,
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });

    const venueCode = generateCode();
    await ctx.db.insert("orderingConfig", {
      businessId,
      code: venueCode,
      enabled: true,
      callWaiterEnabled: true,
      overdueMinutes: 7,
      reasons: ["Račun", "Voda", "Pomoć", "Ostalo"],
      createdAt: now,
      updatedAt: now,
    });

    for (let i = 0; i < SEED_ITEMS.length; i += 1) {
      await ctx.db.insert("orderingItems", {
        businessId,
        name: SEED_ITEMS[i].name,
        priceRsd: SEED_ITEMS[i].priceRsd,
        available: true,
        order: i,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("staffPins", {
      businessId,
      label: "Šef sale",
      pinHash: await hashPin(SEED_PIN),
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    // cardTargets.createdByUserId is required; a seed has no signed-in owner, so
    // reuse any existing user (dev deployments always have one) or make one.
    const anyUser = await ctx.db.query("users").first();
    const createdByUserId: Id<"users"> =
      anyUser?._id ?? (await ctx.db.insert("users", { name: "Seed vlasnik" }));

    const cardCodes: string[] = [];
    for (const label of ["Sto 7", "Sto 12"]) {
      const cardCode = generateCode();
      const cardId = await ctx.db.insert("cards", {
        businessId,
        cardCode,
        label,
        status: "active",
        totalScans: 0,
        createdAt: now,
        updatedAt: now,
      });
      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: "table_ordering",
        createdByUserId,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId });
      cardCodes.push(cardCode);
    }

    return { created: true, venueCode, cardCodes, pin: SEED_PIN };
  },
});
