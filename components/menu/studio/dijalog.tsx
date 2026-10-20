"use client";

// ScanMe Menu V1 — the editor's dialog (K10): the shadcn/ui Dialog (Radix:
// focus trap, Escape, focus returns to the trigger) with the panel tokens on
// its portal, so it keeps the app theme. Title is required (it names the
// dialog for screen readers); actions sit in a row at the bottom. K11:
// `bezVracanjaFokusa` keeps Radix from returning focus to the trigger on
// close, when the caller moves focus itself (the card moved by `Premesti`).
// K18: Radix returns focus only to a DialogTrigger, and the editor opens its
// dialogs from state (no trigger), so focus fell to <body> on close. The
// dialog now remembers what had focus when it opened and returns focus there
// — unless something outside the dialog already took it (a caller that
// focuses its own target keeps it).

import { useRef, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { MENU_TOKENI_KLASA } from "../zajednicko/povrsina";

export function StudioDijalog({
  otvoreno,
  onOtvoreno,
  naslov,
  opis,
  podnozje,
  sirina = "obicna",
  bezVracanjaFokusa = false,
  fokusNaDijalog = false,
  children,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  naslov: ReactNode;
  opis?: ReactNode;
  podnozje?: ReactNode;
  sirina?: "obicna" | "siroka";
  bezVracanjaFokusa?: boolean;
  /** K18: start on the dialog itself, not on its first button (a list whose first button is destructive). */
  fokusNaDijalog?: boolean;
  children?: ReactNode;
}) {
  const okidac = useRef<HTMLElement | null>(null);
  const sadrzaj = useRef<HTMLDivElement | null>(null);
  return (
    <Dialog open={otvoreno} onOpenChange={onOtvoreno}>
      <DialogContent
        ref={sadrzaj}
        data-povrsina="panel"
        {...(opis ? {} : { "aria-describedby": undefined })}
        onOpenAutoFocus={(event) => {
          // Still the opener here: Radix moves focus into the dialog right after this event.
          const aktivan = document.activeElement;
          okidac.current = aktivan instanceof HTMLElement && aktivan !== document.body ? aktivan : null;
          if (fokusNaDijalog) {
            event.preventDefault();
            sadrzaj.current?.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (bezVracanjaFokusa) return;
          const aktivan = document.activeElement;
          const preuzet = aktivan instanceof HTMLElement && aktivan !== document.body && !sadrzaj.current?.contains(aktivan);
          const meta = okidac.current;
          if (!preuzet && meta?.isConnected) meta.focus({ preventScroll: true });
        }}
        className={cn(
          MENU_TOKENI_KLASA,
          "max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden rounded-[var(--mp-radius-okvir)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] p-0 text-[var(--mp-tekst)] shadow-[var(--mp-senka-md)]",
          "grid-rows-[auto_minmax(0,1fr)_auto] motion-reduce:animate-none",
          sirina === "siroka" ? "sm:max-w-[44rem]" : "sm:max-w-[32rem]",
          "[&>button:last-child]:top-3 [&>button:last-child]:right-3 [&>button:last-child]:grid [&>button:last-child]:size-[var(--mp-meta)] [&>button:last-child]:place-items-center [&>button:last-child]:rounded-full [&>button:last-child>svg]:size-5",
        )}
      >
        <div className="grid gap-1 border-b [--border:var(--mp-ivica)] px-5 py-4 pr-16">
          <DialogTitle className="text-lg font-semibold leading-snug tracking-[-0.01em]">{naslov}</DialogTitle>
          {opis ? (
            <DialogDescription className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{opis}</DialogDescription>
          ) : null}
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {podnozje ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t [--border:var(--mp-ivica)] px-5 py-3">
            {podnozje}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
