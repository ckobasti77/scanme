// ScanMe Menu V1 (K21) — the guest's cart and the order sent to the waiter
// (master §5.3, §8.2; plan docs/meni/planovi/K19.md K19-8, K19-9).
//
// One pure module for both sides:
//   the phone   keeps the cart (lines with what the guest saw), merges and
//               edits lines, sums the total, stores it per venue and channel;
//   the server  checks the shape of a submitted order first (cheap, before any
//               rate-limit bucket), then re-prices every line from the
//               PUBLISHED version with the same `linePrice`, refuses an
//               unavailable or vanished article, and asks for a confirmation
//               when the total the guest saw is not today's total.
//
// Prices are whole RSD. A standard line costs the article's (or its
// variant's) price at this moment — an active promotion applies, exactly as
// the menu shows it (`cenaPrikaz`). A Room service line costs the Room service
// price as published (base → markup → manual; no promotion), and the delivery
// fee is added ONCE to the whole order (`roomServiceOrderTotal`). Add-ons are
// surcharges with no markup (K01 OTV 20). An order is a request for the
// waiter to review: never sent to the kitchen, never a payment.

import { REQUEST_ERROR, type RequestErrorCode } from "./errors/requests";
import {
  MENU_MAX_CART_ADDONS,
  MENU_MAX_CART_LINES,
  MENU_MAX_CART_PAGES,
  MENU_MAX_CART_QUANTITY,
  MENU_MAX_PRICE_RSD,
  MENU_TEXT,
} from "./limits";
import { cenaPrikaz } from "./public-view";
import type { MenuRequestChannel } from "./request-status";
import { roomServiceOrderTotal } from "./room-service-pricing";
import type { PublicAddonGroup, PublicArticle, PublicVariant } from "./snapshot";
import { hashString } from "./snapshot";
import { cleanText } from "./text";

/** What pricing needs of an article: a standard page article or a Room service article. */
export type CartArticle = Pick<PublicArticle, "key" | "name" | "priceRsd" | "addonGroups" | "noteEnabled" | "promo"> & {
  variants: readonly PublicVariant[];
};

export type CartSelection = {
  variantKey: string | null;
  addonKeys: readonly string[];
};

export type SelectionProblem =
  | "variant_required"
  | "variant_unknown"
  | "addon_unknown"
  | "addon_bounds"
  | "no_price";

export type PricedAddon = {
  groupKey: string;
  groupName: string;
  optionKey: string;
  optionName: string;
  priceDeltaRsd: number;
};

export type SelectionCheck =
  | { ok: true; variant: PublicVariant | null; addons: PricedAddon[] }
  | { ok: false; problem: SelectionProblem; groupKey?: string };

/**
 * Is this a choice the guest may order: the variant (required when the
 * article has variants), and add-ons that belong to the article's groups,
 * each group within its published minimum and maximum.
 */
export function validateSelection(article: CartArticle, selection: CartSelection): SelectionCheck {
  let variant: PublicVariant | null = null;
  if (article.variants.length > 0) {
    if (selection.variantKey === null) return { ok: false, problem: "variant_required" };
    variant = article.variants.find((row) => row.key === selection.variantKey) ?? null;
    if (!variant) return { ok: false, problem: "variant_unknown" };
  } else if (selection.variantKey !== null) {
    return { ok: false, problem: "variant_unknown" };
  } else if (article.priceRsd === null) {
    return { ok: false, problem: "no_price" };
  }

  const picked = new Set(selection.addonKeys);
  if (picked.size !== selection.addonKeys.length) return { ok: false, problem: "addon_unknown" };
  const addons: PricedAddon[] = [];
  let matched = 0;
  for (const group of article.addonGroups) {
    let count = 0;
    for (const option of group.options) {
      if (!picked.has(option.key)) continue;
      count += 1;
      addons.push({
        groupKey: group.key,
        groupName: group.name,
        optionKey: option.key,
        optionName: option.name,
        priceDeltaRsd: option.priceDeltaRsd,
      });
    }
    matched += count;
    if (count < group.minSelect || count > group.maxSelect) {
      return { ok: false, problem: "addon_bounds", groupKey: group.key };
    }
  }
  if (matched !== picked.size) return { ok: false, problem: "addon_unknown" };
  return { ok: true, variant, addons };
}

