import { createHash } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { getDict } from "@/lib/i18n";

// TASK-43 — the reservation-request submit endpoint. The public form posts
// HERE, never straight to Convex, for one reason: the per-IP rate limit. The
// handler computes a salted one-way hash of the caller IP (the exact
// app/r/[cardCode] pattern) and passes it to the mutation as the limiter key;
// the raw IP never reaches Convex and nothing stores it (RFC-001 §2.10). A
// caller who bypasses this handler and hits the mutation directly collapses
// into one shared bucket — throttled collectively, not open.
export const dynamic = "force-dynamic";

const dict = getDict("venue");

function ipHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "local";
  const salt = process.env.SCANME_GUEST_SECRET ?? "";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

const asString = (value: unknown, max: number): string | undefined =>
  typeof value === "string" && value.trim() !== ""
    ? value.slice(0, max)
    : undefined;
const asNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json({ error: dict.reservationErrorGeneric }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: dict.reservationErrorGeneric }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: dict.reservationErrorGeneric }, { status: 400 });
  }
  const raw = body as Record<string, unknown>;
  const businessSlug = asString(raw.businessSlug, 120);
  const eventSlug = asString(raw.eventSlug, 120);
  if (!businessSlug || !eventSlug) {
    return Response.json({ error: dict.reservationErrorGeneric }, { status: 400 });
  }

  try {
    const convex = new ConvexHttpClient(convexUrl);
    await convex.mutation(api.venueReservations.submit, {
      businessSlug,
      eventSlug,
      zoneId: asString(raw.zoneId, 80),
      name: asString(raw.name, 200),
      phone: asString(raw.phone, 60),
      email: asString(raw.email, 254),
      partySize: asNumber(raw.partySize),
      desiredAt: asNumber(raw.desiredAt),
      note: asString(raw.note, 600),
      ipHash: ipHash(request),
    });
    return Response.json({ ok: true });
  } catch (error) {
    // The mutation's ConvexError sentences are guest-facing Serbian copy —
    // pass them through verbatim; anything else is a generic failure.
    if (error instanceof ConvexError && typeof error.data === "string") {
      return Response.json({ error: error.data }, { status: 400 });
    }
    return Response.json({ error: dict.reservationErrorGeneric }, { status: 502 });
  }
}
