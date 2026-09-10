"use client";

// The public Menu page's data seam (RFC-003 §2.5, §2.6, §4 TASK-52/54):
// SSR-then-subscribe, with the daypart resolved on the CLIENT.
//
// The server route renders this with `initialView` from a fetchQuery, so the
// first paint is a complete, daypart-correct menu (the §2.12 budget). Then this
// subscribes to the same query via useQuery and swaps to the live value, so an
// `available` toggle or a price edit reaches an already-open phone with no
// reload — the §2.6 moat, §3 Risk #2 (no static/ISR export of the
// availability-bearing fields).
//
// Dayparts (§2.5): the current daypart is computed HERE, from the venue
// timezone (Belgrade — never the guest device's zone), and passed to the query
// as an argument. The query must not read the wall clock, or a reactive query
// would never re-run at a boundary (the owner decision). We recompute at each
// minute boundary via useSyncExternalStore; when the daypart key changes, the
// new query argument re-runs the subscription and the groups swap. The manual
// override (which beats the clock) is applied inside the query, so an override
// flip propagates live without the client knowing it. SSR and the first client
// render both use `serverActiveKey` (getServerSnapshot below), so they agree —
// no hydration mismatch; the client corrects to its own clock only after paint.

import { useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { activeDaypartKey } from "@/lib/menu-dayparts";
import { belgradeMinuteOfDay } from "@/lib/belgrade-time";
import { MenuPublicView } from "./menu-public-view";
import type { MenuLiveView } from "./menu-view";

// Fire once at the next minute boundary, then every minute. Module-scope so the
// reference is stable — React would otherwise re-subscribe (and reset the
// timer) on every render. setTimeout (not rAF) keeps firing in a backgrounded
// tab, so the menu is correct when the guest returns to it.
function subscribeToMinuteBoundary(onChange: () => void): () => void {
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(
    () => {
      onChange();
      interval = setInterval(onChange, 60_000);
    },
    60_000 - (Date.now() % 60_000),
  );
  return () => {
    clearTimeout(timeout);
    if (interval) clearInterval(interval);
  };
}

export function MenuPublic({
  initialView,
  slug,
  serverActiveKey,
}: {
  initialView: MenuLiveView;
  slug: string;
  serverActiveKey: string | null;
}) {
  // The clock daypart in the venue timezone. Resolved from the SSR-shipped
  // windows (daypart windows are config, not the live moat). getServerSnapshot
  // returns the server-computed key so the first hydration render matches SSR;
  // getSnapshot re-resolves from the client clock after paint and at each
  // minute boundary. Override precedence is the query's job, not this one's.
  const clockDaypart = useSyncExternalStore(
    subscribeToMinuteBoundary,
    () => activeDaypartKey(initialView.dayparts, belgradeMinuteOfDay(Date.now())),
    () => serverActiveKey,
  );

  const live = useQuery(api.menu.publicMenuBySlug, {
    slug,
    activeDaypart: clockDaypart,
  });
  // `undefined` = subscription still resolving; `null` = the menu is gone/
  // unpublished. Keep the server's first paint until a real live value arrives.
  const view = (live ?? initialView) as MenuLiveView;
  return <MenuPublicView view={view} slug={slug} />;
}
