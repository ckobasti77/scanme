// ScanMe Menu V1 (K21) — the server side of the guest's buttons on the public
// menu (master §8.1–§8.4; plan K19 §4.2). The Next server actions of
// /[slug]/meni (app/[slug]/meni/_lib/radnje-gosta.ts) only wire cookies,
// headers and Convex into these functions, so the rules are tested without
// Next or Convex.
//
// The guest's tokens stay where the hop put them: HttpOnly cookies (smm_g for
// the session of the scanned position, smm_d for the device), verified here
// with SCANME_GUEST_SECRET and the venue's signing context. They never travel
// through the page or the browser's JavaScript. A server action POSTs to the
// page that calls it, so the cookies (Path=/{slug}/meni) ride along; Next
// checks the Origin. The salted IP hash is computed here, never sent by the
// phone. Every Convex failure comes back as a value the guest can act on.

import { isOrderAttemptKey, type OrderLineInput, type OrderTotals } from "../cart";
import { REQUEST_ERROR, type RequestErrorCode } from "../errors/requests";
import type { MenuPaymentPreference, MenuRequestChannel, MenuRequestStatus } from "../request-status";
import {
  MENU_GUEST_DEVICE_COOKIE,
  MENU_GUEST_SESSION_COOKIE,
  deviceCookieContext,
  sessionCookieContext,
  verifyCookieValue,
} from "../signed-cookie";
import { deviceKeyHashFor } from "../tokens";

/** What a guest button gets back. `network`: the action never reached a decision (the guest may retry). */
export type GuestActionResult =
  | {
      ok: true;
      requestId: string | null;
      status: MenuRequestStatus;
      createdAt: number;
      deduped: boolean;
      totals: OrderTotals | null;
      /** Bills: the way of paying the request carries now. */
      paymentPreference: MenuPaymentPreference | null;
    }
  | {
      ok: false;
      code: RequestErrorCode | "network";
      unavailableKeys?: string[];
      staleLines?: number[];
      prices?: { index: number; pieceRsd: number; lineTotalRsd: number }[];
      totals?: OrderTotals;
    };

export type GuestCancelResult = { ok: true } | { ok: false; code: RequestErrorCode | "network" };

export type GuestActionDeps = {
  /** The raw value of a request cookie. */
  cookie(name: string): string | undefined;
  /** SCANME_GUEST_SECRET; null = guest actions are off (no cookie can be trusted). */
  secret: string | null;
  /** The salted IP hash of the caller (resolverIpHash). */
  ipHash: string;
  /** Called with what failed on the server side (logged by the route; never sent to the guest). */
  onError?: (error: unknown) => void;
  convex: {
    callWaiter(args: { slug: string; guestToken: string; ipHash: string }): Promise<GuestActionResult>;
    requestBill(args: { slug: string; guestToken: string; ipHash: string; payment: MenuPaymentPreference }): Promise<GuestActionResult>;
    submitOrder(args: {
      slug: string;
      guestToken: string;
      ipHash: string;
      channel: MenuRequestChannel;
      lines: OrderLineInput[];
      seenTotalRsd: number;
      clientRequestId?: string;
    }): Promise<GuestActionResult>;
    cancelRequest(args: { slug: string; deviceToken: string; requestId: string; ipHash: string }): Promise<GuestCancelResult>;
  };
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NO_SESSION = { ok: false as const, code: REQUEST_ERROR.noSession };
const NETWORK = { ok: false as const, code: "network" as const };

function validSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length <= 80 && SLUG_PATTERN.test(slug);
}

/** The verified session token of this venue's menu, or null. */
export async function guestTokenOf(deps: Pick<GuestActionDeps, "cookie" | "secret">, slug: string): Promise<string | null> {
  if (!deps.secret) return null;
  return await verifyCookieValue(deps.cookie(MENU_GUEST_SESSION_COOKIE), deps.secret, sessionCookieContext(slug));
}

/** The verified device token, or null. */
export async function deviceTokenOf(deps: Pick<GuestActionDeps, "cookie" | "secret">): Promise<string | null> {
  if (!deps.secret) return null;
  return await verifyCookieValue(deps.cookie(MENU_GUEST_DEVICE_COOKIE), deps.secret, deviceCookieContext());
}

/**
 * The READ key of "Moji zahtevi" for this venue: the device's venue-scoped
 * hash (what menuRequests stores). It lets the phone subscribe to its own
 * list; it cannot send or cancel anything. null without a valid device cookie.
 */
