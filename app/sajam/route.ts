import { loadFairActiveEventSlug } from "@/lib/fair-server/garage-page";

export const dynamic = "force-dynamic";

// Every public fair route lives under the event slug; the bare fair URL points
// at the active event. Temporary (307) because the active event changes.
export async function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: `/sajam/${await loadFairActiveEventSlug()}` },
  });
}
