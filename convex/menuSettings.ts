import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { getMenuCapabilities } from "./lib/menuCapabilities";
import { touchDraft } from "./lib/menuDraft";
import { MENU_MAX_LANGUAGES } from "../lib/menu/capabilities";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { MENU_SOURCE_LANGUAGE, checkLanguageChange } from "../lib/menu/languages";
import { isValidLateThreshold, isValidReminder } from "../lib/menu/thresholds";

// =============================================================================
// ScanMe Menu V1 — Settings of a Menu service (K03; master §7.7, §13.9).
// K03 brings the languages: managed in Settings, part of the draft (published
// with the menu, K01 A10), Standard at most two languages per Menu service —
// the source language included — and Premium without a commercial limit
// (lib/menu/capabilities.ts). Later steps add working hours, reservations and
// panel thresholds next to them.
// =============================================================================

function languagesOf(service: Doc<"menuServices">) {
  const stored = service.settings?.languages;
  return {
    source: stored?.source ?? MENU_SOURCE_LANGUAGE,
    translations: stored?.translations ?? [],
  };
}

/** The languages of the service and the account's limit. null for every refusal. */
export const languages = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const capabilities = await getMenuCapabilities(ctx, access.business._id);
    return {
      ...languagesOf(access.menuService),
      maxLanguages: capabilities.maxLanguages,
      tier: capabilities.tier,
    };
  },
});

/**
 * Replaces the translation languages (the source language is implicit and
 * always first). Standard: one translation at most; above the limit — an
 * account that lost Premium — languages can only be removed or reordered.
 */
export const setLanguages = mutation({
  args: { menuServiceId: v.id("menuServices"), translations: v.array(v.string()) },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    const current = languagesOf(access.menuService);
    const next = args.translations.map((code) => code.trim().toLowerCase());
    const capabilities = await getMenuCapabilities(ctx, access.business._id);
    const verdict = checkLanguageChange({
      current: current.translations,
      next,
      maxLanguages: capabilities.maxLanguages,
      technicalMax: MENU_MAX_LANGUAGES,
    });
    if (!verdict.ok) {
      throw new ConvexError(
        verdict.reason === "limit" ? MENU_PLAN_ERROR.languageLimit : MENU_ERROR.invalidInput,
      );
    }
    if (
      next.length === current.translations.length &&
      next.every((code, index) => code === current.translations[index])
    ) {
      return { ok: true as const };
    }

    await ctx.db.patch(access.menuService._id, {
      settings: {
        ...access.menuService.settings,
        languages: { source: current.source, translations: next },
      },
      updatedAt: Date.now(),
    });
    await touchDraft(ctx, access.menuService._id, access.user._id);
    return { ok: true as const };
  },
});

/**
 * K23 — the waiter panel's timing (master §8.5 "Lokal može podesiti vreme
 * podsetnika", §10.4 "Tek nakon podešenog praga"; plan K19-21): the late
 * threshold (1–120 min) and the reminder (0 = off, 1–60 min). Operational,
 * applies at once, never part of the draft. The UI comes in K28 (Podešavanja).
 */
export const setPanelTiming = mutation({
  args: { menuServiceId: v.id("menuServices"), lateThresholdMin: v.number(), reminderMin: v.number() },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "settings.edit");
    if (!isValidLateThreshold(args.lateThresholdMin) || !isValidReminder(args.reminderMin)) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    const current = access.menuService.settings?.panel;
    if (current && current.lateThresholdMin === args.lateThresholdMin && current.reminderMin === args.reminderMin) {
      return { ok: true as const };
    }
    await ctx.db.patch(access.menuService._id, {
      settings: {
        ...access.menuService.settings,
        panel: { lateThresholdMin: args.lateThresholdMin, reminderMin: args.reminderMin },
      },
      updatedAt: Date.now(),
    });
    return { ok: true as const };
  },
});
