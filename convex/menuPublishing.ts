import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { getMenuCapabilities } from "./lib/menuCapabilities";
import { auditActorKind, loadDraftState, touchDraft, writeMenuAudit } from "./lib/menuDraft";
import { loadDraft, type DraftDocs } from "./lib/menuDraftLoad";
import {
  applyRestore,
  restoreChanges,
  restoreDiffs,
  restoreWriteEstimate,
} from "./lib/menuRestore";
import { pageHasActiveQr } from "./menuPages";
import {
  MENU_MAX_RETIRE_PER_PUBLISH,
  MENU_PRUNE_BATCH,
  MENU_RESTORE_MAX_BYTES,
  MENU_RESTORE_MAX_WRITES,
  MENU_RETAINED_VERSIONS,
  MENU_VERSION_MAX_BYTES,
  MENU_VERSION_PART_MAX_BYTES,
  checkVersionBudget,
  hasWriteHeadroom,
} from "../lib/menu/budget";
import type { MenuCapabilities } from "../lib/menu/capabilities";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_VERSION_ERROR } from "../lib/menu/errors/versions";
import { MENU_MAX_ARTICLES } from "../lib/menu/limits";
import {
  checkPublication,
  issuesFingerprint,
  type PublicationCheck,
} from "../lib/menu/publish-checks";
import {
  summarizePublication,
  summaryCounts,
  type MenuPublishSummaryDetail,
} from "../lib/menu/publish-summary";
import { planRestore } from "../lib/menu/restore-plan";
import {
  MENU_INTERNAL_LANG,
  MENU_PART_INTERNAL,
  compileSnapshot,
  parseInternal,
  type MenuDraftSnapshot,
} from "../lib/menu/snapshot";

// =============================================================================
// ScanMe Menu V1 (K05) — draft, publishing, versions and restore (master §6.1;
// recipe §6; K01 §3.3).
//
//   draftStatus      has the draft unpublished changes? (editor, Početna)
//   publishPreview   what publishing now would do: errors, warnings with
//                    their fingerprint, the consequences summary, the budget.
//                    Its `revision` is the draft the person reviewed.
//   publish          ONE transaction: refuses a draft that changed since the
//                    preview (`expectedRevision`, the same or another person),
//                    blocks on errors, needs the warnings' fingerprint, then
//                    writes the immutable version and its parts and only then
//                    moves menuServices.liveVersionId. Any failure rolls back
//                    everything: the public menu never sees half a version.
//   listVersions     the newest 20 versions.
//   restoreVersion   a version back INTO THE DRAFT (the public menu stays as it
//                    is until the next publish). Pages with an active QR link
//                    are never deleted or archived by it; they are reported.
//   pruneVersion     (internal) deletes a retired version in bounded batches;
//                    sweepRetiredVersions is the cron reserve.
//
// Availability ("Privremeno nedostupno") and the Funkcionalnosti switches are
// live layers outside versions (menuAvailability, menuServices.features).
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;

/** Parts of the internal snapshot of one version (its ceiling over the part size). */
const MAX_INTERNAL_PARTS = Math.ceil(MENU_VERSION_MAX_BYTES / MENU_VERSION_PART_MAX_BYTES) + 1;

export type DraftPublishState = "never_published" | "clean" | "dirty";

function publishStateOf(
  menuService: Doc<"menuServices">,
  state: Doc<"menuDraftState">,
): DraftPublishState {
  if (menuService.liveVersionId === undefined) return "never_published";
  return state.publishedRevision === state.revision ? "clean" : "dirty";
}

async function latestVersion(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuVersions"> | null> {
  return await ctx.db
    .query("menuVersions")
    .withIndex("by_menuServiceId_and_number", (q) => q.eq("menuServiceId", menuServiceId))
    .order("desc")
    .first();
}

/** The restorable snapshot stored with a version. */
export async function versionSnapshot(
  ctx: DatabaseCtx,
  versionId: Id<"menuVersions">,
): Promise<MenuDraftSnapshot> {
  const parts = await ctx.db
    .query("menuVersionParts")
    .withIndex("by_versionId_and_scope_and_lang_and_pageKey_and_part", (q) =>
      q
        .eq("versionId", versionId)
        .eq("scope", "internal")
        .eq("lang", MENU_INTERNAL_LANG)
        .eq("pageKey", MENU_PART_INTERNAL),
    )
    .take(MAX_INTERNAL_PARTS);
  return parseInternal(parts.map((row) => row.data));
}

