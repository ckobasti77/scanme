// The ScanMe pricing engine (RFC-002 §2.1, TASK-01).
//
// A PURE FUNCTION. No I/O, no clock, no randomness, no framework, no Convex.
// The price depends on the chosen SET of services and the account plan — never
// on the order they were clicked, never on purchase history, never on the date.
// Two customers with the same selection pay the same, always.
//
// The identical file is imported by the marketing page, by the server at
// checkout, and by the invoice (RFC-002 §2.1). If those three ever computed a
// different number that would not be a bug, it would be a legal problem — which
// is why the algorithm is exhaustive enumeration rather than a heuristic, why
// every intermediate value is an integer, and why the four invariants below
// THROW instead of quietly selling below cost.
//
// The algorithm, per RFC-002 §2.1:
//   1. Group the items by period. A discount only ever applies within a group.
//   2. Per group, enumerate every decomposition into {named packages} ∪
//      {individual services} and keep the cheapest for the buyer.
//   3. On the services left outside every package, apply the position ladder,
//      the most expensive service holding the 0% rung.
//   4. Sum the groups, then add the plan line.
//
// Step 2 is written as an enumeration over SUBSETS OF PACKAGES rather than over
// subsets of services. It is the same enumeration and the same optimum: a
// package is a fixed service set, so a decomposition is fully determined by
// which pairwise-disjoint packages it names, and every service outside them
// falls to the ladder. With three packages that is 2^3 = 8 candidates per group
// instead of 2^5 = 32 — exhaustive either way, and provably optimal, which is
// the product promise ("there is no way to pay more by arriving at the same set
// through a different door"), not an optimization.

import {
  BILLING_PERIODS,
  DEFAULT_PRICING_CONSTANTS,
  PRICING_ENGINE_VERSION,
  SERVICE_IDS,
  type PackageDefinition,
  type PricingConstants,
} from "./constants";
import type {
  BillingPeriod,
  PackageAttribution,
  PeriodGroupTotals,
  PlanId,
  PlanLine,
  PriceBreakdown,
  PriceInput,
  PriceItem,
  PriceLine,
  Rsd,
  ServiceId,
} from "./types";

export * from "./types";
export {
  BILLING_PERIODS,
  DEFAULT_PRICING_CONSTANTS,
  PRICING_ENGINE_VERSION,
  SERVICE_IDS,
  type PackageDefinition,
  type PricingConstants,
} from "./constants";

/** A cart the engine refuses to price: a malformed input. */
export class PricingInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingInputError";
  }
}

/** A cart the engine refuses to SELL: the constants produced a result that
 *  breaks one of the four hard invariants (RFC-002 §2.1). This is the throw
 *  that stands between a bad constant edit and a real customer. */
