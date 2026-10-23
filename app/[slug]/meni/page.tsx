// /[slug]/meni — the public Menu page (RFC-003 §2.5, §2.6, §4 TASK-52/54).
// PUBLISHED rows only, read live: the first paint is SSR'd from a fetchQuery
// snapshot and the client subscribes to the same query, so an availability or
// price change reaches already-open phones with no reload (§2.6, the moat).
// Dayparts (§2.5): the current daypart is resolved server-side at request time
// in the venue timezone and passed to the query as an argument; the client
// (MenuPublic) recomputes it at each minute boundary. The query itself never
// reads the clock. Hidden for the life of the RFC build (MENU_EXISTS stays
// false), by three layers: it is UNLINKED (no admin, client-panel, or
// navigation entry points here), NOINDEXED (the metadata below), and gated in
// the query itself — the reads return null unless a menu exists AND was
// explicitly published, so this route notFound()s otherwise.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { fmt } from "@/lib/i18n";
import { menuSr as dict } from "@/lib/i18n/sr/menu";
import { MenuPublic } from "@/components/menu/menu-public";
import { activeDaypartKey } from "@/lib/menu-dayparts";
import { belgradeMinuteOfDay } from "@/lib/belgrade-time";

export const dynamic = "force-dynamic";

// cache() dedupes the daypart-state read between generateMetadata and the page.
// It is the lightweight read (menus doc + windows only) used to resolve the
// current daypart BEFORE the heavy menu fetch, so the first paint is already
// daypart-correct and matches the client's first render.
const getState = cache(async (slug: string) =>
  fetchQuery(api.menu.menuDaypartStateBySlug, { slug }),
);

export async function generateMetadata({
  params,
}: PageProps<"/[slug]/meni">): Promise<Metadata> {
  const robots = { index: false, follow: false };
  const { slug } = await params;
  const state = await getState(slug);
  if (!state) return { robots };
  return {
    title: fmt(dict.metaTitle, { name: state.businessName }),
    description: fmt(dict.metaDescription, { name: state.businessName }),
    robots,
  };
}

// Resolve the request-time view. The current-daypart clock read lives HERE, in
// a plain async loader — NOT in the component render path (a server component is
// still a render function; reading the wall clock there is impure). We resolve
// the daypart in the venue timezone at this request instant — the same value
// MenuPublic seeds its first client render with (getServerSnapshot), so SSR and
// hydration agree. The manual override is applied inside the query, so we pass
// the clock key here.
async function loadMenuView(slug: string) {
  const state = await getState(slug);
  if (!state) return null;
  const serverActiveKey = activeDaypartKey(
    state.dayparts,
    belgradeMinuteOfDay(Date.now()),
  );
  const view = await fetchQuery(api.menu.publicMenuBySlug, {
    slug,
    activeDaypart: serverActiveKey,
  });
  return view ? { view, serverActiveKey } : null;
}

export default async function MenuPage({ params }: PageProps<"/[slug]/meni">) {
  const { slug } = await params;
  const loaded = await loadMenuView(slug);
  if (!loaded) notFound();

  return (
    <MenuPublic
      initialView={loaded.view}
      slug={slug}
      serverActiveKey={loaded.serverActiveKey}
    />
  );
}
