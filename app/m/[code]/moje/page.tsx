// /m/[code]/moje — the guest's own photos (RFC-001 §2.7, TASK-17). Requires
// the guest cookie; without one there is nothing "mine" to show, so the guest
// lands back on /m/[code], whose no-identity state says what to do in one
// sentence. Whatever state the space is in, the photos stay reachable here.

import type { Metadata, Viewport } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import { MemoriesMyPhotos } from "@/components/memories/memories-my-photos";
import { readGuestIdentity } from "@/components/memories/guest-identity-server";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#171310",
  viewportFit: "cover",
};

const getView = cache(async (code: string, guestKey: string | null) =>
  fetchQuery(
    api.memories.guestSpaceView,
    guestKey ? { code, guestKey } : { code },
  ),
);

export async function generateMetadata({
  params,
}: PageProps<"/m/[code]/moje">): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  const robots = { index: false, follow: false };
  if (!code) return { robots };
  const { guestKey } = await readGuestIdentity(code);
  const view = await getView(code, guestKey);
  if (!view) return { robots };
  return {
    title: fmt(dict.metaMyPhotosTitle, { name: view.spaceName }),
    robots,
  };
}

export default async function MemoriesMyPhotosPage({
  params,
}: PageProps<"/m/[code]/moje">) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) notFound();
  const { guestKey } = await readGuestIdentity(code);
  const view = await getView(code, guestKey);
  if (!view) notFound();
  if (!guestKey) redirect(`/m/${code}`);

  const photos = await fetchQuery(api.memories.myPhotosView, {
    code,
    guestKey,
  });

  return (
    <MemoriesMyPhotos
      code={code}
      guestKey={guestKey}
      initialPhotos={photos}
      spaceName={view.spaceName}
      businessName={view.businessName}
      logoUrl={view.businessLogoUrl}
      canChooseVisibility={view.guestVisibilityChoice}
    />
  );
}
