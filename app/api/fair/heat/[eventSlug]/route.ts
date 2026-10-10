import { handleFairHeat } from "@/lib/fair-server/heat";

// SAJAM SUPER Korak 3: heat levels of the public map, cached 60 s (lib/fair-server/heat.ts).
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/api/fair/heat/[eventSlug]">) {
  const { eventSlug } = await params;
  return handleFairHeat(eventSlug);
}