function checkContext(menuService: Doc<"menuServices">, capabilities: MenuCapabilities) {
  return {
    roomServiceSwitch: menuService.features.roomService,
    capabilities: {
      roomService: capabilities.roomService,
      scheduledPromos: capabilities.scheduledPromos,
      maxLanguages: capabilities.maxLanguages,
    },
  };
}

type Preparation = {
  docs: DraftDocs;
  snapshot: MenuDraftSnapshot;
  capabilities: MenuCapabilities;
  check: PublicationCheck;
  summary: MenuPublishSummaryDetail;
};

/** Reads the whole draft and the live version once and checks the publication. */
async function prepare(ctx: DatabaseCtx, menuService: Doc<"menuServices">): Promise<Preparation> {
  const { docs, snapshot } = await loadDraft(ctx, menuService);
  const capabilities = await getMenuCapabilities(ctx, menuService.businessId);
  const check = checkPublication(snapshot, checkContext(menuService, capabilities));
  const previous = menuService.liveVersionId
    ? await versionSnapshot(ctx, menuService.liveVersionId)
    : null;
  return { docs, snapshot, capabilities, check, summary: summarizePublication(previous, snapshot) };
}

/** Whether publishing now would change anything for guests. */
async function wouldChangeLive(
  ctx: DatabaseCtx,
  menuService: Doc<"menuServices">,
  state: Doc<"menuDraftState">,
  publicHash: string,
): Promise<boolean> {
  if (publishStateOf(menuService, state) !== "clean") return true;
  const live = menuService.liveVersionId ? await ctx.db.get(menuService.liveVersionId) : null;
  return live?.publicHash !== publicHash;
}

async function lastEditor(ctx: DatabaseCtx, userId: Id<"users"> | undefined) {
  if (!userId) return null;
  const user = await ctx.db.get(userId);
  return { userId, name: user?.name ?? user?.email ?? null };
}

// -----------------------------------------------------------------------------
// Status and preview
// -----------------------------------------------------------------------------

/**
 * "Ima / nema neobjavljenih izmena" for the editor and Početna (master §6.1).
 * `state`: never_published | clean | dirty. null for every refusal.
 */
export const draftStatus = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const { menuService } = access;
    const state = await loadDraftState(ctx, menuService._id);
    const live = menuService.liveVersionId ? await ctx.db.get(menuService.liveVersionId) : null;
    const editor = await lastEditor(ctx, state.lastEditByUserId);
    const publishState = publishStateOf(menuService, state);
    return {
      state: publishState,
      hasUnpublishedChanges: publishState !== "clean",
      revision: state.revision,
      publishedRevision: state.publishedRevision ?? null,
      liveVersionNumber: menuService.liveVersionNumber ?? null,
      livePublishedAt: live?.publishedAt ?? null,
      restoredFromNumber: state.restoredFromNumber ?? null,
      lastEditAt: state.lastEditAt,
      lastEditBy: editor ? { ...editor, isMe: editor.userId === access.user._id } : null,
    };
  },
});

/**
 * Everything the publish dialog shows before `Objavi`: the revision reviewed,
 * errors (block), warnings and their fingerprint (confirm exactly these), the
 * consequences summary and whether the version fits its budget. null for
 * every refusal.
 */
