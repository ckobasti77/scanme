"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LockKeyhole } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";

export function AdminGuard({ children }: { children: ReactNode }) {
  const me = useQuery(api.admin.me);
  const { signOut } = useAuthActions();

  if (me === undefined) {
    return <div className="min-h-[100dvh] bg-background p-6"><div className="h-1 w-40 animate-pulse bg-primary" /></div>;
  }
  if (!me.authenticated) {
    return (
      <AccessFrame title="Prijava je potrebna" body="Ovaj deo sajta je dostupan samo ScanMe administratorima.">
        <Link href="/admin/login" className="button-primary">Otvori prijavu</Link>
      </AccessFrame>
    );
  }
  if (!me.isAdmin) {
    return (
      <AccessFrame title="Nema administratorskog pristupa" body="Prijavljeni nalog može koristiti samo klijentske panele lokala koji su mu dodeljeni.">
        <button type="button" className="button-secondary" onClick={() => void signOut()}>Odjavi nalog</button>
      </AccessFrame>
    );
  }
  return children;
}

function AccessFrame({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-8">
      <section className="w-full max-w-xl border border-border bg-card p-6 sm:p-10">
        <LockKeyhole className="size-8 text-primary" aria-hidden="true" />
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">{title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">{body}</p>
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}
