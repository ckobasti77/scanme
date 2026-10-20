import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { resolverIpHash } from "@/lib/card-resolver-http";
import { handleGuestHop } from "@/lib/menu/http/guest-hop";

// ScanMe Menu V1 (K20) — the card-aware Menu hop: GET /r/[cardCode]/meni →
// open the guest session of the card's table or room → Set-Cookie → 302 to the
// clean menu URL (lib/menu/http/guest-hop.ts; master §9.1).
export const dynamic = "force-dynamic";

let warned = false;

export async function GET(request: Request, { params }: RouteContext<"/r/[cardCode]/meni">) {
  const { cardCode } = await params;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return new Response(null, {
      status: 302,
      headers: { Location: new URL("/r/nevazeca", request.url).toString(), "Cache-Control": "no-store" },
    });
  }
  const convex = new ConvexHttpClient(convexUrl);
  return await handleGuestHop(request, cardCode, {
    mint: (input) => convex.mutation(api.menuGuest.mintFromCard, input),
    secret: process.env.SCANME_GUEST_SECRET || null,
    ipHash: resolverIpHash(request),
    onMissingSecret: () => {
      if (warned) return;
      warned = true;
      console.warn("MENU_GUEST_SECRET_MISSING: SCANME_GUEST_SECRET is not set; positions are not carried");
    },
  });
}
