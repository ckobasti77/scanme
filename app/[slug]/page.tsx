import type { Metadata } from "next";
import { ScanRedirect } from "./scan-redirect";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Otvaramo odredište | ScanMe",
  robots: { index: false, follow: false },
};

export default async function ScanPage({ params }: PageProps<"/[slug]">) {
  const { slug } = await params;
  return <ScanRedirect slug={slug} />;
}
