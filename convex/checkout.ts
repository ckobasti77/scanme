import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { requireBusinessAccess } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { manualBillingPort } from "./lib/billingPort";
import { generateCode } from "./lib/codes";
import {
  buildPriceSnapshot,
  PRICING_SERVICE_BY_SERVICE_TYPE,
  type ServiceType,
} from "./lib/orderSnapshot";
import { getDict } from "../lib/i18n";
import { price } from "../lib/pricing/engine";
import type { BillingPeriod, PlanId } from "../lib/pricing/types";
import type { ProductSelection } from "../lib/scanme-pricing";
import {
  assertPlanPeriod,
  buildEngineItems,
  ensureActiveServiceProfile,
  linkBusinessesToAccount,
  physicalLineTotalRsd,
  resolveOrderAccount,
} from "./orders";

// =============================================================================
// TASK-38 — Step 4: checkout and provisioning (RFC-002 §2.3 step 4, §2.5, §4
// task 10). This is the front door that JOINS the shipped pieces — the pricing
// engine (lib/pricing), the order layer (convex/orders.ts, TASK-31), the
// account plan spine (getEntitlement step 3, TASK-29), the billing port
// (TASK-32), and the splitter (TASK-37) — into one flow that ends in a purchase.
//
// What checkout does, in one transaction (the common solo case) or fanned over
// the scheduler (a large Enterprise, §2.5 / risk #5):
//   1. Writes an `orders` row with the price snapshot the buyer was quoted — the
//      SAME pure engine the marketing page uses, never a client-supplied number.
//   2. Ensures the buyer's account and its plan (Axis B). The plan is the ONLY
//      thing that carries the purchased tier.
//   3. For every purchased service, activates `serviceProfiles` on its location
//      (the ownership gate). The TIER is left to getEntitlement step 3 — the
//      account plan resolves it LIVE, with ZERO per-business entitlement rows.
//      That is what makes the screen's promise true: "Premium važi i na svaku
//      uslugu koju kasnije dodaš, bez doplate." A written entitlement row would
//      make that promise a lie at the next purchase.
//   4. A physical line bound to 2+ services provisions a card as a splitter
//      (razdelnik, TASK-37). If that splitter would route Memories THROUGH a
//      Links page, card creation is refused — LOUD, HERE at checkout, never a
//      silent per-table quota leak discovered later (§2.4).
//
// Payment is a STUB against the billing port (TASK-32): the order is written
// `pending`; a manual admin action (or, later, a provider webhook) moves it
// pending → paid via `orders.markOrderPaid`, which records the payment and
// advances the account's billing cycle. Manual entry is still the MAIN flow.
// Provisioning happens at checkout, on trust, independent of that payment — the
// account plan resolves the tier the moment checkout returns.
// =============================================================================

const dict = getDict("memories");

// Locations/lines processed per provisioning step. Enterprise is 10–15 locations
// (one service line each is typical), so this is one or two steps; the bound is
// what keeps a large checkout within a transaction's budget and makes the
// provisioning fan-out resumable — the exact shape of TASK-30's fan-out.
const PROVISION_BATCH = 10;

const accountPlanValidator = v.union(
  v.literal("basic"),
  v.literal("premium"),
  v.literal("enterprise"),
);

const planPeriodValidator = v.union(
  v.literal("monthly"),
  v.literal("annual"),
);

const serviceTypeValidator = v.union(
  v.literal("scanme_links"),
  v.literal("google_review"),
  v.literal("scanme_venue"),
  v.literal("scanme_memories"),
);

const serviceLineValidator = v.object({
  businessId: v.id("businesses"),
  service: serviceTypeValidator,
  period: planPeriodValidator,
});

const physicalLineValidator = v.object({
  businessId: v.id("businesses"),
  // The service(s) the printed card leads to. Two or more → a splitter
  // (razdelnik, §2.4). Never empty.
  boundServices: v.array(serviceTypeValidator),
  // The ProductSelection from the configurator (lib/scanme-pricing.ts), stored
  // opaque; the server recomputes the line total from it (price integrity).
  selection: v.any(),
});

// Brand labels for the splitter's buttons (≤ 40 chars, the card label bound).
// Proper nouns, not localizable prose, so they live as code constants next to
// the equivalent map in convex/lib/access.ts.
const SPLITTER_BUTTON_LABEL: Record<ServiceType, string> = {
  scanme_links: "ScanMe Links",
  google_review: "Google recenzije",
  scanme_venue: "Venue",
  scanme_memories: "Memories",
};

