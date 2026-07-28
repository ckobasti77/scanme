"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { LockKeyhole, LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";

export function EditorAccessGuard({
  routeKey,
  children,
}: {
  routeKey: string;
  children: ReactNode;
}) {
  const access = useQuery(api.scanMeLinks.editorAccessByRouteKey, { routeKey });
  const { signOut } = useAuthActions();

  if (access === undefined) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-[#f4f2ec] p-6">
        <div
          className="h-1 w-40 animate-pulse rounded-full bg-primary"
          aria-label="Provera pristupa editoru"
        />
      </main>
    );
  }

  if (access.status === "available") {
    return children;
  }

  if (access.status === "unauthenticated") {
    return (
      <EditorAccessFrame
        title="Prijava je potrebna"
        body="Prijavite se nalogom koji ima pristup ovom lokalu."
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/admin/login">Admin prijava</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/${encodeURIComponent(access.canonicalSlug)}/client-panel`}>
              Klijentska prijava
            </Link>
          </Button>
        </div>
      </EditorAccessFrame>
    );
  }

  return (
    <EditorAccessFrame
      title="Nemate pristup editoru"
      body={
        access.reason === "editing_disabled"
          ? "Uređivanje ScanMe Links stranice nije uključeno za ovaj klijentski nalog."
          : "Prijavljeni nalog nije povezan sa ovim lokalom."
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild variant="outline">
          <Link href={`/${encodeURIComponent(access.canonicalSlug)}/client-panel`}>
            Nazad na klijentski panel
          </Link>
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="size-4" />
          Odjavi nalog
        </Button>
      </div>
    </EditorAccessFrame>
  );
}

function EditorAccessFrame({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[#f4f2ec] px-4 py-8">
      <section className="w-full max-w-xl rounded-[18px] border border-black/10 bg-[#fcfbf8] p-6 sm:p-10">
        <LockKeyhole className="size-8 text-primary" aria-hidden="true" />
        <h1 className="mt-8 text-3xl font-semibold tracking-[-0.05em]">{title}</h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">{body}</p>
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}
