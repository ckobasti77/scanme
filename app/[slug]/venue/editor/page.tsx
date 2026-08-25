// /[slug]/venue/editor — server shell → client VenueEditorScreen (RFC-001
// §2.7), mirroring app/[slug]/editor/page.tsx. The proxy redirect is
// convenience only; authority lives in requireServiceEditorAccess inside the
// Convex functions.

import type { Metadata } from "next";
import { VenueEditorScreen } from "@/components/venue/editor/venue-editor";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";

export const metadata: Metadata = {
  title: dict.metaEditorTitle,
  robots: { index: false, follow: false },
};

export default async function VenueEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <VenueEditorScreen slug={slug} />;
}
