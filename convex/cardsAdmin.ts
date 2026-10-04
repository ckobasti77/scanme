import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { generateCode } from "./lib/codes";
import { requireText } from "./lib/validation";
import { cardTargetSpecValidator, validateTargetSpec } from "./cards";
import { fmt, getDict } from "../lib/i18n";

// =============================================================================
// TASK-72 — the admin surface for printed cards. Until now `cards.createCard`
// and `cards.retargetCard` had NO caller in the app (only tests); a card could
// be minted only by running a Convex mutation by hand, so the owner could not
// onboard a client without a terminal. This file is the requireAdmin console
// that closes that gap: create (single + batch), retarget, disable, and list a
// business's cards with their current destination and scan counts.
//
// It does NOT reimplement any card logic. It runs the SAME validation as
// convex/cards.ts by importing `validateTargetSpec` (export-only there), so the
// Links→Memories / Links→ordering refusal gates — and every ownership check —
// fire identically here; their readable Serbian ConvexError sentences reach the
// admin verbatim. What this file adds on top is the audit trail: EVERY mutation
// that changes something writes EXACTLY ONE `adminAuditLog` row in the same
// transaction (obrazac TASK-58 / menuAdmin.ts). A no-op (disable an already
// disabled card) writes NO row and returns `changed: false`.
// =============================================================================

const dict = getDict("cards-admin");
// Card-specific error sentences already live on the `memories` surface (thrown
// by convex/cards.ts). We reuse them for the two failures this file raises
// directly so the strings stay in one place.
const cardDict = getDict("memories");

// Mirrors convex/cards.ts: birthday-paradox-improbable code collision retry.
const CODE_INSERT_ATTEMPTS = 5;
// Mirrors MINT_BATCH_MAX in convex/cards.ts: a batch stays one transaction.
const CARD_BATCH_MAX = 50;

type ValidatedTarget = Awaited<ReturnType<typeof validateTargetSpec>>;

async function loadBusiness(ctx: MutationCtx, businessId: Id<"businesses">) {
  const business = await ctx.db.get(businessId);
  if (!business) throw new ConvexError(dict.businessNotFound);
  return business;
}

// The card-minting core, shared by createCard and createCardBatch so both run
// one implementation (the `mintSpaceCards` philosophy). Generates a unique
// cardCode (insert-retry on by_cardCode within this serializable transaction),
// inserts the card, and — when a target was supplied — inserts the immutable
// cardTargets row and points currentTargetId at it. The target has ALREADY been
// validated by the caller (once), so batch reuses the same fields for every card.
async function mintOneCard(
  ctx: MutationCtx,
  params: {
    businessId: Id<"businesses">;
    label: string;
    targetFields: ValidatedTarget | null;
    actorUserId: Id<"users">;
    now: number;
  },
): Promise<{ cardId: Id<"cards">; cardCode: string }> {
  const { businessId, label, targetFields, actorUserId, now } = params;
  let cardCode: string | null = null;
  for (let attempt = 0; attempt < CODE_INSERT_ATTEMPTS; attempt += 1) {
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
  if (!cardCode) throw new ConvexError(cardDict.cardCodeGenerationFailed);

  const cardId = await ctx.db.insert("cards", {
    businessId,
    cardCode,
    label,
    status: "active",
    totalScans: 0,
    createdAt: now,
    updatedAt: now,
  });

  if (targetFields) {
    const targetId = await ctx.db.insert("cardTargets", {
      cardId,
      ...targetFields,
      createdByUserId: actorUserId,
      createdAt: now,
    });
    await ctx.db.patch(cardId, { currentTargetId: targetId, updatedAt: now });
  }

  return { cardId, cardCode };
}

// -----------------------------------------------------------------------------
// Mutations (requireAdmin; each changing one writes exactly one audit row)
// -----------------------------------------------------------------------------

export const createCard = mutation({
  args: {
    businessId: v.id("businesses"),
    label: v.string(),
    target: v.optional(cardTargetSpecValidator),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const business = await loadBusiness(ctx, args.businessId);
    const label = requireText(args.label, "Oznaka kartice", 1, 80);
    const now = Date.now();
    // Validate BEFORE minting: a refused target (e.g. Links→Memories) throws
    // here, and the whole transaction rolls back — no orphan card.
    const targetFields = args.target
      ? await validateTargetSpec(ctx, args.businessId, args.target)
      : null;
    const { cardId, cardCode } = await mintOneCard(ctx, {
      businessId: args.businessId,
      label,
      targetFields,
      actorUserId: admin._id,
      now,
    });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "create_card",
      detail: { cardId, cardCode, kind: args.target?.kind ?? null },
      now,
    });
    return { cardId, cardCode };
  },
});

