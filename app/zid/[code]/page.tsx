// /zid/[code] — the live wall (RFC-001 §2.4 C.4, TASK-22). Projected on a TV in
// the room. 404 unless the host enabled the wall (wallView returns null in every
// other case). The only ready+everyone photos ever reach the client, filtered in
// the query — a host_only photo can never appear on a projector in a full room.
// Private surface: noindex, no cursor, full bleed.

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { memoriesWallSr as dict } from "@/lib/i18n/sr/memories-wall";
import { WallScreen } from "@/components/memories/wall/wall-screen";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0d0a08",
  viewportFit: "cover",
  // A projected wall is a fixed display; block pinch-zoom so a stray touch on a
  // touchscreen TV cannot scroll or zoom the furniture out of place.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export async function generateMetadata({
  params,
}: PageProps<"/zid/[code]">): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  const robots = { index: false, follow: false };
  if (!code) return { robots };
  const meta = await fetchQuery(api.memoriesWall.wallView, { code });
  if (!meta) return { robots };
  return {
    title: fmt(dict.metaTitle, { name: meta.spaceName }),
    robots,
  };
}

export default async function MemoriesWallPage({
  params,
}: PageProps<"/zid/[code]">) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) notFound();
  const meta = await fetchQuery(api.memoriesWall.wallView, { code });
  if (!meta) notFound();

  // The QR's join URL, resolved from the request so it points at the exact
  // deployment origin serving the wall — scannable on the first paint.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const joinUrl = host ? `${proto}://${host}/m/${meta.joinCode}` : "";

  return <WallScreen code={code} meta={meta} joinUrl={joinUrl} />;
}
