import type { Metadata } from "next";
import { ScanMeLinksEditorScreen } from "@/components/admin/scanme-links-editor";

export const metadata: Metadata = {
  title: "Uredi ScanMe Links stranicu | ScanMe Admin",
  robots: { index: false, follow: false },
};

export default async function ScanMeLinksEditorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ScanMeLinksEditorScreen slug={slug} />;
}
