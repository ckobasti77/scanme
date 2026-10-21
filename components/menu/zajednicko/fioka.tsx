"use client";

// ScanMe Menu V1 — drawer for tablet and phone (K07). On a wide screen the
// same content is a column of the layout; below the breakpoint it moves into
// this drawer (master §13.4: the editor structure is a drawer on a tablet).
// Built on the shadcn/ui Sheet (Radix Dialog): focus trap, Escape closes,
// focus returns to the trigger. The portal carries the Menu token class, so
// the drawer keeps the panel theme (DASHBOARD-STANDARD §8, portals).

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { MENU_TOKENI_KLASA, type MenuPovrsinaVrsta } from "./povrsina";

export type FiokaStrana = "levo" | "desno" | "dole";

const STRANE = { levo: "left", desno: "right", dole: "bottom" } as const;

export function Fioka({
  okidac,
  naslov,
  opis,
  strana = "levo",
  povrsina = "panel",
  otvoreno,
  onOtvoreno,
  podrazumevanoOtvoreno,
  podnozje,
  children,
  className,
}: {
  /** The element that opens the drawer (a Dugme or IkonicaDugme); focus returns to it on close. */
  okidac?: ReactNode;
  /** Required: names the dialog for screen readers. */
  naslov: ReactNode;
  opis?: ReactNode;
  strana?: FiokaStrana;
  povrsina?: MenuPovrsinaVrsta;
  otvoreno?: boolean;
  onOtvoreno?: (otvoreno: boolean) => void;
  podrazumevanoOtvoreno?: boolean;
  /** A row of actions pinned to the bottom of the drawer. */
  podnozje?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={otvoreno} onOpenChange={onOtvoreno} defaultOpen={podrazumevanoOtvoreno}>
      {okidac ? <SheetTrigger asChild>{okidac}</SheetTrigger> : null}
      <SheetContent
        side={STRANE[strana]}
        data-povrsina={povrsina}
        data-fioka={strana}
        {...(opis ? {} : { "aria-describedby": undefined })}
        className={cn(
          MENU_TOKENI_KLASA,
          // Radix focuses the (tabindex -1) container on open; it is not a control, so no ring around the whole drawer.
          "gap-0 outline-none [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] p-0 text-[var(--mp-tekst)] shadow-[var(--mp-senka-md)]",
          "data-[state=closed]:duration-[var(--mp-trajanje-2)] data-[state=open]:duration-[var(--mp-trajanje-3)] motion-reduce:animate-none",
          strana === "dole"
            ? "max-h-[85dvh] rounded-t-[var(--mp-radius-okvir)]"
            : "w-[min(22rem,88vw)] sm:max-w-[22rem]",
          className,
        )}
      >
        <SheetHeader className="gap-1 border-b [--border:var(--mp-ivica)] px-5 py-4 pr-14 text-left">
          <SheetTitle className="text-lg font-semibold leading-snug tracking-[-0.01em]">{naslov}</SheetTitle>
          {opis ? (
            <SheetDescription className="text-sm text-[var(--mp-tekst-sporedni)]">{opis}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {podnozje ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t [--border:var(--mp-ivica)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {podnozje}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
