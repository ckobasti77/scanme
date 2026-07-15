"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ClientLoginForm } from "@/components/client-panel/client-login";
import { ClientWordmark } from "@/components/client-panel/client-wordmark";
import { api } from "@/convex/_generated/api";

export function ClientPanelEntry() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const panels = useQuery(api.clientPanel.myPanels);
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && panels?.length === 1) {
      router.replace(`/${panels[0].slug}/client-panel`);
    }
  }, [isAuthenticated, panels, router]);

  if (isLoading || (isAuthenticated && panels === undefined)) {
    return <EntryShell><EntryLoading /></EntryShell>;
  }

  if (!isAuthenticated) {
    return (
      <EntryShell>
        <div className="grid gap-8 lg:grid-cols-[1fr_440px] lg:items-center">
          <EntryIntro />
          <ClientLoginForm onSuccess={() => router.replace("/client-panel")} />
        </div>
      </EntryShell>
    );
  }

  if (!panels?.length) {
    return (
      <EntryShell>
        <section className="max-w-xl border border-border bg-card p-6 sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Client panel</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">Nalog još nema povezan panel.</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Proverite da li ste se prijavili emailom iz ScanMe pozivnice ili kontaktirajte ScanMe administratora.</p>
          <Link href="/" className="button-secondary mt-7">Nazad na početak</Link>
        </section>
      </EntryShell>
    );
  }

  return (
    <EntryShell>
      <section className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Client panel</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Izaberite panel lokala.</h1>
        <div className="mt-8 grid gap-3">
          {panels.map((panel) => (
            <Link key={panel.slug} href={`/${panel.slug}/client-panel`} className="group flex min-h-16 items-center justify-between border border-border bg-card px-5 transition-colors hover:border-primary">
              <span className="font-semibold">{panel.name}</span>
              <span className="inline-flex items-center gap-2 text-sm text-primary transition-transform group-hover:translate-x-1">Otvori panel <ArrowUpRight aria-hidden="true" className="size-4" /></span>
            </Link>
          ))}
        </div>
      </section>
    </EntryShell>
  );
}

function EntryShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-[100dvh] bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="ScanMe Client, početak"><ClientWordmark /></Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</div>
    </main>
  );
}

function EntryIntro() {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Zaštićena metrika lokala</p>
      <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.06em] sm:text-5xl">Pristupite svom ScanMe panelu.</h1>
      <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground">Prijavite se emailom iz pozivnice. Nakon prve prijave, ovaj browser pamti vašu sesiju.</p>
    </section>
  );
}

function EntryLoading() {
  return (
    <div className="grid gap-5" aria-label="Proveravamo pristup panelu">
      <div className="h-2 w-44 animate-pulse bg-primary" />
      <div className="h-56 max-w-2xl animate-pulse border border-border bg-card" />
    </div>
  );
}