// Group creation (RFC operational need): a venue with 20 tables mints 20 cards
// "Sto 1".."Sto 20" in ONE flow. The target is validated ONCE and its fields
// reused for every card (identical destination), so the ownership check and the
// refusal gates run once, and the batch is one transaction — the mintCardsForSpace
// pattern, generalised to any target kind. One audit row for the whole batch.
export const createCardBatch = mutation({
  args: {
    businessId: v.id("businesses"),
    count: v.number(),
    startIndex: v.optional(v.number()),
    labelPrefix: v.string(),
    target: cardTargetSpecValidator,
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const business = await loadBusiness(ctx, args.businessId);
    if (
      !Number.isInteger(args.count) ||
      args.count < 1 ||
      args.count > CARD_BATCH_MAX
    ) {
      throw new ConvexError(fmt(dict.batchCountInvalid, { max: CARD_BATCH_MAX }));
    }
    const startIndex =
      args.startIndex !== undefined && Number.isInteger(args.startIndex)
        ? Math.max(1, args.startIndex)
        : 1;
    const prefix = requireText(args.labelPrefix, "Oznaka", 1, 40);
    const now = Date.now();
    const targetFields = await validateTargetSpec(
      ctx,
      args.businessId,
      args.target,
    );
    const created: Array<{
      cardId: Id<"cards">;
      cardCode: string;
      label: string;
    }> = [];
    for (let i = 0; i < args.count; i += 1) {
      const label = `${prefix} ${startIndex + i}`;
      const { cardId, cardCode } = await mintOneCard(ctx, {
        businessId: args.businessId,
        label,
        targetFields,
        actorUserId: admin._id,
        now,
      });
      created.push({ cardId, cardCode, label });
    }
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "create_card_batch",
      detail: {
        count: args.count,
        kind: args.target.kind,
        labelPrefix: prefix,
        from: startIndex,
        to: startIndex + args.count - 1,
      },
      now,
    });
    return { created };
  },
});

// Retargeting (RFC §2.4 C.9): INSERT a new immutable cardTargets row and patch
// currentTargetId — the printed card never changes, only where it points. The
// UI warns the owner that the physical card is already with the client.
export const retargetCard = mutation({
  args: { cardId: v.id("cards"), target: cardTargetSpecValidator },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new ConvexError(cardDict.cardNotFound);
    if (card.accessChannelId) throw new ConvexError("access_use_canonical_writer");
    const business = await loadBusiness(ctx, card.businessId);
    const fromKind = card.currentTargetId
      ? ((await ctx.db.get(card.currentTargetId))?.kind ?? null)
      : null;
    const now = Date.now();
    const fields = await validateTargetSpec(ctx, card.businessId, args.target);
    const targetId = await ctx.db.insert("cardTargets", {
      cardId: card._id,
      ...fields,
      createdByUserId: admin._id,
      createdAt: now,
    });
    await ctx.db.patch(card._id, { currentTargetId: targetId, updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "retarget_card",
      detail: { cardId: card._id, fromKind, toKind: args.target.kind },
      now,
    });
    return { targetId };
  },
});

export const disableCard = mutation({
  args: { cardId: v.id("cards") },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new ConvexError(cardDict.cardNotFound);
    if (card.accessChannelId) throw new ConvexError("access_use_canonical_writer");
    if (card.status === "disabled") return { changed: false as const };
    const business = await loadBusiness(ctx, card.businessId);
    const now = Date.now();
    await ctx.db.patch(card._id, { status: "disabled", updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      ...(business.accountId ? { accountId: business.accountId } : {}),
      businessId: business._id,
      action: "disable_card",
      detail: { cardId: card._id },
      now,
    });
    return { changed: true as const };
  },
});