export const publishPreview = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const { menuService } = access;
    const state = await loadDraftState(ctx, menuService._id);
    let prep: Preparation;
    try {
      prep = await prepare(ctx, menuService);
    } catch (error) {
      // A draft over the load ceilings: the dialog explains it instead of crashing.
      if (error instanceof ConvexError && error.data === MENU_VERSION_ERROR.publishTooLarge) {
        return {
          revision: state.revision,
          state: publishStateOf(menuService, state),
          liveVersionNumber: menuService.liveVersionNumber ?? null,
          wouldChange: true,
          canPublish: false,
          ok: false,
          tooLarge: true,
          errors: [],
          warnings: [],
          fingerprint: issuesFingerprint([]),
          languages: [],
          roomService: false,
          summary: null,
          budget: { ok: false, bytes: null, parts: null },
        };
      }
      throw error;
    }
    const compiled = compileSnapshot(prep.snapshot, {
      languages: prep.check.languages.languages,
      roomService: prep.check.roomServicePublished,
      scheduledPromos: prep.capabilities.scheduledPromos,
      extraLayouts: prep.capabilities.extraLayouts,
      reducedBranding: prep.capabilities.reducedBranding,
    });
    const budget = checkVersionBudget(compiled.parts);
    return {
      revision: state.revision,
      state: publishStateOf(menuService, state),
      // Publishing would change what guests get (false = it would be refused as no_changes).
      wouldChange: await wouldChangeLive(ctx, menuService, state, compiled.publicHash),
      liveVersionNumber: menuService.liveVersionNumber ?? null,
      canPublish: access.permissions.includes("menu.publish") && access.canEdit,
      ok: prep.check.ok && budget.ok,
      tooLarge: !budget.ok,
      errors: prep.check.errors,
      warnings: prep.check.warnings,
      fingerprint: prep.check.fingerprint,
      languages: prep.check.languages.languages,
      roomService: prep.check.roomServicePublished,
      summary: prep.summary,
      budget: { ok: budget.ok, bytes: compiled.bytes, parts: compiled.parts.length },
    };
  },
});

// -----------------------------------------------------------------------------
// Publish
// -----------------------------------------------------------------------------

export type PublishArgs = {
  expectedRevision: number;
  acknowledgedWarnings?: string;
};

/** Test-only fault injection; no public function can pass it. */
export type PublishHooks = { afterPartsWritten?: () => void | Promise<void> };

/**
 * The publication itself (the `publish` mutation after authorization). Kept
 * separate so a test can inject a failure in the middle and prove that the
 * transaction leaves the public menu untouched.
 */
