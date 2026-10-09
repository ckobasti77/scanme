import { loadFairActiveEventSlug } from "@/lib/fair-server/garage-page";
import { FAIR_PUBLIC_MAP_ENABLED } from "@/lib/fair-contract";

export const dynamic = "force-dynamic";

// Every public fair route lives under the event slug; the bare fair URL points
// at the active event. Temporary (307) because the active event changes.
export async function GET() {
  return new Response(null, {
    status: 307,
    // 9 Oct 2026: while the map is hidden the active fair opens on its garage.
    headers: { Location: `/sajam/${await loadFairActiveEventSlug()}${FAIR_PUBLIC_MAP_ENABLED ? "" : "/garaza"}` },
  });
}
