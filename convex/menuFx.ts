import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, query } from "./_generated/server";
import { jeIspravanDatum, jeIspravanKurs } from "../lib/menu/currency";
import { parseNbsMiddleRate } from "../lib/menu/fx/nbs";

// =============================================================================
// ScanMe Menu V1 (K14, master §5.3, P6) — the informative EUR rate of the
// public menu.
//
//   source     the NBS middle rate for EUR, read as JSON from MENU_FX_URL
//              (lib/menu/fx/nbs.ts parses it). Off unless MENU_FX_ENABLED is
//              exactly "true" and the URL is https: then the action makes no
//              network call at all.
//   refresh    a cron every 6 hours (convex/crons.ts) → refreshRate → storeRate.
//              NBS publishes one list per working day; four runs a day catch
//              it within hours without hammering the source.
//   cache      menuExchangeRates: a row only when the rate or its date
//              changes; the last MENU_FX_KEEP rows are kept.
//   read       `current` — the newest row, one indexed read. It never reads
//              the clock: the renderer decides freshness (lib/menu/currency.ts
//              kursJeSvez, at most 4 Belgrade days), and without a fresh rate
//              the EUR switch does not show.
//
// RSD stays the only price that counts; nothing here changes a price.
// =============================================================================

const PAIR = "EUR_RSD" as const;
/** How many stored rates are kept (about six weeks of working days). */
export const MENU_FX_KEEP = 30;
const FETCH_TIMEOUT_MS = 10_000;

/** The configured source, or null when the rate is switched off or the URL is not https. */
export function fxSource(): string | null {
  if (env.MENU_FX_ENABLED !== "true") return null;
  const raw = env.MENU_FX_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export const current = query({
  args: {},
  returns: v.union(v.null(), v.object({ rate: v.number(), effectiveDate: v.string(), fetchedAt: v.number() })),
  handler: async (ctx) => {
    const row = await ctx.db
      .query("menuExchangeRates")
      .withIndex("by_pair_and_fetchedAt", (q) => q.eq("pair", PAIR))
      .order("desc")
      .first();
    return row ? { rate: row.rate, effectiveDate: row.effectiveDate, fetchedAt: row.fetchedAt } : null;
  },
});

export const storeRate = internalMutation({
  args: { rate: v.number(), effectiveDate: v.string(), fetchedAt: v.number() },
  returns: v.union(v.literal("stored"), v.literal("unchanged"), v.literal("invalid")),
  handler: async (ctx, args) => {
    if (!jeIspravanKurs(args.rate) || !jeIspravanDatum(args.effectiveDate)) return "invalid";
    const latest = await ctx.db
      .query("menuExchangeRates")
      .withIndex("by_pair_and_fetchedAt", (q) => q.eq("pair", PAIR))
      .order("desc")
      .first();
    if (latest && latest.rate === args.rate && latest.effectiveDate === args.effectiveDate) return "unchanged";
    await ctx.db.insert("menuExchangeRates", { pair: PAIR, source: "nbs", ...args });
    const rows = await ctx.db
      .query("menuExchangeRates")
      .withIndex("by_pair_and_fetchedAt", (q) => q.eq("pair", PAIR))
      .order("desc")
      .take(MENU_FX_KEEP + 10);
    for (const row of rows.slice(MENU_FX_KEEP)) await ctx.db.delete(row._id);
    return "stored";
  },
});

export const refreshRate = internalAction({
  args: {},
  returns: v.union(
    v.literal("disabled"),
    v.literal("error"),
    v.literal("invalid"),
    v.literal("stored"),
    v.literal("unchanged"),
  ),
  handler: async (ctx): Promise<"disabled" | "error" | "invalid" | "stored" | "unchanged"> => {
    const source = fxSource();
    if (!source) return "disabled";
    let json: unknown;
    // K34: AbortController + setTimeout like every other outbound call in convex/ (menuAiTranslate,
    // menuMailProviders); `AbortSignal.timeout` may be missing in the runtime, and its TypeError would
    // be swallowed below so the rate would never refresh. The timer covers the body read as well.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(source, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return "error";
      json = await response.json();
    } catch {
      return "error";
    } finally {
      clearTimeout(timer);
    }
    const kurs = parseNbsMiddleRate(json);
    if (!kurs) return "invalid";
    return await ctx.runMutation(internal.menuFx.storeRate, { ...kurs, fetchedAt: Date.now() });
  },
});
