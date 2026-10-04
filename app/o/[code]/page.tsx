// /o/[code] — the guest ordering screen (RFC-004 §2.2, §2.14, TASK-66).
//
// The guest arrives from a scanned table card already carrying the HttpOnly
// cookie the card-aware hop /r/[cardCode]/o set (TASK-63). This page NEVER
// mints identity: it verifies what arrived and renders the correct state
// server-side, so the first paint is a real screen. A visitor who reached this
// URL some other way has no cookie, gets no identity, and is told to scan the
// card on the table — a request with no table is worthless to the waiter.
//
// Private by nature: noindex.

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { orderingSr as dict } from "@/lib/i18n/sr/ordering";
import { OrderingGuest } from "@/components/ordering/ordering-guest";
import { readOrderingIdentity } from "@/components/ordering/guest-identity-server";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  viewportFit: "cover",
};

// cache() dedupes the query between generateMetadata and the page render.
const getState = cache(async (code: string) =>
  fetchQuery(api.ordering.publicOrderingState, { code }),
);

export async function generateMetadata({
  params,
}: PageProps<"/o/[code]">): Promise<Metadata> {
  const { code: rawCode } = await params;
  const robots = { index: false, follow: false };
  const code = normalizeCode(rawCode);
  if (!code) return { robots };
  const state = await getState(code);
  if (state.status !== "available") return { robots };
  return {
    title: fmt(dict.metaTitle, { name: state.businessName }),
    robots,
  };
}

export default async function OrderingGuestPage({
  params,
}: PageProps<"/o/[code]">) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) notFound();

  const state = await getState(code);
  // "absent" means the code resolves to nothing at all — a 404 is the honest
  // answer. "locked" (the venue is not entitled) deliberately does NOT 404: it
  // falls through to the component's single calm unavailable state, because the
  // guest must never be shown the venue's billing standing.
  if (state.status === "absent") notFound();

  const { guestKey } = await readOrderingIdentity(code);

  // SSR-then-subscribe (TASK-67, §2.6): the guest's own live status is rendered
  // by the server from the same query the browser then subscribes to, so a
  // returning guest sees "Prihvaćeno" in the FIRST paint rather than an empty
  // screen that fills in a tick later. Bearer-scoped — with no identity there
  // are no requests to fetch.
  const initialRequests = guestKey
    ? await fetchQuery(api.orderingStatus.myRequests, { code, guestKey })
    : [];

  return (
    <OrderingGuest
      code={code}
      guestKey={guestKey}
      initialState={state}
      initialRequests={initialRequests}
    />
  );
}
