"use client";

// ScanMe Menu V1 — the editor's action menu (K10): the shadcn/ui dropdown
// (Radix: arrow keys, Escape, focus returns to the trigger) in panel tokens.
// Items are 44 px tall; a destructive item is marked by colour AND its text.
// K11: an item may name its group ("Odmah za goste", "U nacrtu"); a new group
// gets a separator and a small label, so live and draft actions never mix.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Fragment } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MENU_TOKENI_KLASA } from "../zajednicko/povrsina";

export type StavkaMenija = {
  kljuc: string;
  tekst: string;
  opis?: string;
  ikonica?: LucideIcon;
  opasno?: boolean;
  /** K11: the group the item belongs to; shown as a label where a new group starts. */
  grupa?: string;
  onIzbor: () => void;
};

export function MeniRadnji({
  okidac,
  stavke,
  poravnanje = "end",
}: {
  okidac: ReactNode;
  stavke: readonly StavkaMenija[];
  poravnanje?: "start" | "end";
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{okidac}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={poravnanje}
        data-povrsina="panel"
        className={cn(
          MENU_TOKENI_KLASA,
          "min-w-[14rem] max-w-[min(20rem,calc(100vw-2rem))] rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] p-1 text-[var(--mp-tekst)] shadow-[var(--mp-senka-md)] motion-reduce:animate-none",
        )}
      >
        {stavke.map((stavka, indeks) => {
          const Ikonica = stavka.ikonica;
          const novaGrupa = stavka.grupa !== undefined && stavka.grupa !== stavke[indeks - 1]?.grupa;
          return (
            <Fragment key={stavka.kljuc}>
              {novaGrupa && indeks > 0 ? <DropdownMenuSeparator className="bg-[var(--mp-ivica)]" /> : null}
              {novaGrupa ? (
                <DropdownMenuLabel className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--mp-tekst-sporedni)]">
                  {stavka.grupa}
                </DropdownMenuLabel>
              ) : null}
            <DropdownMenuItem
              data-stavka={stavka.kljuc}
              onSelect={stavka.onIzbor}
              className={cn(
                // K33: the base item has `outline-none` (Tailwind 4 sets --tw-outline-style: none), so the
                // ring needs `outline-solid` too; inset, because the content clips with overflow-hidden.
                // Radix focuses the item with element.focus(), which :focus-visible matches after a key.
                "min-h-[var(--mp-meta)] items-start gap-3 rounded-[calc(var(--mp-radius-kontrola)-2px)] px-3 py-2.5 text-[0.9375rem] focus:bg-[var(--mp-povrsina-utisana)] focus:text-[var(--mp-tekst)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid focus-visible:outline-[var(--mp-fokus)]",
                stavka.opasno && "text-[var(--mp-opasnost)] focus:text-[var(--mp-opasnost)]",
              )}
            >
              {Ikonica ? <Ikonica aria-hidden="true" strokeWidth={1.75} className="mt-0.5 !size-[1.125rem]" /> : null}
              <span className="grid gap-0.5">
                <span className="font-medium leading-snug">{stavka.tekst}</span>
                {stavka.opis ? (
                  <span className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{stavka.opis}</span>
                ) : null}
              </span>
            </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
