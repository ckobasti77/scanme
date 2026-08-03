"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-background px-4 py-8">
      <section className="w-full max-w-xl border border-border bg-card p-6 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-destructive">
          Greška
        </p>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
          Stranica trenutno ne može da se učita.
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
          Došlo je do neočekivane greške pri učitavanju podataka. Pokušajte
          ponovo; ako se greška ponavlja, javite ScanMe timu.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="button" onClick={() => reset()}>
            Pokušaj ponovo
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Nazad na početnu</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