// -----------------------------------------------------------------------------
// Read models (requireAdmin)
// -----------------------------------------------------------------------------

export type CardTargetSummary = {
  kind: Doc<"cardTargets">["kind"];
  // A human description of where the card leads: a space/event/profile name, a
  // URL, or null for kinds that resolve to the business's own page at scan time
  // (venue / menu / table_ordering).
  detail: string | null;
  // Present only for splitter targets: the button labels, in order.
  buttons?: string[];
};

async function summarizeTarget(
  ctx: QueryCtx,
  target: Doc<"cardTargets">,
): Promise<CardTargetSummary> {
  switch (target.kind) {
    case "memories_space": {
      const space = target.spaceId ? await ctx.db.get(target.spaceId) : null;
      return {
        kind: target.kind,
        detail: space ? `${space.name} (${space.code})` : null,
      };
    }
    case "event": {
      const event = target.eventId ? await ctx.db.get(target.eventId) : null;
      return { kind: target.kind, detail: event ? event.title : null };
    }
    case "service_page": {
      const profile = target.serviceProfileId
        ? await ctx.db.get(target.serviceProfileId)
        : null;
      return { kind: target.kind, detail: profile ? `/${profile.slug}` : null };
    }
    case "url":
      return { kind: target.kind, detail: target.url ?? null };
    case "splitter":
      return {
        kind: target.kind,
        detail: null,
        buttons: (target.splitterItems ?? []).map((item) => item.label),
      };
    case "venue":
    case "menu":
    case "table_ordering":
      return { kind: target.kind, detail: null };
    case "fair_model":
      // Sajam 2026 B0: inert summary; B1 may name the assigned fair model.
      return { kind: target.kind, detail: null };
  }
}

// Every card of a business with its current destination and scan count — the
// admin card table across ALL target kinds (cards.listSpaceCards is memories-
// only). Bounded read. Returns null when the business is gone/archived so the
// client can render a not-found state.
export const listBusinessCards = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) return null;
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(500);
    const rows: Array<{
      cardId: Id<"cards">;
      cardCode: string;
      label: string;
      status: Doc<"cards">["status"];
      totalScans: number;
      createdAt: number;
      target: CardTargetSummary | null;
    }> = [];
    for (const card of cards) {
      let target: CardTargetSummary | null = null;
      if (card.currentTargetId) {
        const t = await ctx.db.get(card.currentTargetId);
        if (t) target = await summarizeTarget(ctx, t);
      }
      rows.push({
        cardId: card._id,
        cardCode: card.cardCode,
        label: card.label,
        status: card.status,
        totalScans: card.totalScans,
        createdAt: card.createdAt,
        target,
      });
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return {
      business: { name: business.name, slug: business.slug },
      cards: rows,
    };
  },
});

// The reference options the create/retarget/splitter pickers need for a chosen
// business: its Memories spaces, events, service profiles, and whether ordering
// is configured (so the UI can hint that a table_ordering card needs a config).
// Bounded reads. Null when the business is gone.
export const listCardTargetOptions = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business) return null;
    const spaces = await ctx.db
      .query("memoriesSpaces")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", args.businessId),
      )
      .take(200);
    const events = await ctx.db
      .query("events")
      .withIndex("by_businessId_and_status", (q) =>
        q.eq("businessId", args.businessId),
      )
      .take(200);
    const serviceProfiles = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(200);
    const orderingConfig = await ctx.db
      .query("orderingConfig")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .unique();
    return {
      business: { name: business.name, slug: business.slug },
      spaces: spaces.map((s) => ({
        id: s._id,
        name: s.name,
        code: s.code,
        status: s.status,
      })),
      events: events.map((e) => ({
        id: e._id,
        title: e.title,
        slug: e.slug,
        status: e.status,
      })),
      serviceProfiles: serviceProfiles.map((p) => ({
        id: p._id,
        type: p.type,
        slug: p.slug,
        status: p.status,
      })),
      hasOrderingConfig: Boolean(orderingConfig?.enabled),
    };
  },
});
