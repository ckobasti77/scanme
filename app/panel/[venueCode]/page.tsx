// /panel/[venueCode] — the waiter panel (RFC-004 §2.7, §2.10, TASK-68).
//
// The till-side tablet. A PIN opens a shift (the session route beneath this
// page sets the HttpOnly shift cookie); a tablet that reloads gets the shift
// back in the first paint from that cookie — verified here, server-side, and
// handed to the client component as a prop exactly the way /o/[code] hands the
// guest its key. Whether that bearer still belongs to the venue's open shift is
// Convex's answer (orderingPanel.panelView); a stale one falls back to the PIN
// screen without a 404.
//
// Private by nature: noindex.

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { orderingPanelSr as dict } from "@/lib/i18n/sr/ordering-panel";
import { WaiterPanel } from "@/components/ordering/panel/waiter-panel";
import { readShiftBearer } from "@/components/ordering/panel-identity-server";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

// cache() dedupes the query between generateMetadata and the page render.
const getState = cache(async (code: string) =>
  fetchQuery(api.ordering.publicOrderingState, { code }),
);

export async function generateMetadata({
  params,
}: PageProps<"/panel/[venueCode]">): Promise<Metadata> {
  const { venueCode } = await params;
  const robots = { index: false, follow: false };
  const code = normalizeCode(venueCode);
  if (!code) return { robots };
  const state = await getState(code);
  if (state.status !== "available") return { robots, title: dict.pinHeading };
  return { title: fmt(dict.metaTitle, { name: state.businessName }), robots };
}

export default async function WaiterPanelPage({
  params,
}: PageProps<"/panel/[venueCode]">) {
  const { venueCode } = await params;
  const code = normalizeCode(venueCode);
  if (!code) notFound();

  const state = await getState(code);
  // "absent" is a 404. "locked" (not entitled) is NOT: the PIN screen renders
  // and openShift answers `shift/locked`, which the panel shows as its own calm
  // line — the staff need to know ordering is off for this venue, and a 404
  // would read as a broken tablet.
  if (state.status === "absent") notFound();

  const bearer = await readShiftBearer(code);
  const initialView = bearer
    ? await fetchQuery(api.orderingPanel.panelView, { code, bearer })
    : null;
  const open = initialView?.status === "open" ? initialView : null;

  return (
    <WaiterPanel
      code={code}
      businessName={
        state.status === "available" ? state.businessName : (open?.businessName ?? "")
      }
      initialBearer={open ? bearer : null}
      initialView={open}
    />
  );
}
