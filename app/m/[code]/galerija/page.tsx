// /m/[code]/galerija — the shared gallery (RFC-001 §2.4 C.4, §2.7, TASK-17).
// 404 unless the host opted the space in via publicGalleryEnabled; the query
// returns null in every other case, and the visibility filter runs inside the
// server — host_only photos never exist on this page in any form.

import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { normalizeCode } from "@/convex/lib/codes";
import { fmt } from "@/lib/i18n/format";
import { memoriesSr as dict } from "@/lib/i18n/sr/memories";
import { MemoriesGallery } from "@/components/memories/memories-gallery";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#171310",
  viewportFit: "cover",
};

const getGallery = cache(async (code: string) =>
  fetchQuery(api.memories.publicGalleryMeta, { code }),
);

export async function generateMetadata({
  params,
}: PageProps<"/m/[code]/galerija">): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  const robots = { index: false, follow: false };
  if (!code) return { robots };
  const gallery = await getGallery(code);
  if (!gallery) return { robots };
  return {
    title: fmt(dict.metaGalleryTitle, { name: gallery.spaceName }),
    robots,
  };
}

export default async function MemoriesGalleryPage({
  params,
}: PageProps<"/m/[code]/galerija">) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) notFound();
  const meta = await getGallery(code);
  if (!meta) notFound();

  return <MemoriesGallery code={code} meta={meta} />;
}