export async function executePublish(
  ctx: MutationCtx,
  actor: { menuService: Doc<"menuServices">; userId: Id<"users">; actorKind: "admin" | "user" },
  args: PublishArgs,
  hooks: PublishHooks = {},
) {
  const { menuService, userId } = actor;
  const state = await loadDraftState(ctx, menuService._id);
  if (state.revision !== args.expectedRevision) {
    return {
      ok: false as const,
      reason: "stale_draft" as const,
      revision: state.revision,
      lastEditAt: state.lastEditAt,
      lastEditBy: await lastEditor(ctx, state.lastEditByUserId),
    };
  }
  const prep = await prepare(ctx, menuService);
  const { check } = prep;
  const compiled = compileSnapshot(prep.snapshot, {
    languages: check.languages.languages,
    roomService: check.roomServicePublished,
    scheduledPromos: prep.capabilities.scheduledPromos,
    extraLayouts: prep.capabilities.extraLayouts,
    reducedBranding: prep.capabilities.reducedBranding,
  });
  // Nothing to publish only when the draft is the live one AND guests would
  // get exactly the live output (a Room service switch or a lost Premium
  // changes the output of an unchanged draft).
  if (!(await wouldChangeLive(ctx, menuService, state, compiled.publicHash))) {
    return { ok: false as const, reason: "no_changes" as const, revision: state.revision };
  }
  if (!check.ok) {
    return {
      ok: false as const,
      reason: "validation_failed" as const,
      errors: check.errors,
      warnings: check.warnings,
      fingerprint: check.fingerprint,
    };
  }
  if (check.warnings.length > 0 && args.acknowledgedWarnings !== check.fingerprint) {
    return {
      ok: false as const,
      reason: "confirmation_required" as const,
      warnings: check.warnings,
      fingerprint: check.fingerprint,
    };
  }

  if (!checkVersionBudget(compiled.parts).ok) throw new ConvexError(MENU_VERSION_ERROR.publishTooLarge);
  const metrics = await ctx.meta.getTransactionMetrics();
  if (
    !hasWriteHeadroom(
      {
        documentsWritten: metrics.documentsWritten.remaining,
        bytesWritten: metrics.bytesWritten.remaining,
      },
      { documents: compiled.parts.length + 1, bytes: compiled.bytes },
    )
  ) {
    throw new ConvexError(MENU_VERSION_ERROR.publishTooLarge);
  }

  const now = Date.now();
  const number = ((await latestVersion(ctx, menuService._id))?.number ?? 0) + 1;
  const summary = summaryCounts(prep.summary);
  // 1. The immutable version and all of its parts…
  const versionId = await ctx.db.insert("menuVersions", {
    menuServiceId: menuService._id,
    number,
    publishedAt: now,
    publishedByUserId: userId,
    actorKind: actor.actorKind,
    draftRevision: state.revision,
    summary,
    ...(state.restoredFromNumber !== undefined ? { restoredFromNumber: state.restoredFromNumber } : {}),
    languages: compiled.languages,
    pageCount: compiled.publicPageCount,
    articleCount: compiled.publicArticleCount,
    bytes: compiled.bytes,
    partCount: compiled.parts.length,
    formatVersion: prep.snapshot.formatVersion,
    contentHash: compiled.contentHash,
    publicHash: compiled.publicHash,
  });
  for (const part of compiled.parts) {
    await ctx.db.insert("menuVersionParts", {
      versionId,
      menuServiceId: menuService._id,
      scope: part.scope,
      lang: part.lang,
      pageKey: part.pageKey,
      part: part.part,
      data: part.data,
    });
  }
  await hooks.afterPartsWritten?.();

  // 2. …then the pointer guests read.
  await ctx.db.patch(menuService._id, {
    liveVersionId: versionId,
    liveVersionNumber: number,
    updatedAt: now,
  });
  await ctx.db.patch(state._id, { publishedRevision: state.revision, restoredFromNumber: undefined });

  // 3. Keep the newest MENU_RETAINED_VERSIONS: retire the ones pushed out
  //    (bounded: normally exactly one) and delete them in the background.
  const pushedOut = await ctx.db
    .query("menuVersions")
    .withIndex("by_menuServiceId_and_number", (q) =>
      q.eq("menuServiceId", menuService._id).lte("number", number - MENU_RETAINED_VERSIONS),
    )
    .order("desc")
    .take(MENU_MAX_RETIRE_PER_PUBLISH);
  for (const old of pushedOut) {
    if (old.retiredAt !== undefined) continue;
    await ctx.db.patch(old._id, { retiredAt: now });
    await ctx.scheduler.runAfter(0, internal.menuPublishing.pruneVersion, { versionId: old._id });
  }

  // 4. Availability rows of articles that no longer exist in the published
  //    menu (a draft deletion keeps the row until this moment, so the live
  //    menu never changes before Objavi).
  const articleKeys = new Set(prep.snapshot.articles.map((article) => article.key));
  const availability = await ctx.db
    .query("menuAvailability")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuService._id))
    .take(MENU_MAX_ARTICLES + 1);
  for (const row of availability) {
    if (!articleKeys.has(row.articleKey)) await ctx.db.delete(row._id);
  }

  await writeMenuAudit(ctx, {
    menuServiceId: menuService._id,
    actorKind: actor.actorKind,
    actorUserId: userId,
    action: "version.published",
    entityType: "menuVersions",
    entityKey: String(number),
    details: {
      number,
      draftRevision: state.revision,
      changedPrices: summary.changedPrices,
      newArticles: summary.newArticles,
      removedArticles: summary.removedArticles,
      warnings: check.warnings.length,
    },
  });

  return {
    ok: true as const,
    versionId,
    versionNumber: number,
    revision: state.revision,
    summary: prep.summary,
  };
}

/**
 * Objavi (master §6.1). `expectedRevision` is the `revision` of the preview
 * the person reviewed; `acknowledgedWarnings` the preview's `fingerprint`
 * when it had warnings. A refusal is returned (`ok: false` with a reason) and
 * writes nothing; access errors and menu/publish_too_large are thrown.
 */
export const publish = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    expectedRevision: v.number(),
    acknowledgedWarnings: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.publish");
    return await executePublish(
      ctx,
      { menuService: access.menuService, userId: access.user._id, actorKind: auditActorKind(access.actor) },
      { expectedRevision: args.expectedRevision, acknowledgedWarnings: args.acknowledgedWarnings },
    );
  },
});

// -----------------------------------------------------------------------------
// Versions
// -----------------------------------------------------------------------------

