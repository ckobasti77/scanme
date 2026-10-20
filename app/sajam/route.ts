import { loadFairActiveEventSlug } from "@/lib/fair-server/garage-page";
import { FAIR_PUBLIC_MAP_ENABLED } from "@/lib/fair-contract";

export const dynamic = "force-dynamic";

const AUTO_MOTO_FEST_STARTS_AT = Date.parse("2026-10-30T10:00:00+01:00");

// Every public fair route lives under the event slug; the bare fair URL points
// at the active event. Temporary (307) because the active event changes.
export async function GET() {
  const slug = await loadFairActiveEventSlug();
  const isPreAmf = slug === "auto-moto-fest-2026" && Date.now() < AUTO_MOTO_FEST_STARTS_AT;
  return new Response(null, {
    status: 307,
    // While the map is hidden (FAIR_PUBLIC_MAP_ENABLED false) the active fair opens on its garage,
    // except before Auto Moto Fest starts when /sajam/auto-moto-fest-2026 renders the pre-event lock screen.
    headers: { Location: `/sajam/${slug}${FAIR_PUBLIC_MAP_ENABLED || isPreAmf ? "" : "/garaza"}` },
  });
}