/** The groups the guest still has to complete (required groups below their minimum), for the "Dodaj" button. */
export function missingGroups(article: Pick<CartArticle, "addonGroups">, addonKeys: readonly string[]): PublicAddonGroup[] {
  const picked = new Set(addonKeys);
  return article.addonGroups.filter(
    (group) => group.options.filter((option) => picked.has(option.key)).length < group.minSelect,
  );
}

export type LinePrice = {
  /** The article's (or variant's) price for one piece at this moment, add-ons excluded. */
  unitPriceRsd: number;
  /** The regular price when a promotion lowered it; null otherwise. */
  regularPriceRsd: number | null;
  promoApplied: boolean;
  variantName: string | null;
  addons: PricedAddon[];
  addonsRsd: number;
  /** unit + add-ons: one piece as ordered. */
  pieceRsd: number;
  lineTotalRsd: number;
};

/**
 * The price of one line, the same on the phone and on the server. Standard:
 * the price the menu shows at `nowMs` (an active promotion included). Room
 * service: the published Room service price, no promotion. null when the
 * selection cannot be ordered (validateSelection says why).
 */
export function linePrice(
  article: CartArticle,
  selection: CartSelection & { quantity: number },
  nowMs: number,
  channel: MenuRequestChannel,
): LinePrice | null {
  const check = validateSelection(article, selection);
  if (!check.ok) return null;
  const cena = cenaPrikaz(
    { priceRsd: article.priceRsd, variants: [...article.variants], promo: channel === "room_service" ? null : article.promo },
    nowMs,
  );
  let regular: number;
  let promo: number | null;
  if (check.variant) {
    if (cena.vrsta !== "varijante") return null;
    const stavka = cena.stavke.find((row) => row.key === check.variant?.key);
    if (!stavka) return null;
    regular = stavka.rsd;
    promo = stavka.akcijska;
  } else {
    if (cena.vrsta !== "osnovna") return null;
    regular = cena.rsd;
    promo = cena.akcijska;
  }
  const unitPriceRsd = promo ?? regular;
  const addonsRsd = check.addons.reduce((sum, addon) => sum + addon.priceDeltaRsd, 0);
  const pieceRsd = unitPriceRsd + addonsRsd;
  return {
    unitPriceRsd,
    regularPriceRsd: promo !== null ? regular : null,
    promoApplied: promo !== null,
    variantName: check.variant?.name ?? null,
    addons: check.addons,
    addonsRsd,
    pieceRsd,
    lineTotalRsd: pieceRsd * selection.quantity,
  };
}

export type OrderTotals = { subtotalRsd: number; deliveryFeeRsd: number; totalRsd: number };

/** Sum of the lines; on Room service plus the delivery fee ONCE per order (none for an empty order). */
export function orderTotals(
  lines: readonly { pieceRsd: number; quantity: number }[],
  channel: MenuRequestChannel,
  deliveryFeeRsd: number | null,
): OrderTotals {
  const total = roomServiceOrderTotal(
    lines.map((line) => ({ unitPriceRsd: line.pieceRsd, quantity: line.quantity })),
    channel === "room_service" ? deliveryFeeRsd : null,
  );
  return { subtotalRsd: total.itemsRsd, deliveryFeeRsd: total.deliveryFeeRsd, totalRsd: total.totalRsd };
}

// =============================================================================
// The cart on the phone
// =============================================================================