export async function myRequestsKeyOf(
  deps: Pick<GuestActionDeps, "cookie" | "secret">,
  menuServiceId: string,
): Promise<string | null> {
  const deviceToken = await deviceTokenOf(deps);
  return deviceToken ? await deviceKeyHashFor(menuServiceId, deviceToken) : null;
}

async function withSession(
  slug: unknown,
  deps: GuestActionDeps,
  run: (guestToken: string, slug: string) => Promise<GuestActionResult>,
): Promise<GuestActionResult> {
  if (!validSlug(slug)) return NO_SESSION;
  const guestToken = await guestTokenOf(deps, slug);
  if (!guestToken) return NO_SESSION;
  try {
    return await run(guestToken, slug);
  } catch (error) {
    deps.onError?.(error);
    return NETWORK;
  }
}

export async function callWaiterAction(slug: unknown, deps: GuestActionDeps): Promise<GuestActionResult> {
  return await withSession(slug, deps, (guestToken, cleanSlug) =>
    deps.convex.callWaiter({ slug: cleanSlug, guestToken, ipHash: deps.ipHash }),
  );
}

export async function requestBillAction(slug: unknown, payment: unknown, deps: GuestActionDeps): Promise<GuestActionResult> {
  if (payment !== "cash" && payment !== "card") return { ok: false, code: REQUEST_ERROR.invalidInput };
  return await withSession(slug, deps, (guestToken, cleanSlug) =>
    deps.convex.requestBill({ slug: cleanSlug, guestToken, ipHash: deps.ipHash, payment }),
  );
}

export type SubmitOrderInput = {
  channel: MenuRequestChannel;
  lines: OrderLineInput[];
  seenTotalRsd: number;
  /** The phone's key of this send attempt (idempotency: a retry never writes a second order). */
  clientRequestId?: string;
};

function isOrderInput(value: unknown): value is SubmitOrderInput {
  if (typeof value !== "object" || value === null) return false;
  const input = value as Record<string, unknown>;
  if (input.channel !== "standard" && input.channel !== "room_service") return false;
  if (typeof input.seenTotalRsd !== "number" || !Array.isArray(input.lines) || input.lines.length > 100) return false;
  if (input.clientRequestId !== undefined && !isOrderAttemptKey(input.clientRequestId)) return false;
  return input.lines.every((line) => {
    if (typeof line !== "object" || line === null) return false;
    const row = line as Record<string, unknown>;
    return (
      typeof row.articleKey === "string" &&
      typeof row.quantity === "number" &&
      Array.isArray(row.addonKeys) &&
      row.addonKeys.every((key) => typeof key === "string") &&
      (row.pageKey === null || typeof row.pageKey === "string") &&
      (row.variantKey === null || typeof row.variantKey === "string") &&
      (row.note === null || typeof row.note === "string")
    );
  });
}

export async function submitOrderAction(slug: unknown, input: unknown, deps: GuestActionDeps): Promise<GuestActionResult> {
  if (!isOrderInput(input)) return { ok: false, code: REQUEST_ERROR.invalidInput };
  // Only the fields Convex expects travel on (nothing the phone added rides along).
  const lines: OrderLineInput[] = input.lines.map((line) => ({
    pageKey: line.pageKey,
    articleKey: line.articleKey,
    variantKey: line.variantKey,
    addonKeys: [...line.addonKeys],
    quantity: line.quantity,
    note: line.note,
  }));
  return await withSession(slug, deps, (guestToken, cleanSlug) =>
    deps.convex.submitOrder({
      slug: cleanSlug,
      guestToken,
      ipHash: deps.ipHash,
      channel: input.channel,
      lines,
      seenTotalRsd: input.seenTotalRsd,
      ...(input.clientRequestId ? { clientRequestId: input.clientRequestId } : {}),
    }),
  );
}

export async function cancelRequestAction(slug: unknown, requestId: unknown, deps: GuestActionDeps): Promise<GuestCancelResult> {
  if (!validSlug(slug)) return NO_SESSION;
  if (typeof requestId !== "string" || requestId.length === 0 || requestId.length > 64) {
    return { ok: false, code: REQUEST_ERROR.notFound };
  }
  const deviceToken = await deviceTokenOf(deps);
  if (!deviceToken) return NO_SESSION;
  try {
    const result = await deps.convex.cancelRequest({ slug, deviceToken, requestId, ipHash: deps.ipHash });
    return result.ok ? { ok: true } : result;
  } catch (error) {
    deps.onError?.(error);
    return NETWORK;
  }
}
