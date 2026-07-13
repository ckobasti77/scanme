import type { Metadata } from "next";
import { ClientPanel } from "@/components/client-panel/client-panel";

export const metadata: Metadata = { title: "Klijentski panel | ScanMe", robots: { index: false, follow: false } };
export default async function ClientPanelPage({ params }: PageProps<"/s/[slug]/client-panel">) { const { slug } = await params; return <ClientPanel slug={slug} />; }
