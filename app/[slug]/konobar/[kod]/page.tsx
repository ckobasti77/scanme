// /[slug]/konobar/[kod] — the waiter panel of ScanMe Menu (K22; master §10).
// A separate workspace behind a secret link code: a wrong or changed code is a
// 404. A device that signed in with a PIN in the last 12 hours carries the
// HttpOnly cookie smk_s; it is verified here and the token handed to the live
// panel (components/menu/konobar/ruta.tsx), whose subscriptions carry it. The
// Owner and Managers may enter with their own account. Never indexed, never
// cached. /[slug]/konobar (K08) stays the page that explains how to get here.

import type { Metadata, Viewport } from "next";
import { fetchQuery } from "convex/nextjs";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { cache } from "react";
import { api } from "@/convex/_generated/api";
import { KonobarRuta } from "@/components/menu/konobar/ruta";
import { fmt } from "@/lib/i18n/format";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { STAFF_SESSION_COOKIE, readStaffSessionToken } from "@/lib/menu/http/staff-session";
import { normalizePanelCode } from "@/lib/menu/panel-code";
import { menuNaslov } from "@/lib/menu-naslovi";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

const t = menuKonobarSr.meta;

const ulaz = cache(async (slug: string, kod: string) => {
  const panelCode = normalizePanelCode(kod);
  if (!panelCode) return null;
  const entry = await fetchQuery(api.menuWaiter.panelEntry, { slug, panelCode });
  return entry ? { ...entry, panelCode } : null;
});

/** The server's instant for the first render of the live timers. */
function sadaMs(): number {
  return Date.now();
}

export async function generateMetadata({ params }: PageProps<"/[slug]/konobar/[kod]">): Promise<Metadata> {
  const { slug, kod } = await params;
  const robots = { index: false, follow: false };
  const entry = await ulaz(slug.toLowerCase(), kod);
  return { title: menuNaslov(entry ? fmt(t.naslovLokala, { lokal: entry.businessName }) : t.naslov), robots, referrer: "no-referrer" };
}

export default async function KonobarskiPanelPage({ params }: PageProps<"/[slug]/konobar/[kod]">) {
  const { slug: sirovSlug, kod } = await params;
  const slug = sirovSlug.toLowerCase();
  const entry = await ulaz(slug, kod);
  if (!entry) notFound();

  const store = await cookies();
  const token = await readStaffSessionToken(
    `${STAFF_SESSION_COOKIE}=${store.get(STAFF_SESSION_COOKIE)?.value ?? ""}`,
    slug,
    process.env.SCANME_GUEST_SECRET || null,
  );

  return (
    <KonobarRuta
      slug={slug}
      panelCode={entry.panelCode}
      lokal={entry.businessName}
      pinDostupan={entry.pinAvailable}
      pocetniToken={token}
      pocetnoMs={sadaMs()}
    />
  );
}
