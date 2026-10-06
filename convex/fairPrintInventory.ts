import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { createEventOnlyClient } from "./fairAdmin";
import {
  accessDisplayContext,
  applyDestination,
  channelProjectionPatch,
  createChannel,
  prepareDestination,
  remember,
  replay,
  syncChannel,
  uniqueCode,
} from "./lib/accessOperations";
import { isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";

const INVENTORY_SMK = "SMK-SAJAM-26-QR";
const INVENTORY_SML = "SML-SAJAM-26-QR";
const INVENTORY_NAME = "Sajam automobila 2026 — QR inventar";
const INVENTORY_SLUG = "sajam-automobila-2026-qr-inventar";
const PRINT_PREFIX = "SA26";
const MAX_BATCH = 25;

const PANEL_QR_SPECS = [
  {
    printedCode: "PANEL-2026-EVENT",
    linkSlug: "sajam-2026-panel-glavni",
    destinationUrl: "https://scanme.rs/sajam/elektromobilnost-2026",
  },
  {
    printedCode: "PANEL-2026-SCANME",
    linkSlug: "sajam-2026-panel-scanme",
    destinationUrl: "https://scanme.rs",
  },
  {
    printedCode: "PANEL-2026-ENIGMAIT",
    linkSlug: "sajam-2026-panel-enigmait",
    destinationUrl: "https://enigmait.rs",
  },
] as const;

const provisionedQr = v.object({
  printedCode: v.string(),
  smqCode: v.string(),
  resolverCode: v.string(),
  shortUrl: v.string(),
  digitalQrId: v.id("digitalQrCodes"),
});

async function requireInventoryActor(ctx: MutationCtx, ownerEmail: string) {
  const normalizedEmail = ownerEmail.trim().toLowerCase();
  const users = await ctx.db.query("users").take(100);
  const actor = users.find(
    (user) => user.email?.trim().toLowerCase() === normalizedEmail && isAdminEmail(user.email),
  );
  if (!actor) throw new Error("fair_print_inventory_admin_missing");
  return actor;
}

async function ensureInventory(ctx: MutationCtx, ownerEmail: string, now: number) {
  const actor = await requireInventoryActor(ctx, ownerEmail);
  const inventory = await createEventOnlyClient(
    ctx,
    {
      accountName: INVENTORY_NAME,
      ownerDisplayName: "ScanMe",
      smkCode: INVENTORY_SMK,
      contact: {
        firstName: "ScanMe",
        lastName: "Admin",
        email: ownerEmail,
        positionTitle: "ScanMe administrator",
      },
      venue: {
        name: INVENTORY_NAME,
        slug: INVENTORY_SLUG,
        smlCode: INVENTORY_SML,
      },
    },
    actor._id,
    now,
  );
  const [account, business] = await Promise.all([
    ctx.db.get(inventory.accountId),
    ctx.db.get(inventory.businessId),
  ]);
  if (!account || !business || business.accountId !== account._id) {
    throw new Error("fair_print_inventory_scope_invalid");
  }
  return { actor, account, business };
}

async function loadExistingQr(
  ctx: MutationCtx,
  digitalQrId: Id<"digitalQrCodes">,
  businessId: Id<"businesses">,
  printedCode: string,
) {
  const digitalQr = await ctx.db.get(digitalQrId);
  if (!digitalQr || digitalQr.businessId !== businessId) {
    throw new Error("fair_print_inventory_qr_scope_invalid");
  }
  const channel = await ctx.db.get(digitalQr.channelId);
  if (!channel || channel.businessId !== businessId) {
    throw new Error("fair_print_inventory_channel_missing");
  }
  return {
    printedCode,
    smqCode: digitalQr.smqCode,
    resolverCode: channel.resolverCode,
    shortUrl: `https://scanme.rs/r/${channel.resolverCode}`,
    digitalQrId,
  };
}

/**
 * Idempotently provisions the 100 immutable QR identities used for print.
 * Run as four batches of 25. SA26 is a human print label; SMQ and resolver
 * identities remain random and are assigned to a fair model later.
 */
export const provisionBatch = internalMutation({
  args: {
    ownerEmail: v.string(),
    startOrdinal: v.number(),
    count: v.number(),
  },
  returns: v.array(provisionedQr),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.startOrdinal) || args.startOrdinal < 1 || args.startOrdinal > 100) {
      throw new Error("fair_print_inventory_start_invalid");
    }
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > MAX_BATCH) {
      throw new Error("fair_print_inventory_count_invalid");
    }
    if (args.startOrdinal + args.count - 1 > 100) {
      throw new Error("fair_print_inventory_range_invalid");
    }

    const now = Date.now();
    const { actor, account, business } = await ensureInventory(ctx, args.ownerEmail, now);
    const displayContext = await accessDisplayContext(ctx, account._id, business._id);
    const rows = [];

    for (let offset = 0; offset < args.count; offset += 1) {
      const ordinal = args.startOrdinal + offset;
      const printedCode = `${PRINT_PREFIX}-${String(ordinal).padStart(3, "0")}`;
      const key = `fair-print-2026:${printedCode}`;
      const payload = { operation: "fair_print_qr", printedCode };
      const prior = await replay(ctx, key, payload);
      if (prior?.digitalQrId) {
        rows.push(await loadExistingQr(ctx, prior.digitalQrId, business._id, printedCode));
        continue;
      }

      const smqCode = await uniqueCode(ctx, "SMQ");
      const subjectId = await ctx.db.insert("accessSubjects", {
        accountId: account._id,
        businessId: business._id,
        destinationKind: "legacy",
        createdAt: now,
        updatedAt: now,
      });
      const subject = await ctx.db.get(subjectId);
      if (!subject) throw new Error("fair_print_inventory_subject_missing");
      const channel = await createChannel(
        ctx,
        subject,
        "qr",
        actor._id,
        now,
        undefined,
        displayContext,
      );
      const digitalQrId = await ctx.db.insert("digitalQrCodes", {
        accountId: account._id,
        businessId: business._id,
        smqCode,
        channelId: channel.channelId,
        originalSubjectId: subjectId,
        createdByUserId: actor._id,
        createdAt: now,
      });
      await ctx.db.patch(subjectId, { digitalQrId });
      await ctx.db.patch(channel.cardId, { label: printedCode, updatedAt: now });
      await ctx.db.patch(channel.channelId, {
        digitalQrId,
        smqCode,
        health: "healthy",
        redirectEnabled: true,
        ...channelProjectionPatch(
          { resolverCode: channel.resolverCode, smqCode, kind: "qr" },
          displayContext,
        ),
      });
      const [updatedSubject, updatedChannel] = await Promise.all([
        ctx.db.get(subjectId),
        ctx.db.get(channel.channelId),
      ]);
      if (!updatedSubject || !updatedChannel) {
        throw new Error("fair_print_inventory_channel_incomplete");
      }
      await syncChannel(
        ctx,
        updatedChannel,
        updatedSubject,
        { kind: "admin", userId: actor._id },
        "fair_print_inventory_created",
        now,
      );
      await writeAdminAudit(ctx, {
        actorUserId: actor._id,
        accountId: account._id,
        businessId: business._id,
        action: "digital_qr_created",
        detail: { digitalQrId, smqCode, printedCode },
        now,
      });
      await remember(ctx, key, payload, { digitalQrId });
      rows.push({
        printedCode,
        smqCode,
        resolverCode: channel.resolverCode,
        shortUrl: `https://scanme.rs/r/${channel.resolverCode}`,
        digitalQrId,
      });
    }
    return rows;
  },
});

