"use client";

// ScanMe Menu V1 — the editor's dialog (K10): the shadcn/ui Dialog (Radix:
// focus trap, Escape, focus returns to the trigger) with the panel tokens on
// its portal, so it keeps the app theme. Title is required (it names the
// dialog for screen readers); actions sit in a row at the bottom.

import type { ReactNode } from "react";
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
  children,
}: {
  otvoreno: boolean;
  onOtvoreno: (otvoreno: boolean) => void;
  naslov: ReactNode;
  opis?: ReactNode;
  podnozje?: ReactNode;
  sirina?: "obicna" | "siroka";
  children?: ReactNode;
}) {
  return (
    <Dialog open={otvoreno} onOpenChange={onOtvoreno}>
      <DialogContent
        data-povrsina="panel"
        {...(opis ? {} : { "aria-describedby": undefined })}
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