/** The newest 20 published versions, newest first. null for every refusal. */
export const listVersions = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const { menuService } = access;
    const rows = await ctx.db
      .query("menuVersions")
      .withIndex("by_menuServiceId_and_number", (q) => q.eq("menuServiceId", menuService._id))
      .order("desc")
      .take(MENU_RETAINED_VERSIONS + MENU_MAX_RETIRE_PER_PUBLISH);
    const versions = rows.filter((row) => row.retiredAt === undefined).slice(0, MENU_RETAINED_VERSIONS);
    const names = new Map<Id<"users">, string | null>();
    for (const row of versions) {
      if (names.has(row.publishedByUserId)) continue;
      const user = await ctx.db.get(row.publishedByUserId);
      names.set(row.publishedByUserId, user?.name ?? user?.email ?? null);
    }
    return {
      liveVersionNumber: menuService.liveVersionNumber ?? null,
      versions: versions.map((row) => ({
        versionId: row._id,
        number: row.number,
        publishedAt: row.publishedAt,
        publishedBy: { userId: row.publishedByUserId, name: names.get(row.publishedByUserId) ?? null },
        summary: row.summary,
        restoredFromNumber: row.restoredFromNumber ?? null,
        languages: row.languages,
        pageCount: row.pageCount,
        articleCount: row.articleCount,
        isLive: row._id === menuService.liveVersionId,
      })),
    };
  },
});

/** Images that no longer exist (or belong to another business) become an icon or nothing. */
async function dropMissingImages(
  ctx: MutationCtx,
  snapshot: MenuDraftSnapshot,
  businessId: Id<"businesses">,
): Promise<number> {
  let dropped = 0;
  for (const article of snapshot.articles) {
    if (article.imageMediaId === null) continue;
    const mediaId = ctx.db.normalizeId("mediaAssets", article.imageMediaId);
    const media = mediaId ? await ctx.db.get(mediaId) : null;
    if (media && media.businessId === businessId && media.status === "ready") continue;
    article.imageMediaId = null;
    if (article.mediaMode === "image") article.mediaMode = article.iconKey ? "icon" : "none";
    dropped += 1;
  }
  return dropped;
}

/**
 * Vraćanje verzije: version `versionNumber` becomes the NEW DRAFT. The public
 * menu does not change until the next publish. `expectedRevision` protects
 * newer draft edits of anyone (a stale call is refused). A page with an active
 * QR link is never deleted or archived: it is kept and reported in
 * `keptPages`. Refusals are returned; access errors, menu/not_found (unknown
 * or retired version) and menu/restore_too_large are thrown.
 */
