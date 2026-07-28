import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const dynamic = "force-dynamic";

function response(status: number, body: object) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return response(503, { status: "error", message: "ScanMe veza nije podešena." });
  }
  try {
    const body = (await request.json()) as unknown;
    if (
      !body ||
      typeof body !== "object" ||
      !("requestId" in body) ||
      !("destinationId" in body) ||
      !("clickId" in body) ||
      typeof body.requestId !== "string" ||
      typeof body.destinationId !== "string" ||
      typeof body.clickId !== "string"
    ) {
      return response(400, { status: "error", message: "Klik nije ispravan." });
    }
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.scanMeLinks.recordClick, {
      requestId: body.requestId,
      destinationId: body.destinationId as Id<"serviceDestinations">,
      clickId: body.clickId,
    });
    return response(200, { status: "recorded", ...result });
  } catch {
    return response(200, { status: "error", message: "Klik nije zabeležen." });
  }
}
