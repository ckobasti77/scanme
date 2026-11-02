// ScanMe Menu V1 — the ScanMe Menu entry inside the EXISTING client panel
// (K08). It lives on that page, so it uses that page's look (shadcn tokens,
// square card), not the Menu panel tokens. It is one extra block that opens
// the new Menu shell; the tabs of the other services stay as they were.

import { ArrowRight, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { panelKoren } from "@/lib/menu/panel-nav";

const t = menuPanelSr.ulaz;

export function MenuUlaz({
  slug,
  naslovNivo = 2,
}: {
  slug: string;
  /** 1 when the entry is the only thing on the page (a venue with only ScanMe Menu). */
  naslovNivo?: 1 | 2;
}) {
  const Naslov = naslovNivo === 1 ? "h1" : "h2";
  return (
    <section
      aria-labelledby="menu-ulaz-naslov"
      data-menu-ulaz=""
      className="flex flex-col gap-5 border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UtensilsCrossed aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </span>
        <div className="grid gap-1">
          <Naslov id="menu-ulaz-naslov" className="text-lg font-semibold tracking-[-0.02em]">
            {t.naziv}
          </Naslov>
          <p className="text-sm leading-6 text-muted-foreground">{t.opis}</p>
        </div>
      </div>
      {/* Alone on the page it is THE action; above the tabs of other services it stays secondary. */}
      <Button asChild variant={naslovNivo === 1 ? "default" : "outline"} className="min-h-11 shrink-0">
        <Link href={panelKoren(slug)}>
          {t.dugme}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </section>
  );
}
