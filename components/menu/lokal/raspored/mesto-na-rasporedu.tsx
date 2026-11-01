"use client";

// ScanMe Menu V1 (K20) — one position in the floor layout grid. A real
// <button> placed by percentages of its grid (square cells), draggable with the
// mouse and, after a short press, with a finger. Everything a screen reader
// needs is in its name (label, kind, seats, place, size, shape); the visible
// text shrinks with the container (full label from 32 rem, the number below).
// Kind is never colour alone: table = solid frame, room = bed icon, other =
// dashed frame. Selected = dark frame, soft green fill, check mark.

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Ban, BedDouble, Check, Store, Users, type LucideIcon } from "lucide-react";
import { useCallback, type CSSProperties, type KeyboardEvent } from "react";
import type { FloorLayout, FloorPositionKind } from "@/lib/menu/floor-layout";
import type { LokalPozicija } from "@/lib/menu/lokal/model";
import { cn } from "@/lib/utils";
import { geometrija, opisMesta, prikazMesta, procenat, skratiOznaku } from "./raspored-logika";

/** Fill and frame colour per kind (the frame colour is the --border variable: the app sets border-color globally). */
export const KLASE_VRSTE: Record<FloorPositionKind, string> = {
  table: "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)]",
  room: "[--border:var(--mp-info)] bg-[var(--mp-info-meko)]",
  other: "[--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina-utisana)]",
};

export const KLASE_IZABRANO =
  "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)] ring-1 ring-[color:var(--mp-mastilo)]";

const KLASE_ZAUZETO =
  "[--border:var(--mp-opasnost)] bg-[var(--mp-opasnost-meko)] ring-1 ring-[color:var(--mp-opasnost)]";

/** The icon that tells a room or another place from a table (a table has none). */
export const IKONICE_VRSTE: Partial<Record<FloorPositionKind, LucideIcon>> = {
  room: BedDouble,
  other: Store,
};

export type MestoNaRasporeduProps = {
  pozicija: LokalPozicija;
  layout: FloorLayout;
  redova: number;
  izabrano: boolean;
  /** Roving tabindex: one position of a grid is a tab stop. */
  tabIndex: 0 | -1;
  /** While this position is dragged: the spot under it is taken or outside. */
  zauzetoPovlacenje: boolean;
  registruj(id: string, element: HTMLButtonElement | null): void;
  onKlik(id: string, dugme: HTMLButtonElement): void;
  onFokus(id: string): void;
  onTaster(id: string, event: KeyboardEvent<HTMLButtonElement>): void;
};

export function MestoNaRasporedu({
  pozicija,
  layout,
  redova,
  izabrano,
  tabIndex,
  zauzetoPovlacenje,
  registruj,
  onKlik,
  onFokus,
  onTaster,
}: MestoNaRasporeduProps) {
  const { setNodeRef, listeners, transform, isDragging } = useDraggable({ id: pozicija.id });
  const ref = useCallback(
    (element: HTMLButtonElement | null) => {
      setNodeRef(element);
      registruj(pozicija.id, element);
    },
    [setNodeRef, registruj, pozicija.id],
  );
  const geo = geometrija(layout, redova);
  const prikaz = prikazMesta(layout, pozicija);
  const kratko = skratiOznaku(pozicija.label);
  const zauzeto = isDragging && zauzetoPovlacenje;
  const IkonicaVrste = IKONICE_VRSTE[pozicija.kind];
  const imaSedista = pozicija.seats !== null && pozicija.seats > 0;

  const stil: CSSProperties = {
    left: procenat(geo.levo),
    top: procenat(geo.vrh),
    width: procenat(geo.sirina),
    height: procenat(geo.visina),
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 30 : izabrano ? 10 : undefined,
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={izabrano}
      aria-label={opisMesta(pozicija, layout)}
      tabIndex={tabIndex}
      data-mesto={pozicija.id}
      data-vrsta={pozicija.kind}
      data-oblik={layout.shape}
      data-izabrano={izabrano ? "" : undefined}
      style={stil}
      className={cn(
        "absolute box-border flex cursor-grab touch-manipulation select-none items-center justify-center overflow-hidden border-2 p-0 text-center text-[var(--mp-tekst)] [-webkit-touch-callout:none] active:cursor-grabbing",
        "transition-[background-color,box-shadow] duration-[var(--mp-trajanje-1)] motion-reduce:transition-none",
        layout.shape === "round" ? "rounded-full [--button-radius:9999px]" : "rounded-[0.375rem] [--button-radius:0.375rem]",
        pozicija.kind === "other" && "border-dashed",
        zauzeto ? KLASE_ZAUZETO : izabrano ? KLASE_IZABRANO : cn(KLASE_VRSTE[pozicija.kind], "hover:[--border:var(--mp-mastilo)]"),
        isDragging && "shadow-[var(--mp-senka-md)]",
      )}
      onClick={(event) => onKlik(pozicija.id, event.currentTarget)}
      onFocus={() => onFokus(pozicija.id)}
      onKeyDown={(event) => onTaster(pozicija.id, event)}
      {...listeners}
    >
      <span className="pointer-events-none flex min-w-0 max-w-full flex-col items-center justify-center gap-[2px] px-0.5 leading-none">
        <span
          className={cn(
            "block max-w-full truncate text-[0.6875rem] leading-none tabular-nums @lg:text-xs",
            izabrano ? "font-bold" : "font-semibold",
          )}
        >
          {prikaz.punaOznaka ? (
            <>
              <span className="@lg:hidden">{kratko}</span>
              <span className="hidden @lg:inline">{pozicija.label}</span>
            </>
          ) : (
            kratko
          )}
        </span>
        {prikaz.drugiRed ? (
          <span className="hidden items-center gap-1 text-[0.625rem] font-medium leading-none text-[var(--mp-tekst-sporedni)] @lg:flex">
            {IkonicaVrste ? <IkonicaVrste aria-hidden="true" strokeWidth={2} className="size-3 shrink-0" /> : null}
            {imaSedista ? (
              <>
                <Users aria-hidden="true" strokeWidth={2} className="size-3 shrink-0" />
                <span className="tabular-nums">{pozicija.seats}</span>
              </>
            ) : null}
          </span>
        ) : null}
      </span>
      {izabrano && !zauzeto && layout.w >= 2 ? (
        <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute right-0.5 top-0.5 size-3 text-[var(--mp-mastilo)]" />
      ) : null}
      {zauzeto ? (
        <Ban aria-hidden="true" strokeWidth={2.5} className="pointer-events-none absolute right-0.5 top-0.5 size-3.5 text-[var(--mp-opasnost)]" />
      ) : null}
    </button>
  );
}