/** One line as the guest sees it; the server never trusts the names or prices here. */
export type CartLine = {
  /** Stable identity of the choice (same article + variant + add-ons + note = same line). */
  id: string;
  /** The standard page the article was added from; null on Room service. */
  pageKey: string | null;
  articleKey: string;
  variantKey: string | null;
  /** Sorted. */
  addonKeys: string[];
  quantity: number;
  note: string | null;
  name: string;
  variantName: string | null;
  addonNames: string[];
  /** One piece with its add-ons, as priced when it was added (or when the server last answered). */
  pieceRsd: number;
};

export function cartLineId(
  line: Pick<CartLine, "pageKey" | "articleKey" | "variantKey" | "addonKeys" | "note">,
): string {
  return [line.pageKey ?? "_rs", line.articleKey, line.variantKey ?? "", [...line.addonKeys].sort().join("+"), line.note ?? ""].join("|");
}

/** The guest's note: whitespace cleaned, null when empty; null too when longer than allowed (the UI blocks that first). */
export function cleanLineNote(note: string | null | undefined): string | null {
  if (!note) return null;
  const cleaned = cleanText(note);
  if (cleaned.length === 0 || cleaned.length > MENU_TEXT.cartLineNote) return null;
  return cleaned;
}

export type AddResult = { lines: CartLine[]; outcome: "added" | "merged" | "full" };

/** Adds a line, or adds its quantity to the same choice already in the cart (capped at the line maximum). */
export function addCartLine(lines: readonly CartLine[], input: Omit<CartLine, "id">): AddResult {
  const addonKeys = [...input.addonKeys].sort();
  const line: CartLine = { ...input, addonKeys, id: cartLineId({ ...input, addonKeys }) };
  const existing = lines.find((row) => row.id === line.id);
  if (existing) {
    const quantity = Math.min(MENU_MAX_CART_QUANTITY, existing.quantity + line.quantity);
    return {
      lines: lines.map((row) => (row.id === line.id ? { ...row, quantity, pieceRsd: line.pieceRsd } : row)),
      outcome: "merged",
    };
  }
  if (lines.length >= MENU_MAX_CART_LINES) return { lines: [...lines], outcome: "full" };
  return { lines: [...lines, { ...line, quantity: Math.min(MENU_MAX_CART_QUANTITY, Math.max(1, line.quantity)) }], outcome: "added" };
}

/** Sets a line's quantity; 0 removes the line. */
export function setCartQuantity(lines: readonly CartLine[], id: string, quantity: number): CartLine[] {
  const whole = Math.floor(quantity);
  if (!(whole > 0)) return lines.filter((row) => row.id !== id);
  const capped = Math.min(MENU_MAX_CART_QUANTITY, whole);
  return lines.map((row) => (row.id === id ? { ...row, quantity: capped } : row));
}

export function removeCartLine(lines: readonly CartLine[], id: string): CartLine[] {
  return lines.filter((row) => row.id !== id);
}