// The single loud, synchronous safety gate (§2.4). A splitter binding that names
// BOTH Links and Memories would put Memories behind a Links-page splitter — the
// frozen Links render cannot emit a card-aware Memories link, so a guest
// arriving that way mints with no cardId and per-table quota silently dies. It
// is refused HERE, at checkout, with the two-pattern message — never discovered
// later as a quota leak. Called on every physical line before any write.
function assertSplitterBindingLegal(boundServices: readonly ServiceType[]) {
  if (
    boundServices.includes("scanme_links") &&
    boundServices.includes("scanme_memories")
  ) {
    throw new ConvexError(dict.cardLinksMemoriesBlocked);
  }
}

// The buttons a checkout-provisioned splitter can carry NOW: services whose
// destination is resolvable at sale time (Links/Review → the just-activated
// service page; Venue → the business's own /venue). Memories is deliberately
// excluded: its card-aware button needs a real memories space, which is minted
// in the Memories host flow, not here — so a splitter that names Memories (but
// not Links, which is already refused) is DEFERRED, its binding recorded for the
// owner to wire once the space exists (§2.4, §5 Q8; the direct memories_space
// card and the host-built bare splitter remain the supported Memories paths).
function splitterBuildableServices(
  boundServices: readonly ServiceType[],
): ServiceType[] {
  return boundServices.filter((service) => service !== "scanme_memories");
}

// Mint the splitter card for one physical line, idempotently. A line that
// already recorded `provisionedCardId` is skipped, so a resumed/retried fan-out
// never mints a second card. The card is card-aware by construction: it is a
// `cardTargets.kind === "splitter"` row under /r/[cardCode]/izbor (TASK-37), and
// each Links/Review button points at that location's own active service page.
async function ensureSplitterCard(
  ctx: MutationCtx,
  item: Doc<"orderItems">,
  ownerUserId: Id<"users">,
  now: number,
): Promise<void> {
  if (item.provisionedCardId) return; // already minted — idempotent

  const boundServices = item.boundServices ?? [];
  // Links + Memories was refused at checkout; a bare-splitter Memories button is
  // deferred (no space yet). Build from the resolvable services only.
  const buildable = splitterBuildableServices(boundServices);
  if (buildable.length < 2) return; // nothing to build now (deferred binding)

  const splitterItems: NonNullable<Doc<"cardTargets">["splitterItems"]> = [];
  for (const service of buildable) {
    const label = SPLITTER_BUTTON_LABEL[service];
    if (service === "scanme_venue") {
      // Resolves to the business's own /venue page at scan time; no reference.
      splitterItems.push({ kind: "venue", label });
    } else {
      // Links / Review: a service_page button pointing at the location's own
      // active service profile (ensured here so the button is never dangling).
      const serviceProfileId = await ensureActiveServiceProfile(
        ctx,
        item.businessId,
        service,
        now,
      );
      splitterItems.push({ kind: "service_page", serviceProfileId, label });
    }
  }

  let cardCode: string | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateCode();
    const taken = await ctx.db
      .query("cards")
      .withIndex("by_cardCode", (q) => q.eq("cardCode", candidate))
      .unique();
    if (!taken) {
      cardCode = candidate;
      break;
    }
  }
  if (!cardCode) throw new ConvexError(dict.cardCodeGenerationFailed);

  const cardId = await ctx.db.insert("cards", {
    businessId: item.businessId,
    cardCode,
    label: "Razdelnik",
    status: "active",
    totalScans: 0,
    createdAt: now,
    updatedAt: now,
  });
  const targetId = await ctx.db.insert("cardTargets", {
    cardId,
    kind: "splitter",
    splitterItems,
    createdByUserId: ownerUserId,
    createdAt: now,
  });
  await ctx.db.patch(cardId, { currentTargetId: targetId, updatedAt: now });
  await ctx.db.patch(item._id, { provisionedCardId: cardId });
}

