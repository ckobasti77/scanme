import { fairGarageDefinition, loadFairActiveEventSlug } from "@/lib/fair-server/garage-page";

export const dynamic = "force-dynamic";

// Legacy compare URL. Its `?event=` (when a known event) picks the target
// event; the query string is kept as is so the selected models survive.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventSlug =
    fairGarageDefinition(url.searchParams.get("event") ?? "")?.publicSlug ??
    (await loadFairActiveEventSlug());
  return new Response(null, {
    status: 307,
    headers: { Location: `/sajam/${eventSlug}/garaza/poredjenje${url.search}` },
  });
}
