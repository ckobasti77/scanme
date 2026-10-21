// ScanMe Menu V1 — button and icon button (K07, docs/menu/MENU-UX.md §3).
// Built on the shadcn/ui button recipe (Radix Slot + cva) with Menu tokens.
// The target is never smaller than --mp-meta: 44 px in the panel, 48 px in
// the waiter panel. Not a client component: it renders in either tree.

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { menuZajednickoSr } from "@/lib/i18n/sr/menu-zajednicko";
import { cn } from "@/lib/utils";

export const dugmeKlase = cva(
  [
    "relative inline-flex min-h-[var(--mp-meta)] shrink-0 cursor-pointer select-none items-center justify-center gap-2",
    // The app styles every <button> with border-radius: var(--button-radius) and every element with
    // border-color: var(--border), unlayered (app/globals.css), so Menu sets those variables, not
    // rounded-*/border-* colour utilities (MENU-UX §4).
    "whitespace-nowrap rounded-[var(--mp-radius-dugme)] [--button-radius:var(--mp-radius-dugme)] border font-semibold leading-none",
    "transition-[background-color,border-color,color,transform] duration-[var(--mp-trajanje-1)] ease-[var(--mp-kriva-ulaz)]",
    "active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
    // Disabled is a muted surface with secondary text (readable, 4.5:1 in both themes), not an opacity fade.
    "disabled:cursor-not-allowed disabled:text-[var(--mp-tekst-sporedni)] aria-disabled:cursor-not-allowed",
    "[&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      vrsta: {
        /** The one main action of a screen (Objavi, Preuzmi). */
        primarno:
          "[--border:transparent] bg-[var(--mp-mastilo)] text-[var(--mp-na-mastilu)] hover:bg-[color-mix(in_oklab,var(--mp-mastilo)_84%,var(--mp-okvir))] disabled:[--border:var(--mp-ivica)] disabled:bg-[var(--mp-povrsina-utisana)]",
        /** ScanMe green fill with ink text; used sparingly (Dodaj). */
        akcent:
          "[--border:color-mix(in_oklab,var(--mp-akcent)_70%,var(--mp-mastilo))] bg-[var(--mp-akcent)] text-[var(--mp-na-akcentu)] hover:bg-[color-mix(in_oklab,var(--mp-akcent)_86%,white)] disabled:[--border:var(--mp-ivica)] disabled:bg-[var(--mp-povrsina-utisana)]",
        sekundarno:
          "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)] disabled:[--border:var(--mp-ivica)] disabled:bg-[var(--mp-povrsina-utisana)]",
        tiho: "[--border:transparent] bg-transparent text-[var(--mp-tekst)] hover:bg-[var(--mp-povrsina-utisana)]",
        opasno:
          "[--border:transparent] bg-[var(--mp-opasnost)] text-[var(--mp-na-opasnosti)] hover:bg-[color-mix(in_oklab,var(--mp-opasnost)_86%,var(--mp-mastilo))] disabled:[--border:var(--mp-ivica)] disabled:bg-[var(--mp-povrsina-utisana)]",
      },
      velicina: {
        standardna: "px-5 text-[0.9375rem]",
        kompaktna: "px-4 text-sm",
      },
    },
    defaultVariants: { vrsta: "sekundarno", velicina: "standardna" },
  },
);

type DugmeVarijante = VariantProps<typeof dugmeKlase>;

export type DugmeProps = ComponentProps<"button"> &
  DugmeVarijante & {
    /** Leading icon (decorative; the label names the action). */
    ikonica?: LucideIcon;
    /**
     * Work in progress: the label stays (no layout jump), the icon becomes a
     * spinner, the button reports aria-busy and ignores clicks without losing focus.
     */
    ucitava?: boolean;
    /** Render the child element (e.g. next/link) with the button look; `ikonica` and `ucitava` do not apply. */
    asChild?: boolean;
  };

export function Dugme({
  vrsta,
  velicina,
  ikonica: Ikonica,
  ucitava = false,
  asChild = false,
  className,
  children,
  onClick,
  type = "button",
  ...rest
}: DugmeProps) {
  const klase = cn(dugmeKlase({ vrsta, velicina }), className);
  if (asChild) {
    // K34: onClick goes to the child too (Slot runs the child's own handler first, then this one).
    return <Slot className={klase} onClick={onClick} {...rest}>{children}</Slot>;
  }
  return (
    <button
      type={ucitava ? "button" : type}
      data-stanje={ucitava ? "ucitava" : undefined}
      aria-busy={ucitava || undefined}
      aria-disabled={ucitava || undefined}
      onClick={ucitava ? undefined : onClick}
      className={klase}
      {...rest}
    >
      {ucitava ? (
        <LoaderCircle aria-hidden="true" strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" />
      ) : Ikonica ? (
        <Ikonica aria-hidden="true" strokeWidth={1.75} />
      ) : null}
      {children}
      {ucitava ? <span className="sr-only">{menuZajednickoSr.dugme.radiSe}</span> : null}
    </button>
  );
}

export type IkonicaDugmeProps = Omit<ComponentProps<"button">, "children" | "aria-label"> &
  Pick<DugmeVarijante, "vrsta"> & {
    ikonica: LucideIcon;
    /** The accessible name; also shown as the tooltip. Required: the icon alone names nothing. */
    oznaka: string;
    /** A toggle (e.g. sound on/off): reports aria-pressed and shows the pressed fill. */
    pritisnuto?: boolean;
  };

export function IkonicaDugme({
  ikonica: Ikonica,
  oznaka,
  vrsta = "tiho",
  pritisnuto,
  className,
  type = "button",
  title,
  ...rest
}: IkonicaDugmeProps) {
  return (
    <button
      type={type}
      aria-label={oznaka}
      title={title ?? oznaka}
      aria-pressed={pritisnuto}
      className={cn(
        dugmeKlase({ vrsta }),
        "size-[var(--mp-meta)] min-w-[var(--mp-meta)] px-0",
        pritisnuto && "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)]",
        className,
      )}
      {...rest}
    >
      <Ikonica aria-hidden="true" strokeWidth={1.75} />
    </button>
  );
}
