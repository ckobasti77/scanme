import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

function deviceCategory(userAgent: string) {
  const value = userAgent.toLowerCase();
  if (/bot|crawler|spider|preview|facebookexternalhit|whatsapp/.test(value)) return "bot" as const;
  if (/ipad|tablet/.test(value)) return "tablet" as const;
  if (/mobile|iphone|android/.test(value)) return "mobile" as const;
  if (value) return "desktop" as const;
  return "unknown" as const;
}

function externalReferrerHost(request: Request) {
  const referrer = request.headers.get("referer");
  if (!referrer) return undefined;
  try {
    const requestHost = new URL(request.url).hostname;
    const referrerHost = new URL(referrer).hostname.toLowerCase();
    return referrerHost !== requestHost ? referrerHost : undefined;
  } catch {
    return undefined;
  }
}

function response(status: number, body: object) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
}

export async function POST(request: Request, { params }: RouteContext<"/api/scans/[slug]">) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return response(503, { status: "error", message: "ScanMe veza nije podešena." });
  try {
    const { slug } = await params;
    const body = (await request.json()) as { requestId?: unknown };
    if (typeof body.requestId !== "string") {
      return response(400, { status: "error", message: "Zahtev skeniranja nije ispravan." });
    }
    const referrerHost = externalReferrerHost(request);
    const convex = new ConvexHttpClient(convexUrl);
    const result = await convex.mutation(api.redirects.resolveAndRecord, {
      slug,
      requestId: body.requestId,
      deviceCategory: deviceCategory(request.headers.get("user-agent") ?? ""),
      ...(referrerHost ? { referrerHost } : {}),
    });
    if (result.status === "available") return response(200, result);
    if (result.status === "inactive") {
      return response(200, { ...result, message: "Ovaj ScanMe kod više nije aktivan." });
    }
    if (result.status === "invalid_destination") {
      return response(200, { ...result, message: "Odredište nije bezbedno podešeno." });
    }
    return response(200, { ...result, message: "ScanMe kod nije pronađen." });
  } catch {
    return response(200, { status: "error", message: "ScanMe kod nije pronađen." });
  }
}
