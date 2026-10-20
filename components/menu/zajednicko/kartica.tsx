// ScanMe Menu V1 — card (K07). Calm rounded cards (master §13.3). Three tones:
// obicna (the default container), utisana (secondary, no shadow) and istaknuta
// (the one darker card of a screen, e.g. analytics). The istaknuta card
// re-scopes the text tokens, so primitives inside it stay readable.

import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils";

export type KarticaTon = "obicna" | "utisana" | "istaknuta";

const TONOVI: Record<KarticaTon, string> = {
  obicna: "border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] shadow-[var(--mp-senka-xs)]",
  utisana: "bg-[var(--mp-povrsina-utisana)]",
  istaknuta: [
    "border [--border:var(--mp-ivica)] bg-[var(--mp-istaknuto)] text-[var(--mp-na-istaknutom)]",
    "[--mp-tekst:var(--mp-na-istaknutom)] [--mp-tekst-sporedni:var(--mp-na-istaknutom-sporedni)]",
    "[--mp-ivica:rgb(242_244_238/0.14)] [--mp-povrsina:rgb(242_244_238/0.06)] [--mp-povrsina-utisana:rgb(242_244_238/0.1)]",
    "[--mp-mastilo:var(--mp-akcent)] [--mp-na-mastilu:var(--mp-na-akcentu)] [--mp-ivica-kontrole:#8a918b]",
    "[--mp-fokus:var(--mp-akcent)] [--focus-ring:var(--mp-akcent)]",
  ].join(" "),
};

type KarticaProps<T extends ElementType> = {
  ton?: KarticaTon;
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function Kartica<T extends ElementType = "div">({ ton = "obicna", as, className, ...rest }: KarticaProps<T>) {
  const Comp: ElementType = as ?? "div";
  return (
    <Comp
      data-kartica={ton}
      className={cn("rounded-[var(--mp-radius-kartica)] p-4 sm:p-5 lg:p-6", TONOVI[ton], className)}
      {...rest}
    />
  );
}
