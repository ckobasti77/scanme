import { loadFairActiveEventSlug } from "@/lib/fair-server/garage-page";

export const dynamic = "force-dynamic";

// Legacy event-less garage URL; the garage now lives under the event slug.
export async function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: `/sajam/${await loadFairActiveEventSlug()}/garaza` },
  });
}
