import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { resolverIpHash } from "@/lib/card-resolver-http";
import { analitikaRezim } from "@/lib/menu/analitika/saglasnost";
import { MAX_TELO_BAJTOVA, pripremiUlaz } from "@/lib/menu/analitika/ulaz";

// ScanMe Menu V1 (K29) — POST /api/meni/analitika: the public menu's analytics
// events (lib/menu/analitika/track.ts sends them with sendBeacon). Drops bots,
// requests without a User-Agent and signed-in ScanMe users (internal traffic)
// before Convex is called; strips the session id while the identifier mode is
// off (the consent point, P8); hashes the IP (the resolver's salted hash, a
// rate-limit key only — the raw IP never reaches Convex). Always answers 204:
// the guest's browser learns nothing and the menu never waits on it.
// Definitions: docs/menu/ANALITIKA-DEFINICIJE.md.

export const dynamic = "force-dynamic";

const PRAZNO = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const tekst = await request.text().catch(() => "");
  if (!tekst || tekst.length > MAX_TELO_BAJTOVA) return PRAZNO();
  let telo: unknown;
  try {
    telo = JSON.parse(tekst);
  } catch {
    return PRAZNO();
  }
  const ulaz = pripremiUlaz(telo, {
    userAgent: request.headers.get("user-agent"),
    prijavljen: Boolean(await convexAuthNextjsToken().catch(() => undefined)),
    rezim: analitikaRezim(process.env.MENU_ANALYTICS_IDENTIFIERS),
  });
  if (!ulaz.ok) return PRAZNO();
  try {
    await fetchMutation(api.menuAnalytics.ingest, {
      slug: ulaz.slug,
      ipHash: resolverIpHash(request),
      uredjaj: ulaz.uredjaj,
      dogadjaji: ulaz.dogadjaji,
    });
  } catch (error) {
    // Only the kind of failure reaches the log, never the events.
    console.error("MENU_ANALYTICS_INGEST_FAILED", error instanceof Error ? error.name : typeof error);
  }
  return PRAZNO();
}