// Provision one bounded batch of an order's lines: activate ownership for each
// service line, mint the splitter card for each multi-service physical line.
// Every write is idempotent (ensureActiveServiceProfile checks the existing
// profile; ensureSplitterCard checks provisionedCardId), so re-processing a
// batch — the most adversarial resume — converges without duplicates. Returns
// the index the next step resumes from.
async function provisionOrderBatch(
  ctx: MutationCtx,
  items: readonly Doc<"orderItems">[],
  startIndex: number,
  ownerUserId: Id<"users">,
  now: number,
): Promise<{ end: number; provisioned: number }> {
  const end = Math.min(startIndex + PROVISION_BATCH, items.length);
  let provisioned = 0;
  for (let i = startIndex; i < end; i += 1) {
    const item = items[i];
    if (item.kind === "service" && item.service) {
      await ensureActiveServiceProfile(ctx, item.businessId, item.service, now);
      provisioned += 1;
    } else if (item.kind === "physical") {
      await ensureSplitterCard(ctx, item, ownerUserId, now);
    }
  }
  return { end, provisioned };
}

// The resumable provisioning continuation (§2.5, risk #5) — TASK-30's fan-out
// shape. One bounded batch per step, self-rescheduled via runAfter(0). The
// scheduled job durably carries (orderId, ownerUserId, index); a crash mid-
// fan-out is completed by re-invoking from the next index (or, because every
// write is idempotent, from index 0). `nextIndex` mirrors the reschedule so a
// driver (a test, a manual recovery) can advance it deterministically.
export const provisionCheckoutOrder = internalMutation({
  args: {
    orderId: v.id("orders"),
    ownerUserId: v.id("users"),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Porudžbina nije pronađena.");

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", order._id))
      .collect();

    const now = Date.now();
    const { end, provisioned } = await provisionOrderBatch(
      ctx,
      items,
      args.index,
      args.ownerUserId,
      now,
    );

    if (end < items.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.checkout.provisionCheckoutOrder,
        { orderId: args.orderId, ownerUserId: args.ownerUserId, index: end },
      );
      return { done: false as const, provisioned, nextIndex: end };
    }
    return { done: true as const, provisioned, nextIndex: end };
  },
});

// Resolve the account this checkout bills against. An existing account (a repeat
// purchase whose location already belongs to one) is reused as-is — its plan is
// the account-level source of truth for Axis B; a fresh solo buyer gets a new
// solo account created from the chosen plan. Locations under two different
// accounts in one checkout is a genuine conflict and throws.
async function resolveCheckoutAccount(
  ctx: MutationCtx,
  args: {
    accountId?: Id<"accounts">;
    accountName?: string;
    plan?: PlanId;
    planPeriod?: BillingPeriod;
  },
  businessIds: readonly Id<"businesses">[],
  now: number,
) {
  let accountId = args.accountId;
  if (!accountId) {
    const existing = new Set<Id<"accounts">>();
    for (const businessId of businessIds) {
      const business = await ctx.db.get(businessId);
      if (business?.accountId) existing.add(business.accountId);
    }
    if (existing.size > 1) {
      throw new ConvexError(
        "Izabrani lokali pripadaju različitim nalozima — jedna kupovina ide na jedan nalog.",
      );
    }
    if (existing.size === 1) [accountId] = [...existing];
  }
  return resolveOrderAccount(
    ctx,
    {
      ...(accountId ? { accountId } : {}),
      ...(args.accountName ? { accountName: args.accountName } : {}),
      ...(args.plan ? { plan: args.plan } : {}),
      ...(args.planPeriod ? { planPeriod: args.planPeriod } : {}),
    },
    now,
  );
}

