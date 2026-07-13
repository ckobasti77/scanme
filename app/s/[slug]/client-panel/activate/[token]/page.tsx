import type { Metadata } from "next";
import { ActivationPanel } from "@/components/client-panel/activation-panel";

export const metadata: Metadata = { title: "Aktivacija naloga | ScanMe", robots: { index: false, follow: false } };
export default async function ActivatePage({ params }: PageProps<"/s/[slug]/client-panel/activate/[token]">) { const { slug, token } = await params; return <ActivationPanel slug={slug} token={token} />; }
