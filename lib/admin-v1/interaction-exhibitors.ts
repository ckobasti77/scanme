// Izlagači 2026 — `interakcije`: one card per exhibitor (participation) with
// what its interactions need. Pure: built from the event catalog, the
// directory (name, logo, website), the interaction data (getEventInteractions)
// and the passport overview the screen already loads. The package belongs to
// a car model (MASTER §4.4), so an exhibitor "has interactions" when at least
// one of its cars has Starter or Napredni.

import type { FairModelStatus, FairPackageTier } from "@/lib/fair-contract";
import { audienceQuota, defaultAudienceDayId, type QuotaDay, type QuotaQuestion } from "./audience-quota";
import type { InteractionPart } from "./event-sections";
import { matchesSearch, normalizeSearch } from "./hierarchy";
import { PASSPORT_STATE_OF_PARAM, PASSPORT_STATE_VALUES, type PassportState, type PassportStateParam } from "./passport-overview";
import { parseAdminQuery, type AdminQueryKey, type AdminQueryPatch, type AdminQueryState } from "./query-state";

/** `?paket=` of the list: absent = only exhibitors with interactions (the default view). */
export const INTERACTION_PACKAGE_VALUES = ["svi", "napredni", "starter", "za-sve"] as const;
export type InteractionPackageFilter = "interakcije" | (typeof INTERACTION_PACKAGE_VALUES)[number];

export function interactionPackageFilter(value: string | undefined): InteractionPackageFilter {
  return value && (INTERACTION_PACKAGE_VALUES as readonly string[]).includes(value) ? (value as InteractionPackageFilter) : "interakcije";
}

export type InteractionExhibitorSource = {
  /** A withdrawn participation is not listed. */
  participations: { id: string; accountId: string; businessId: string; externalKey: string; status?: string }[];
  models: { id: string; participationId: string; brandId: string; tier: FairPackageTier; packageActivatedAt: number; status: FairModelStatus }[];
  accounts: ReadonlyMap<string, { name: string; websiteUrl: string | null }>;
  businesses: ReadonlyMap<string, { name: string; logoUrl: string | null }>;
  brands: ReadonlyMap<string, string>;
  days: readonly (QuotaDay & { dateKey: string; label: string })[];
  /** undefined = interaction data still loading. */
  questions?: readonly QuotaQuestion[];
  surveys?: readonly { modelId: string; status: string }[];
  /** Brand passports with their exhibitor and state; undefined = still loading. */
  passports?: readonly { exhibitorId: string | null; brandId: string; state: PassportState }[];
};

export type InteractionExhibitorRow = {
  id: string;
  accountId: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  brands: string[];
  /** Live (not withdrawn) cars by package. */
  models: Record<FairPackageTier, number> & { total: number };
  /** At least one live car with Starter or Napredni. */
  hasInteractions: boolean;
  /** Glas publike on `day`: cars entitled that day and how many already have a published question. null = no data yet. */
  questions: { covered: number; required: number } | null;
  /** Ankete: Napredni cars and how many have a published survey. null = no data yet. */
  surveys: { published: number; advanced: number } | null;
  /** Brand passports of the exhibitor. null = no data yet. */
  passports: PassportState[] | null;
  searchText: string;
};

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

/** The fair day the cards report Glas publike for: `?dan=`, else today, else the next fair day, else the first. */
export function interactionReportDay<T extends QuotaDay & { dateKey: string }>(days: readonly T[], now: number, dateKey?: string): T | undefined {
  const wanted = dateKey ? days.find((day) => day.dateKey === dateKey)?.id : undefined;
  const id = defaultAudienceDayId(days, now, wanted);
  return days.find((day) => day.id === id);
}

export function buildInteractionExhibitorRows(source: InteractionExhibitorSource, now: number, dateKey?: string): InteractionExhibitorRow[] {
  const day = interactionReportDay(source.days, now, dateKey);
  // Judged at the later of now and the day's start: today a package counts once it has started, on a later day if it runs when that day starts.
  const at = day ? Math.max(now, day.startsAt) : now;
  return source.participations
    .filter((participation) => participation.status !== "withdrawn")
    .map((participation) => {
      const account = source.accounts.get(participation.accountId);
      const business = source.businesses.get(participation.businessId);
      const name = business?.name ?? account?.name ?? participation.externalKey;
      const live = source.models.filter((model) => model.participationId === participation.id && model.status !== "withdrawn");
      const brands = [...new Set(live.map((model) => source.brands.get(model.brandId) ?? "—"))].sort(collator.compare);
      const models = {
        total: live.length,
        included: live.filter((model) => model.tier === "included").length,
        starter: live.filter((model) => model.tier === "starter").length,
        advanced: live.filter((model) => model.tier === "advanced").length,
      };
      let questions: InteractionExhibitorRow["questions"] = null;
      if (source.questions && day) {
        const entitled = live.filter((model) => audienceQuota(model, day.id, source.questions!, at).limit > 0);
        questions = { required: entitled.length, covered: entitled.filter((model) => audienceQuota(model, day.id, source.questions!, at).used > 0).length };
      }
      let surveys: InteractionExhibitorRow["surveys"] = null;
      if (source.surveys) {
        const advanced = live.filter((model) => model.tier === "advanced");
        const published = new Set(source.surveys.filter((survey) => survey.status === "published").map((survey) => survey.modelId));
        surveys = { advanced: advanced.length, published: advanced.filter((model) => published.has(model.id)).length };
      }
      const passports = source.passports ? source.passports.filter((row) => row.exhibitorId === participation.id).map((row) => row.state) : null;
      return {
        id: participation.id,
        accountId: participation.accountId,
        name,
        logoUrl: business?.logoUrl ?? null,
        websiteUrl: account?.websiteUrl ?? null,
        brands,
        models,
        hasInteractions: models.starter + models.advanced > 0,
        questions,
        surveys,
        passports,
        searchText: normalizeSearch([name, account?.name ?? "", ...brands].join(" ")),
      };
    })
    .sort((a, b) => Number(b.hasInteractions) - Number(a.hasInteractions) || collator.compare(a.name, b.name));
}