export function cartCount(lines: readonly Pick<CartLine, "quantity">[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** The storage key of a cart: per venue and channel (sessionStorage; plan K19 §4.2). */
export function cartStorageKey(slug: string, channel: MenuRequestChannel): string {
  return `smm_korpa:${slug}:${channel}`;
}

/** A stored cart, read defensively: anything malformed is dropped, never thrown. */
export function readStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const out: CartLine[] = [];
  for (const row of value.slice(0, MENU_MAX_CART_LINES * 4)) {
    if (out.length >= MENU_MAX_CART_LINES) break;
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    if (typeof r.articleKey !== "string" || typeof r.name !== "string") continue;
    const quantity = typeof r.quantity === "number" && Number.isInteger(r.quantity) ? r.quantity : 0;
    const pieceRsd = typeof r.pieceRsd === "number" && Number.isInteger(r.pieceRsd) ? r.pieceRsd : -1;
    if (quantity < 1 || quantity > MENU_MAX_CART_QUANTITY || pieceRsd < 0) continue;
    const addonKeys = Array.isArray(r.addonKeys) ? r.addonKeys.filter((key): key is string => typeof key === "string").sort() : [];
    const line = {
      pageKey: typeof r.pageKey === "string" ? r.pageKey : null,
      articleKey: r.articleKey,
      variantKey: typeof r.variantKey === "string" ? r.variantKey : null,
      addonKeys,
      quantity,
      note: typeof r.note === "string" ? cleanLineNote(r.note) : null,
      name: r.name,
      variantName: typeof r.variantName === "string" ? r.variantName : null,
      addonNames: Array.isArray(r.addonNames) ? r.addonNames.filter((name): name is string => typeof name === "string") : [],
      pieceRsd,
    };
    out.push({ ...line, id: cartLineId(line) });
  }
  return out;
}

/** What the phone sends: only references, quantities and notes (never names or prices). */
export type OrderLineInput = {
  pageKey: string | null;
  articleKey: string;
  variantKey: string | null;
  addonKeys: string[];
  quantity: number;
  note: string | null;
};

export function orderLinesOf(lines: readonly CartLine[]): OrderLineInput[] {
  return lines.map((line) => ({
    pageKey: line.pageKey,
    articleKey: line.articleKey,
    variantKey: line.variantKey,
    addonKeys: [...line.addonKeys],
    quantity: line.quantity,
    note: line.note,
  }));
}

/** After the server answered `cart_price_changed`: today's piece prices on the same lines. */
export function applyServerPrices(
  lines: readonly CartLine[],
  prices: readonly { index: number; pieceRsd: number }[],
): CartLine[] {
  return lines.map((line, index) => {
    const price = prices.find((row) => row.index === index);
    return price ? { ...line, pieceRsd: price.pieceRsd } : line;
  });
}

// =============================================================================
// The server side of an order
// =============================================================================

const KEY_SHAPE = /^[A-Za-z0-9_-]{1,40}$/;
const ATTEMPT_KEY_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

/** The phone's key of one send attempt (idempotency): letters, digits, `_` and `-`, 8–64 characters. */
export function isOrderAttemptKey(value: unknown): value is string {
  return typeof value === "string" && ATTEMPT_KEY_SHAPE.test(value);
}

/** What the cart sends, as a short fingerprint: the same cart keeps its send key across retries and reloads. */
export function orderFingerprint(lines: readonly OrderLineInput[]): string {
  return hashString(JSON.stringify(lines));
}

export type OrderShapeCheck =
  | { ok: true; lines: OrderLineInput[]; pageKeys: string[] }
  | { ok: false; code: RequestErrorCode };

/**
 * The cheap checks of a submitted order, before any bucket is spent and any
 * version is read: 1..30 lines, quantity 1..50, ≤ 20 distinct add-ons, the
 * note ≤ 280 characters, page references only on standard orders and at most
 * 5 different pages, a whole non-negative total.
 */
export function checkOrderShape(input: {
  channel: MenuRequestChannel;
  lines: readonly {
    pageKey?: string | null;
    articleKey: string;
    variantKey?: string | null;
    addonKeys: readonly string[];
    quantity: number;
    note?: string | null;
  }[];
  seenTotalRsd: number;
}): OrderShapeCheck {
  const invalid = { ok: false as const, code: REQUEST_ERROR.invalidInput };
  if (input.lines.length === 0 || input.lines.length > MENU_MAX_CART_LINES) return invalid;
  if (!Number.isInteger(input.seenTotalRsd) || input.seenTotalRsd < 0 || input.seenTotalRsd > MENU_MAX_PRICE_RSD * 100) {
    return invalid;
  }
  const pageKeys = new Set<string>();
  const lines: OrderLineInput[] = [];
  for (const line of input.lines) {
    if (!KEY_SHAPE.test(line.articleKey)) return invalid;
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MENU_MAX_CART_QUANTITY) return invalid;
    const variantKey = line.variantKey ?? null;
    if (variantKey !== null && !KEY_SHAPE.test(variantKey)) return invalid;
    if (line.addonKeys.length > MENU_MAX_CART_ADDONS) return invalid;
    if (new Set(line.addonKeys).size !== line.addonKeys.length) return invalid;
    if (line.addonKeys.some((key) => !KEY_SHAPE.test(key))) return invalid;
    let note: string | null = null;
    if (line.note !== undefined && line.note !== null) {
      const cleaned = cleanText(line.note);
      if (cleaned.length > MENU_TEXT.cartLineNote) return invalid;
      note = cleaned.length > 0 ? cleaned : null;
    }
    const pageKey = line.pageKey ?? null;
    if (input.channel === "room_service") {
      if (pageKey !== null) return invalid;
    } else {
      if (pageKey === null || !KEY_SHAPE.test(pageKey)) return invalid;
      pageKeys.add(pageKey);
    }
    lines.push({ pageKey, articleKey: line.articleKey, variantKey, addonKeys: [...line.addonKeys], quantity: line.quantity, note });
  }
  if (pageKeys.size > MENU_MAX_CART_PAGES) return invalid;
  return { ok: true, lines, pageKeys: [...pageKeys] };
}