export const restoreVersion = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    versionNumber: v.number(),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.publish");
    const { menuService } = access;
    const state = await loadDraftState(ctx, menuService._id);
    if (state.revision !== args.expectedRevision) {
      return {
        ok: false as const,
        reason: "stale_draft" as const,
        revision: state.revision,
        lastEditAt: state.lastEditAt,
        lastEditBy: await lastEditor(ctx, state.lastEditByUserId),
      };
    }
    const version = await ctx.db
      .query("menuVersions")
      .withIndex("by_menuServiceId_and_number", (q) =>
        q.eq("menuServiceId", menuService._id).eq("number", args.versionNumber),
      )
      .unique();
    if (!version || version.retiredAt !== undefined) throw new ConvexError(MENU_ERROR.notFound);

    const target = await versionSnapshot(ctx, version._id);
    const { docs, snapshot: current } = await loadDraft(ctx, menuService);

    // Only pages the restore would delete or archive need the QR check.
    const targetPages = new Map(target.pages.map((page) => [page.key, page]));
    const protectedPages = new Set<string>();
    for (const page of current.pages) {
      const inVersion = targetPages.get(page.key);
      const wouldGo = !inVersion || (inVersion.archivedAt !== null && page.archivedAt === null);
      if (wouldGo && (await pageHasActiveQr(ctx, menuService._id, menuService.businessId, page.key))) {
        protectedPages.add(page.key);
      }
    }

    const plan = planRestore(current, target, protectedPages);
    const droppedImages = await dropMissingImages(ctx, plan.final, menuService.businessId);
    if (plan.final.articles.length > MENU_MAX_ARTICLES) throw new ConvexError(MENU_ERROR.limitReached);

    const diffs = restoreDiffs(current, plan.final);
    const estimate = restoreWriteEstimate(diffs, plan.final);
    const metrics = await ctx.meta.getTransactionMetrics();
    if (
      estimate.documents > MENU_RESTORE_MAX_WRITES ||
      estimate.bytes > MENU_RESTORE_MAX_BYTES ||
      !hasWriteHeadroom(
        {
          documentsWritten: metrics.documentsWritten.remaining,
          bytesWritten: metrics.bytesWritten.remaining,
        },
        estimate,
      )
    ) {
      throw new ConvexError(MENU_VERSION_ERROR.restoreTooLarge);
    }

    // Restoring the live version exactly is "discard the draft changes": the
    // draft equals what guests see, so it has no unpublished changes.
    const equalsLive =
      version._id === menuService.liveVersionId &&
      plan.keptPages.length === 0 &&
      plan.renamedSlugs.length === 0 &&
      droppedImages === 0;
    const changes = restoreChanges(diffs);
    const now = Date.now();

    let revision = state.revision;
    if (changes > 0) {
      await applyRestore(ctx, { menuService, docs, final: plan.final, diffs, userId: access.user._id, now });
      revision = await touchDraft(ctx, menuService._id, access.user._id, {
        articleDelta: plan.final.articles.length - state.articleCount,
      });
    }
    // A no-op restore writes nothing; restoring the live version into a draft
    // that only differs in its bookkeeping (dirty revision, a restore marker)
    // marks it clean.
    const marksClean =
      equalsLive && (state.publishedRevision !== state.revision || state.restoredFromNumber !== undefined);
    if (changes > 0 || marksClean) {
      await ctx.db.patch(state._id, {
        restoredFromNumber: equalsLive ? undefined : version.number,
        ...(equalsLive ? { publishedRevision: revision } : {}),
      });
      await writeMenuAudit(ctx, {
        menuServiceId: menuService._id,
        actorKind: auditActorKind(access.actor),
        actorUserId: access.user._id,
        action: "version.restored",
        entityType: "menuVersions",
        entityKey: String(version.number),
        details: {
          number: version.number,
          changes,
          keptPages: plan.keptPages.length,
          droppedImages,
        },
      });
    }

    return {
      ok: true as const,
      versionNumber: version.number,
      revision,
      changes,
      state: equalsLive ? ("clean" as const) : ("dirty" as const),
      keptPages: plan.keptPages,
      renamedSlugs: plan.renamedSlugs,
      droppedImages,
    };
  },
});

// -----------------------------------------------------------------------------
// Retention (internal)
// -----------------------------------------------------------------------------

/**
 * Deletes one RETIRED version: its parts in batches of MENU_PRUNE_BATCH (a
 * continuation per batch), then the version row. Never touches a version that
 * is not retired or is live. Idempotent.
 */
export const pruneVersion = internalMutation({
  args: { versionId: v.id("menuVersions") },
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId);
    if (!version || version.retiredAt === undefined) return null;
    const service = await ctx.db.get(version.menuServiceId);
    if (service?.liveVersionId === version._id) return null;
    const parts = await ctx.db
      .query("menuVersionParts")
      .withIndex("by_versionId_and_scope_and_lang_and_pageKey_and_part", (q) =>
        q.eq("versionId", version._id),
      )
      .take(MENU_PRUNE_BATCH);
    for (const part of parts) await ctx.db.delete(part._id);
    if (parts.length === MENU_PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.menuPublishing.pruneVersion, { versionId: version._id });
      return null;
    }
    await ctx.db.delete(version._id);
    return null;
  },
});

/** A retired version still present after this long lost its continuation. */
const PRUNE_STALE_MS = 10 * 60 * 1000;
const SWEEP_BATCH = 20;

/** Cron reserve: restarts pruning of retired versions whose continuation was lost. */
export const sweepRetiredVersions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PRUNE_STALE_MS;
    const stale = await ctx.db
      .query("menuVersions")
      .withIndex("by_retiredAt", (q) => q.gt("retiredAt", 0).lt("retiredAt", cutoff))
      .take(SWEEP_BATCH);
    for (const version of stale) {
      await ctx.scheduler.runAfter(0, internal.menuPublishing.pruneVersion, { versionId: version._id });
    }
    return null;
  },
});
