// /m/[code] — the guest landing and upload screen (RFC-001 §2.7, TASK-17).
// The guest arrives from a scanned card already carrying the HttpOnly cookie
// set by /r/[cardCode]; this page NEVER mints identity itself — it verifies
// what arrived and renders the correct state server-side, so the first paint
// is always a real screen, never a blank shell. Private by nature: noindex.

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import { serverNow } from "@/lib/venue-calendar";
import { MemoriesLanding } from "@/components/memories/memories-landing";
import { readGuestIdentity } from "@/components/memories/guest-identity-server";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#171310",
  viewportFit: "cover",
};

// cache() dedupes the query between generateMetadata and the page render.
const getView = cache(async (code: string, guestKey: string | null) =>
  fetchQuery(
    api.memories.guestSpaceView,
    guestKey ? { code, guestKey } : { code },
  ),
);

export async function generateMetadata({
  params,
}: PageProps<"/m/[code]">): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  const robots = { index: false, follow: false };
  if (!code) return { robots };
  const { guestKey } = await readGuestIdentity(code);
  const view = await getView(code, guestKey);
  if (!view) return { robots };
  return {
    title: fmt(dict.metaLandingTitle, { name: view.spaceName }),
    robots,
  };
}

export default async function MemoriesLandingPage({
  params,
}: PageProps<"/m/[code]">) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) notFound();
  const { guestKey, cookieValue } = await readGuestIdentity(code);
  const view = await getView(code, guestKey);
  if (!view) notFound();

  return (
    <MemoriesLanding
      code={code}
      guestKey={guestKey}
      cookieValue={cookieValue}
      initialView={view}
      convexUrl={process.env.NEXT_PUBLIC_CONVEX_URL ?? ""}
      serverNow={serverNow()}
    />
  );
}