export class PricingInvariantError extends Error {
  readonly invariant: number;
  constructor(invariant: number, message: string) {
    super(`Invarijanta ${invariant}: ${message}`);
    this.name = "PricingInvariantError";
    this.invariant = invariant;
  }
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const SERVICE_INDEX: ReadonlyMap<ServiceId, number> = new Map(
  SERVICE_IDS.map((service, index) => [service, index]),
);

const PLAN_IDS: readonly PlanId[] = ["basic", "premium", "enterprise"];

function serviceIndex(service: ServiceId): number {
  return SERVICE_INDEX.get(service) ?? 0;
}

function validateInput(input: PriceInput): readonly PriceItem[] {
  if (!input || !Array.isArray(input.items)) {
    throw new PricingInputError("items mora biti niz.");
  }
  if (input.items.length === 0) {
    throw new PricingInputError("Korpa mora imati bar jednu uslugu.");
  }
  if (!PLAN_IDS.includes(input.plan)) {
    throw new PricingInputError(`Nepoznat plan: ${String(input.plan)}.`);
  }
  const seen = new Set<ServiceId>();
  for (const item of input.items) {
    if (!SERVICE_INDEX.has(item?.service)) {
      throw new PricingInputError(`Nepoznata usluga: ${String(item?.service)}.`);
    }
    if (item.period !== "monthly" && item.period !== "annual") {
      throw new PricingInputError(`Nepoznat period: ${String(item?.period)}.`);
    }
    if (seen.has(item.service)) {
      // Not a quantity model: a location owns a service or it does not. Two
      // rows for one service would also make "the same set" ambiguous, which
      // the purity promise cannot survive.
      throw new PricingInputError(`Usluga ${item.service} je navedena dva puta.`);
    }
    seen.add(item.service);
  }
  if (input.plan === "premium" && !input.planPeriod) {
    throw new PricingInputError("Premium plan zahteva planPeriod.");
  }
  if (input.plan !== "premium" && input.planPeriod !== undefined) {
    throw new PricingInputError(`Plan ${input.plan} ne sme imati planPeriod.`);
  }
  if (
    input.planPeriod !== undefined &&
    input.planPeriod !== "monthly" &&
    input.planPeriod !== "annual"
  ) {
    throw new PricingInputError(`Nepoznat planPeriod: ${String(input.planPeriod)}.`);
  }
  // Canonical order: the ONLY ordering the rest of the engine ever sees.
  return [...input.items].sort(
    (a, b) =>
      BILLING_PERIODS.indexOf(a.period) - BILLING_PERIODS.indexOf(b.period) ||
      serviceIndex(a.service) - serviceIndex(b.service),
  );
}

// ---------------------------------------------------------------------------
// Core (invariant-free) pricing. The invariant layer calls this on hypothetical
// carts, so it must never recurse into the checks.
// ---------------------------------------------------------------------------

interface ResolvedItem {
  service: ServiceId;
  period: BillingPeriod;
  listRsd: Rsd;
}

interface GroupResult {
  chargedRsd: Rsd;
  lines: PriceLine[];
  packages: PackageAttribution[];
}

interface CoreResult {
  lines: PriceLine[];
  packages: PackageAttribution[];
  groups: PeriodGroupTotals[];
  servicesListRsd: Rsd;
  servicesChargedRsd: Rsd;
}

function resolve(cs: PricingConstants, items: readonly PriceItem[]): ResolvedItem[] {
  return items.map((item) => ({
    service: item.service,
    period: item.period,
    listRsd: cs.service[item.service][item.period],
  }));
}

/** Descending by price, ties broken by the canonical service order — so the
 *  ladder is a function of the set, not of the input order. */
function byLadderPosition(a: ResolvedItem, b: ResolvedItem): number {
  return b.listRsd - a.listRsd || serviceIndex(a.service) - serviceIndex(b.service);
}

function ladderRateBps(cs: PricingConstants, position: number): number {
  const last = cs.ladderBps.length - 1;
  return cs.ladderBps[Math.min(position, last)] ?? 0;
}

/** Integer discount, floored. Flooring (rather than rounding) is deliberate: it
 *  keeps a 50% rung at exactly-or-above 50% of list, so invariant 1 can be a
 *  hard `>=` instead of a `>=` with a rounding excuse. */
function discountRsd(listRsd: Rsd, bps: number): Rsd {
  return Math.floor((listRsd * bps) / 10000);
}

/** Allocate a package price across its members pro-rata by list price. Whole
 *  dinars, remainder to the largest member (canonical order breaks ties), so
 *  the lines always sum to exactly the package price. */
function allocatePackage(price: Rsd, members: readonly ResolvedItem[]): Map<ServiceId, Rsd> {
  const listTotal = members.reduce((sum, member) => sum + member.listRsd, 0);
  const ordered = [...members].sort(byLadderPosition);
  const shares = new Map<ServiceId, Rsd>();
  let assigned = 0;
  for (const member of ordered) {
    const share = listTotal === 0 ? 0 : Math.floor((price * member.listRsd) / listTotal);
    shares.set(member.service, share);
    assigned += share;
  }
  const largest = ordered[0];
  if (largest) {
    shares.set(largest.service, (shares.get(largest.service) ?? 0) + (price - assigned));
  }
  return shares;
}

interface GroupOptions {
  /** Services the cart grants for free (the fourth-service Review rule). */
  granted: ReadonlySet<ServiceId>;
  /** Package price to use. Normally the group's own period; the invariant-4
   *  lower bound passes a cheaper resolver on purpose. */
  packagePrice: (pkg: PackageDefinition, period: BillingPeriod) => Rsd;
}

function priceGroup(
  cs: PricingConstants,
  period: BillingPeriod,
  items: readonly ResolvedItem[],
  options: GroupOptions,
): GroupResult {
  const present = new Set(items.map((item) => item.service));
  const eligible = cs.packages.filter((pkg) =>
    pkg.services.every((service) => present.has(service)),
  );

  let best: { chargedRsd: Rsd; chosen: PackageDefinition[]; covered: number } | null = null;

  // Every subset of the eligible packages; keep the pairwise-disjoint ones.
  for (let mask = 0; mask < 1 << eligible.length; mask += 1) {
    const chosen: PackageDefinition[] = [];
    const covered = new Set<ServiceId>();
    let disjoint = true;
    for (let index = 0; index < eligible.length && disjoint; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      const pkg = eligible[index];
      for (const service of pkg.services) {
        if (covered.has(service)) {
          disjoint = false;
          break;
        }
        covered.add(service);
      }
      chosen.push(pkg);
    }
    if (!disjoint) continue;

    let total = chosen.reduce((sum, pkg) => sum + options.packagePrice(pkg, period), 0);
    // The grant is evaluated AFTER packaging and BEFORE the ladder (RFC-002
    // §2.1): a granted service inside a package stays inside it — the package
    // price already covers it — and a granted service outside every package is
    // free and leaves the ladder entirely.
    const remainder = items
      .filter((item) => !covered.has(item.service) && !options.granted.has(item.service))
      .sort(byLadderPosition);
    remainder.forEach((item, position) => {
      total += item.listRsd - discountRsd(item.listRsd, ladderRateBps(cs, position));
    });

    if (
      best === null ||
      total < best.chargedRsd ||
      // Ties go to the decomposition that names more packages: the same money,
      // but the buyer sees "Događaj" instead of two loose lines.
      (total === best.chargedRsd && covered.size > best.covered)
    ) {
      best = { chargedRsd: total, chosen, covered: covered.size };
    }
  }

  const chosen = best?.chosen ?? [];
  const byService = new Map(items.map((item) => [item.service, item]));
  const lines = new Map<ServiceId, PriceLine>();
  const packages: PackageAttribution[] = [];

  for (const pkg of chosen) {
    const members = pkg.services.map((service) => byService.get(service)!);
    const packagePriceRsd = options.packagePrice(pkg, period);
    const shares = allocatePackage(packagePriceRsd, members);
    const listRsd = members.reduce((sum, member) => sum + member.listRsd, 0);
    packages.push({
      packageId: pkg.id,
      period,
      services: [...pkg.services].sort((a, b) => serviceIndex(a) - serviceIndex(b)),
      listRsd,
      priceRsd: packagePriceRsd,
      savingsRsd: listRsd - packagePriceRsd,
    });
    for (const member of members) {
      const charged = shares.get(member.service) ?? 0;
      lines.set(member.service, {
        service: member.service,
        period,
        listRsd: member.listRsd,
        discountRsd: member.listRsd - charged,
        chargedRsd: charged,
        packageId: pkg.id,
        grant: null,
      });
    }
  }

  const remainder = items.filter((item) => !lines.has(item.service));
  for (const item of remainder.filter((entry) => options.granted.has(entry.service))) {
    lines.set(item.service, {
      service: item.service,
      period,
      listRsd: item.listRsd,
      discountRsd: item.listRsd,
      chargedRsd: 0,
      packageId: null,
      grant: "review_fourth_service",
    });
  }
  remainder
    .filter((entry) => !options.granted.has(entry.service))
    .sort(byLadderPosition)
    .forEach((item, position) => {
      const discount = discountRsd(item.listRsd, ladderRateBps(cs, position));
      lines.set(item.service, {
        service: item.service,
        period,
        listRsd: item.listRsd,
        discountRsd: discount,
        chargedRsd: item.listRsd - discount,
        packageId: null,
        grant: null,
      });
    });

  const ordered = items.map((item) => lines.get(item.service)!);
  return {
    chargedRsd: ordered.reduce((sum, line) => sum + line.chargedRsd, 0),
    lines: ordered,
    packages: packages.sort((a, b) => a.packageId.localeCompare(b.packageId)),
  };
}

function grantedServices(
  cs: PricingConstants,
  items: readonly PriceItem[],
  enabled: boolean,
): ReadonlySet<ServiceId> {
  if (!enabled) return new Set();
  const services = new Set(items.map((item) => item.service));
  if (!services.has("review")) return new Set();
  if (services.size < cs.reviewFreeFromServiceCount) return new Set();
  return new Set<ServiceId>(["review"]);
}

function computeCore(
  cs: PricingConstants,
  sortedItems: readonly PriceItem[],
  grantEnabled: boolean,
): CoreResult {
  const granted = grantedServices(cs, sortedItems, grantEnabled);
  const resolved = resolve(cs, sortedItems);
  const lines: PriceLine[] = [];
  const packages: PackageAttribution[] = [];
  const groups: PeriodGroupTotals[] = [];

  for (const period of BILLING_PERIODS) {
    const groupItems = resolved.filter((item) => item.period === period);
    if (groupItems.length === 0) continue;
    const result = priceGroup(cs, period, groupItems, {
      granted,
      packagePrice: (pkg, forPeriod) => pkg.price[forPeriod],
    });
    lines.push(...result.lines);
    packages.push(...result.packages);
    const listRsd = groupItems.reduce((sum, item) => sum + item.listRsd, 0);
    groups.push({
      period,
      services: groupItems.map((item) => item.service),
      listRsd,
      chargedRsd: result.chargedRsd,
      savingsRsd: listRsd - result.chargedRsd,
    });
  }

  return {
    lines,
    packages,
    groups,
    servicesListRsd: lines.reduce((sum, line) => sum + line.listRsd, 0),
    servicesChargedRsd: lines.reduce((sum, line) => sum + line.chargedRsd, 0),
  };
}

function planLineFor(cs: PricingConstants, input: PriceInput): PlanLine {
  if (input.plan === "enterprise") {
    return { plan: "enterprise", period: null, amountRsd: 0, onRequest: true };
  }
  if (input.plan === "basic") {
    return { plan: "basic", period: null, amountRsd: cs.plan.basic.monthly, onRequest: false };
  }
  const period = input.planPeriod as BillingPeriod;
  return { plan: "premium", period, amountRsd: cs.plan.premium[period], onRequest: false };
}

// ---------------------------------------------------------------------------
// The four hard invariants (RFC-002 §2.1)
//
// They are checked on EVERY call, not only in development. The whole cost is a
// handful of integer passes over at most five services plus 2^n core
// recomputations with n <= 5; paying that on every quote is cheaper than one
// mispriced sale, and it removes the "the check was off in production" failure
// mode entirely. `price()` therefore either returns a sellable price or throws.
//
// TWO DELIBERATE, NAMED EXEMPTIONS, both forced by the "Review is free from the
// fourth service up" rule (RFC-002 §2.1, DECIDED, owner may veto):
//
//   * A GRANTED line is exempt from invariants 1, 2 and 3. A 100% concession is
//     by definition below a 50% floor, and a cart cannot be required to charge
//     at least the list price of the very line it gave away. The exemption is
//     keyed on `line.grant`, never on "chargedRsd happened to be 0".
//   * Invariant 4's monotonicity is measured with the grant DISABLED. Making
//     the fourth service nearly free is exactly a non-monotone step — it is the
//     rule's purpose — so monotonicity is asserted on the ungranted base price,
//     where it is a real property of the packages and the ladder.
//
// Invariants 1-2 are also measured PER PERIOD GROUP rather than across the
// whole cart: a ratio that adds a monthly dinar to an annual dinar is not a
// discount rate, and enforcing 45% on such a sum would reject legitimate mixed
// carts while permitting real over-discounting inside a single basket.
// ---------------------------------------------------------------------------

/** Monthly and annual money are only comparable on a yearly horizon. Used by
 *  invariant 4b and nowhere else — no output field is annualized. */
const MONTHS_PER_YEAR = 12;

function annualizedTotal(lines: readonly PriceLine[]): Rsd {
  return lines.reduce(
    (sum, line) => sum + (line.period === "monthly" ? line.chargedRsd * MONTHS_PER_YEAR : line.chargedRsd),
    0,
  );
}

function assertInvariants(
  cs: PricingConstants,
  sortedItems: readonly PriceItem[],
  result: CoreResult,
): void {
  // 1 — no priced line below `minLineChargeBps` of its list price.
  for (const line of result.lines) {
    if (line.grant !== null) continue;
    if (line.chargedRsd * 10000 < line.listRsd * cs.minLineChargeBps) {
      throw new PricingInvariantError(
        1,
        `linija ${line.service}/${line.period} naplaćena ${line.chargedRsd} od ${line.listRsd} RSD, ` +
          `ispod praga od ${cs.minLineChargeBps / 100}%.`,
      );
    }
  }

  // 2 — total discount within a period group never exceeds `maxGroupDiscountBps`.
  for (const group of result.groups) {
    const priced = result.lines.filter(
      (line) => line.period === group.period && line.grant === null,
    );
    const listRsd = priced.reduce((sum, line) => sum + line.listRsd, 0);
    const discount = priced.reduce((sum, line) => sum + line.discountRsd, 0);
    if (listRsd > 0 && discount * 10000 > listRsd * cs.maxGroupDiscountBps) {
      throw new PricingInvariantError(
        2,
        `grupa ${group.period} ima popust ${discount} od ${listRsd} RSD, ` +
          `iznad praga od ${cs.maxGroupDiscountBps / 100}%.`,
      );
    }
  }

  // 3 — the cart total is never less than the most expensive single service.
  const mostExpensive = result.lines
    .filter((line) => line.grant === null)
    .reduce((max, line) => Math.max(max, line.listRsd), 0);
  if (result.servicesChargedRsd < mostExpensive) {
    throw new PricingInvariantError(
      3,
      `korpa naplaćena ${result.servicesChargedRsd} RSD, ispod najskuplje pojedinačne usluge ` +
        `(${mostExpensive} RSD).`,
    );
  }

  // 4a — adding a service never lowers the total (grant disabled, see above).
  const base = computeCore(cs, sortedItems, false).servicesChargedRsd;
  for (let mask = 1; mask < (1 << sortedItems.length) - 1; mask += 1) {
    const subset = sortedItems.filter((_, index) => (mask & (1 << index)) !== 0);
    const subsetTotal = computeCore(cs, subset, false).servicesChargedRsd;
    if (subsetTotal > base) {
      throw new PricingInvariantError(
        4,
        `podskup [${subset.map((item) => `${item.service}/${item.period}`).join(", ")}] košta ` +
          `${subsetTotal} RSD, više od pune korpe (${base} RSD) — dodavanje usluge snižava cenu.`,
      );
    }
  }

  // 4b — splitting a set across periods is never cheaper than combining it in
  // one. Comparable only when annualized: a monthly dinar is twelve dinars a
  // year. The bound is the cheaper of the two uniform baskets (everything
  // monthly, everything annual), each priced by the same engine with the same
  // grant. This is the check that catches the cherry-pick — a buyer taking one
  // service monthly and another annually because the constants happen to make
  // that mix beat both honest baskets.
  const periods = new Set(sortedItems.map((item) => item.period));
  if (periods.size > 1) {
    const split = annualizedTotal(result.lines);
    const combined = Math.min(
      ...BILLING_PERIODS.map((period) =>
        annualizedTotal(
          computeCore(
            cs,
            sortedItems.map((item) => ({ service: item.service, period })),
            true,
          ).lines,
        ),
      ),
    );
    if (split < combined) {
      throw new PricingInvariantError(
        4,
        `podela po periodima daje ${split} RSD godišnje, ispod jedinstvene korpe (${combined} RSD ` +
          `godišnje) — mešanje perioda je jeftinije od objedinjavanja.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// The entry point
// ---------------------------------------------------------------------------

/**
 * Price a cart. Pure: the same `(items, plan, planPeriod)` always yields the
 * same breakdown, and the order of `items` is irrelevant.
 *
 * Throws `PricingInputError` for a malformed cart and `PricingInvariantError`
 * when the constants would produce a result that breaks one of the four hard
 * invariants of RFC-002 §2.1.
 */
export function price(input: PriceInput): PriceBreakdown {
  return priceWith(DEFAULT_PRICING_CONSTANTS, input);
}

/**
 * `price()` against an explicit constant set. This exists so a test can prove
 * that a deliberate constant edit makes the engine THROW rather than sell —
 * the invariants are checks, not numbers that happen to work out. Production
 * code calls `price()`.
 */
export function priceWith(cs: PricingConstants, input: PriceInput): PriceBreakdown {
  const sortedItems = validateInput(input);
  const core = computeCore(cs, sortedItems, true);
  assertInvariants(cs, sortedItems, core);

  const planLine = planLineFor(cs, input);
  return {
    engineVersion: PRICING_ENGINE_VERSION,
    currency: "RSD",
    lines: core.lines,
    packages: core.packages,
    groups: core.groups,
    planLine,
    servicesListRsd: core.servicesListRsd,
    servicesChargedRsd: core.servicesChargedRsd,
    savingsRsd: core.servicesListRsd - core.servicesChargedRsd,
    totalRsd: core.servicesChargedRsd + planLine.amountRsd,
  };
}