export const checkout = mutation({
  args: {
    // Bill an existing account, OR create a fresh solo account from plan+name.
    accountId: v.optional(v.id("accounts")),
    accountName: v.optional(v.string()),
    plan: v.optional(accountPlanValidator),
    planPeriod: v.optional(planPeriodValidator),
    serviceLines: v.array(serviceLineValidator),
    physicalLines: v.optional(v.array(physicalLineValidator)),
    externalRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.serviceLines.length === 0) {
      throw new ConvexError("Kupovina mora imati bar jednu uslugu.");
    }

    const physicalLines = args.physicalLines ?? [];

    // Every physical binding must be legal BEFORE anything is written — the
    // Links+Memories splitter is refused here, loudly, never later (§2.4).
    for (const line of physicalLines) {
      if (line.boundServices.length === 0) {
        throw new ConvexError("Fizička stavka mora biti vezana za bar jednu uslugu.");
      }
      assertSplitterBindingLegal(line.boundServices);
    }

    const businessIds = [
      ...new Set([
        ...args.serviceLines.map((line) => line.businessId),
        ...physicalLines.map((line) => line.businessId),
      ]),
    ];

    // Access is the ownership boundary the whole platform uses (§2.2.2): the
    // buyer must reach every location this checkout provisions. Admin bypasses
    // membership inside requireBusinessAccess; the code path is otherwise
    // byte-identical to every host write. This never changes requireBusinessAccess.
    let ownerUserId: Id<"users"> | null = null;
    for (const businessId of businessIds) {
      const { user } = await requireBusinessAccess(ctx, businessId);
      ownerUserId = user._id;
    }
    if (!ownerUserId) throw new ConvexError("Kupovina zahteva prijavu.");

    const now = Date.now();
    const { accountId, plan, planPeriod } = await resolveCheckoutAccount(
      ctx,
      args,
      businessIds,
      now,
    );
    assertPlanPeriod(plan, planPeriod);
    await linkBusinessesToAccount(ctx, accountId, businessIds);

    // Price with the shared pure engine — the SAME numbers the marketing page and
    // the invoice compute — and freeze the breakdown into the snapshot.
    const engineItems = buildEngineItems(args.serviceLines);
    const breakdown = price({
      items: engineItems,
      plan,
      ...(planPeriod ? { planPeriod } : {}),
    });
    const chargedByService = new Map(
      breakdown.lines.map((line) => [line.service, line.chargedRsd]),
    );

    const physicalTotals = physicalLines.map((line) =>
      physicalLineTotalRsd(line.selection as ProductSelection),
    );
    const oneTimeTotalRsd = physicalTotals.reduce((sum, total) => sum + total, 0);
    const priceSnapshot = buildPriceSnapshot(breakdown, oneTimeTotalRsd);

    const orderId = await ctx.db.insert("orders", {
      accountId,
      status: "pending",
      plan,
      ...(planPeriod ? { planPeriod } : {}),
      priceSnapshot,
      billingSource: manualBillingPort.source,
      ...(args.externalRef ? { externalRef: args.externalRef } : {}),
      createdAt: now,
      updatedAt: now,
    });

    // One orderItem per service line (services first, so the splitter buttons a
    // physical line needs are already provisioned within the same batch).
    for (const line of args.serviceLines) {
      const pricingService = PRICING_SERVICE_BY_SERVICE_TYPE[line.service];
      await ctx.db.insert("orderItems", {
        orderId,
        businessId: line.businessId,
        kind: "service",
        service: line.service,
        period: line.period,
        lineTotalRsd: chargedByService.get(pricingService) ?? 0,
        createdAt: now,
      });
    }
    for (let i = 0; i < physicalLines.length; i += 1) {
      const line = physicalLines[i];
      await ctx.db.insert("orderItems", {
        orderId,
        businessId: line.businessId,
        kind: "physical",
        boundService: line.boundServices[0],
        boundServices: line.boundServices,
        physicalSelection: line.selection,
        lineTotalRsd: physicalTotals[i],
        createdAt: now,
      });
    }

    await writeAdminAudit(ctx, {
      actorUserId: ownerUserId,
      accountId,
      action: "checkout",
      detail: {
        orderId,
        plan,
        ...(planPeriod ? { planPeriod } : {}),
        recurringTotalRsd: priceSnapshot.recurringTotalRsd,
        oneTimeTotalRsd: priceSnapshot.oneTimeTotalRsd,
      },
      now,
    });

    // Provision the first batch inline — the common solo order is fully live the
    // moment checkout returns (its tier already resolves from the account plan,
    // step 3). A large Enterprise fans the rest over the scheduler, resumable.
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_orderId", (q) => q.eq("orderId", orderId))
      .collect();
    const { end } = await provisionOrderBatch(ctx, items, 0, ownerUserId, now);
    if (end < items.length) {
      await ctx.scheduler.runAfter(
        0,
        internal.checkout.provisionCheckoutOrder,
        { orderId, ownerUserId, index: end },
      );
    }

    return {
      orderId,
      accountId,
      plan,
      ...(planPeriod ? { planPeriod } : {}),
      priceSnapshot,
      provisioning: end < items.length ? ("fanned" as const) : ("complete" as const),
    };
  },
});