export type PricedOrderLine = OrderLineInput & {
  name: string;
  price: LinePrice;
};

export type OrderPricing =
  | { ok: true; lines: PricedOrderLine[]; totals: OrderTotals }
  | { ok: false; code: typeof REQUEST_ERROR.cartUnavailable; unavailableKeys: string[] }
  | { ok: false; code: typeof REQUEST_ERROR.cartStale; staleLines: number[] }
  | {
      ok: false;
      code: typeof REQUEST_ERROR.cartPriceChanged;
      prices: { index: number; pieceRsd: number; lineTotalRsd: number }[];
      totals: OrderTotals;
    };

/**
 * Prices a checked order from the published articles. `findArticle` reads
 * the article of a line (its page on standard orders, the Room service part
 * otherwise); `unavailable` holds the live "Privremeno nedostupno" keys.
 * Order of refusals: an article that is gone or changed (stale) → an
 * unavailable article → a total that differs from what the guest saw.
 */
export function priceOrder(input: {
  channel: MenuRequestChannel;
  lines: readonly OrderLineInput[];
  seenTotalRsd: number;
  findArticle: (line: OrderLineInput) => CartArticle | null;
  unavailable: ReadonlySet<string>;
  deliveryFeeRsd: number | null;
  nowMs: number;
}): OrderPricing {
  const priced: PricedOrderLine[] = [];
  const stale: number[] = [];
  input.lines.forEach((line, index) => {
    const article = input.findArticle(line);
    const price = article
      ? linePrice(article, { variantKey: line.variantKey, addonKeys: line.addonKeys, quantity: line.quantity }, input.nowMs, input.channel)
      : null;
    // A note is the guest's free text only where the venue switched it on for the article.
    if (!article || !price || (line.note !== null && !article.noteEnabled)) {
      stale.push(index);
      return;
    }
    priced.push({ ...line, name: article.name, price });
  });
  if (stale.length > 0) return { ok: false, code: REQUEST_ERROR.cartStale, staleLines: stale };

  const unavailableKeys = [...new Set(priced.filter((line) => input.unavailable.has(line.articleKey)).map((line) => line.articleKey))];
  if (unavailableKeys.length > 0) return { ok: false, code: REQUEST_ERROR.cartUnavailable, unavailableKeys };

  const totals = orderTotals(
    priced.map((line) => ({ pieceRsd: line.price.pieceRsd, quantity: line.quantity })),
    input.channel,
    input.deliveryFeeRsd,
  );
  if (totals.totalRsd !== input.seenTotalRsd) {
    return {
      ok: false,
      code: REQUEST_ERROR.cartPriceChanged,
      prices: priced.map((line, index) => ({ index, pieceRsd: line.price.pieceRsd, lineTotalRsd: line.price.lineTotalRsd })),
      totals,
    };
  }
  return { ok: true, lines: priced, totals };
}