function matchesPackage(row: InteractionExhibitorRow, filter: InteractionPackageFilter): boolean {
  switch (filter) {
    case "interakcije": return row.hasInteractions;
    case "svi": return true;
    case "napredni": return row.models.advanced > 0;
    case "starter": return row.models.starter > 0;
    case "za-sve": return !row.hasInteractions;
  }
}

function passportStateParam(query: AdminQueryState): PassportState | null {
  const value = query.stanje;
  return value && (PASSPORT_STATE_VALUES as readonly string[]).includes(value) ? PASSPORT_STATE_OF_PARAM[value as PassportStateParam] : null;
}

/** `?paket=` (default: with interactions), `?q=` and, from the dashboard, `?stanje=` (a brand passport in that state). */
export function applyInteractionExhibitorFilters(rows: readonly InteractionExhibitorRow[], query: AdminQueryState): InteractionExhibitorRow[] {
  const filter = interactionPackageFilter(query.paket);
  const passport = passportStateParam(query);
  return rows.filter((row) => matchesPackage(row, filter)
    && matchesSearch(row.searchText, query.q)
    && (!passport || (row.passports ?? []).includes(passport)));
}

/** Rows per package filter under the search and the passport filter (facet counts). */
export function interactionPackageCounts(rows: readonly InteractionExhibitorRow[], query: AdminQueryState): Record<InteractionPackageFilter, number> {
  const base = applyInteractionExhibitorFilters(rows, { ...query, paket: "svi" });
  return {
    interakcije: base.filter((row) => matchesPackage(row, "interakcije")).length,
    svi: base.length,
    napredni: base.filter((row) => matchesPackage(row, "napredni")).length,
    starter: base.filter((row) => matchesPackage(row, "starter")).length,
    "za-sve": base.filter((row) => matchesPackage(row, "za-sve")).length,
  };
}

/** "Očisti" keeps the default view (with interactions). */
export function clearInteractionExhibitorFiltersPatch(): AdminQueryPatch {
  return { q: null, paket: null, stanje: null };
}

/** The packages a car can still move to (only upgrades; MASTER §4.4). */
export function upgradeTargets(tier: FairPackageTier): FairPackageTier[] {
  return tier === "included" ? ["starter", "advanced"] : tier === "starter" ? ["advanced"] : [];
}

/** Cars of one exhibitor that a bulk "all to <tier>" would upgrade (live cars below the tier). */
export function bulkUpgradeModels<T extends { tier: FairPackageTier; status: FairModelStatus }>(models: readonly T[], to: "starter" | "advanced"): T[] {
  return models.filter((model) => model.status !== "withdrawn" && upgradeTargets(model.tier).includes(to));
}

// -----------------------------------------------------------------------------
// The exhibitor's page: list filters kept for "Svi izlagači", and the query each part sees
// -----------------------------------------------------------------------------

/** Keys of the list that travel to the exhibitor's page and back (filters, the report day, the view). */
const LIST_KEYS: readonly AdminQueryKey[] = ["paket", "q", "stanje", "dan", "prikaz"];

export function interactionListQuery(query: AdminQueryState): AdminQueryState {
  return parseAdminQuery(query, LIST_KEYS);
}

/**
 * The page keys each part owns, as `[page key, key the part's view reads]`.
 * Glas publike keeps the A6 keys; Ankete and Forme read `model` from their
 * own key, so choosing a car in one part does not open it in another.
 */
const PART_KEYS: Record<InteractionPart, readonly [page: AdminQueryKey, view: AdminQueryKey][]> = {
  "glas-publike": [["model", "model"], ["dan", "dan"], ["status", "status"]],
  ankete: [["anketa", "model"]],
  pasos: [["brend", "brend"], ["stanje", "stanje"]],
  forme: [["forma", "model"]],
};

/** The query one part's view sees on the exhibitor's page. */
export function interactionPartQuery(part: InteractionPart, query: AdminQueryState): AdminQueryState {
  const view: AdminQueryState = {};
  for (const [page, key] of PART_KEYS[part]) if (query[page] !== undefined) view[key] = query[page];
  return view;
}

/** A part's change in page keys; keys the part does not own (e.g. `izlagac`, fixed by the page) are dropped. */
export function interactionPartPatch(part: InteractionPart, patch: AdminQueryPatch): AdminQueryPatch {
  const next: AdminQueryPatch = {};
  for (const [page, key] of PART_KEYS[part]) if (key in patch) next[page] = patch[key];
  return next;
}

/** Glas publike / Ankete data of one exhibitor: its cars and only their questions and surveys. */
export function scopeToExhibitor<V extends { models: readonly { id: string; exhibitorId: string }[]; questions: readonly { modelId: string }[]; surveys: readonly { modelId: string }[] }>(view: V, participationId: string): V {
  const models = view.models.filter((model) => model.exhibitorId === participationId);
  const ids = new Set(models.map((model) => model.id));
  return { ...view, models, questions: view.questions.filter((row) => ids.has(row.modelId)), surveys: view.surveys.filter((row) => ids.has(row.modelId)) };
}