/**
 * Idempotently provisions the three reusable panel QR codes. Each code is a
 * canonical digital QR under the fair inventory business and points at its own
 * dynamic link, so the destination can be changed later from the admin UI
 * without reprinting the physical panel.
 */
export const provisionPanels = internalMutation({
  args: { ownerEmail: v.string() },
  returns: v.array(provisionedQr),
  handler: async (ctx, args) => {
    const now = Date.now();
    const { actor, account, business } = await ensureInventory(ctx, args.ownerEmail, now);
    const displayContext = await accessDisplayContext(ctx, account._id, business._id);
    const rows = [];

    for (const spec of PANEL_QR_SPECS) {
      const key = `fair-print-2026:${spec.printedCode}`;
      const payload = {
        operation: "fair_panel_qr",
        printedCode: spec.printedCode,
        destinationUrl: spec.destinationUrl,
      };
      const prior = await replay(ctx, key, payload);
      if (prior?.digitalQrId) {
        rows.push(await loadExistingQr(ctx, prior.digitalQrId, business._id, spec.printedCode));
        continue;
      }

      let dynamicLink = await ctx.db
        .query("dynamicLinks")
        .withIndex("by_slug", (q) => q.eq("slug", spec.linkSlug))
        .unique();
      if (dynamicLink && dynamicLink.businessId !== business._id) {
        throw new Error("fair_panel_link_slug_conflict");
      }
      if (!dynamicLink) {
        const dynamicLinkId = await ctx.db.insert("dynamicLinks", {
          businessId: business._id,
          slug: spec.linkSlug,
          destinationUrl: spec.destinationUrl,
          type: "google_review",
          active: true,
          scanCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        dynamicLink = await ctx.db.get(dynamicLinkId);
      }
      if (!dynamicLink) throw new Error("fair_panel_dynamic_link_missing");

      const smqCode = await uniqueCode(ctx, "SMQ");
      const subjectId = await ctx.db.insert("accessSubjects", {
        accountId: account._id,
        businessId: business._id,
        destinationKind: "legacy",
        createdAt: now,
        updatedAt: now,
      });
      const subject = await ctx.db.get(subjectId);
      if (!subject) throw new Error("fair_print_inventory_subject_missing");
      const channel = await createChannel(
        ctx,
        subject,
        "qr",
        actor._id,
        now,
        undefined,
        displayContext,
      );
      const digitalQrId = await ctx.db.insert("digitalQrCodes", {
        accountId: account._id,
        businessId: business._id,
        smqCode,
        channelId: channel.channelId,
        originalSubjectId: subjectId,
        createdByUserId: actor._id,
        createdAt: now,
      });
      await ctx.db.patch(subjectId, { digitalQrId });
      await ctx.db.patch(channel.cardId, { label: spec.printedCode, updatedAt: now });
      await ctx.db.patch(channel.channelId, {
        digitalQrId,
        smqCode,
        health: "healthy",
        redirectEnabled: true,
        ...channelProjectionPatch(
          { resolverCode: channel.resolverCode, smqCode, kind: "qr" },
          displayContext,
        ),
      });

      const updatedSubject = await ctx.db.get(subjectId);
      if (!updatedSubject) throw new Error("fair_print_inventory_subject_missing");
      const destination = {
        kind: "dynamic_link" as const,
        dynamicLinkId: dynamicLink._id,
      };
      const prepared = await prepareDestination(ctx, business._id, destination);
      await applyDestination(
        ctx,
        updatedSubject,
        destination,
        prepared,
        actor._id,
        "fair_panel_qr_created",
        now,
      );
      await writeAdminAudit(ctx, {
        actorUserId: actor._id,
        accountId: account._id,
        businessId: business._id,
        action: "digital_qr_created",
        detail: {
          digitalQrId,
          smqCode,
          printedCode: spec.printedCode,
          dynamicLinkId: dynamicLink._id,
        },
        now,
      });
      await remember(ctx, key, payload, { digitalQrId });
      rows.push({
        printedCode: spec.printedCode,
        smqCode,
        resolverCode: channel.resolverCode,
        shortUrl: `https://scanme.rs/r/${channel.resolverCode}`,
        digitalQrId,
      });
    }

    return rows;
  },
});
