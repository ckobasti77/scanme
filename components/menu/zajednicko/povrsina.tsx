// ScanMe Menu V1 — the root of an app-theme Menu surface (K07). Everything
// under it reads the `--mp-*` tokens; a portal (drawer, dialog) carries the
// same class itself. The public menu never uses it (docs/menu/MENU-UX.md §1).

import type { ComponentPropsWithoutRef, ElementType } from "react";
import { cn } from "@/lib/utils";
import tokeni from "./tokeni.module.css";

export type MenuPovrsinaVrsta = "panel" | "konobar";

/** The token class for a portal or another root outside MenuPovrsina. */
export const MENU_TOKENI_KLASA = tokeni.povrsina;

type MenuPovrsinaProps<T extends ElementType> = {
  /** panel = client panel and editor (44 px targets); konobar = waiter panel (48 px, higher contrast). */
  povrsina?: MenuPovrsinaVrsta;
  as?: T;
} & Omit<ComponentPropsWithoutRef<T>, "as">;

export function MenuPovrsina<T extends ElementType = "div">({
  povrsina = "panel",
  as,
  className,
  ...rest
}: MenuPovrsinaProps<T>) {
  const Comp: ElementType = as ?? "div";
  return (
    <Comp
      data-povrsina={povrsina}
      className={cn(tokeni.povrsina, "bg-[var(--mp-okvir)] text-[var(--mp-tekst)] antialiased", className)}
      {...rest}
    />
  );
}
