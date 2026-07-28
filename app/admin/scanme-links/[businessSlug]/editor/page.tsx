import type { Metadata } from "next";
import { ScanMeLinksEditorScreen } from "@/components/admin/scanme-links-editor";

export const metadata: Metadata = {
  title: "Uredi ScanMe Links stranicu | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default async function ScanMeLinksEditorPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  return <ScanMeLinksEditorScreen routeKey={businessSlug} />;
}
