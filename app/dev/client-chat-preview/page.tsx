import { notFound } from "next/navigation";
import Link from "next/link";
import { ClientPanelChatPreview } from "@/components/client-panel/client-panel-chat";
import { ClientWordmark } from "@/components/client-panel/client-wordmark";
import { ThemeToggle } from "@/components/theme-toggle";

export default function ClientChatPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6"><Link href="/" aria-label="ScanMe Client, početak"><ClientWordmark /></Link><ThemeToggle /></div></header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12"><ClientPanelChatPreview /></div>
    </main>
  );
}
