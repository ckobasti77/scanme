import { fairPublicEventSlug } from "@/lib/fair-public-event";
import { loadFairActiveEventSlug } from "@/lib/fair-server/garage-page";
import { readFairSharedCollection } from "@/lib/fair-server/shared-collection";

export const dynamic = "force-dynamic";

// Legacy share URL (links already sent before the route moved). The
// collection's own event decides the target; an unknown or expired code lands
// on the active event, which shows the expired state.
export async function GET(_request: Request, { params }: { params: Promise<{ shareCode: string }> }) {
  const { shareCode } = await params;
  const collection = await readFairSharedCollection(shareCode);
  const first = collection?.models[0];
  const eventSlug = first ? fairPublicEventSlug(first.eventSlug) : await loadFairActiveEventSlug();
  return new Response(null, {
    status: 307,
    headers: { Location: `/sajam/${eventSlug}/deli/${encodeURIComponent(shareCode)}` },
  });
}
