// ScanMe Menu V1 — the section list of the client panel (K08). One list for
// the side navigation, the icon rail and the phone drawer. The order and the
// visible items come from lib/menu/panel-nav.ts (master §13.1, roles); this
// only draws them. The current item is never colour alone: soft green, an ink
// bar on the left, a thin green ring (it carries the dark theme, where the soft
// green is close to the surface) and bold text, plus aria-current
// (docs/menu/MENU-UX.md §5.2). Items are 8 px apart (§4).

import {
  Activity,
  ChartColumn,
  House,
  QrCode,
  Settings,
  SlidersHorizontal,
  SquarePen,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { PanelNavSekcija } from "@/lib/menu/panel-nav";
import { cn } from "@/lib/utils";

const t = menuPanelSr;

export const SEKCIJA_IKONICA: Readonly<Record<PanelNavSekcija, LucideIcon>> = {
  pocetna: House,
  editor: SquarePen,
  operativa: Activity,
  lokal: QrCode,
  funkcionalnosti: SlidersHorizontal,
  tim: UsersRound,
  analitika: ChartColumn,
  podesavanja: Settings,
};

export type PanelNavStavka = { sekcija: PanelNavSekcija; href: string };

export function PanelNav({
  stavke,
  aktivna,
  skupljeno = false,
  onIzbor,
}: {
  stavke: readonly PanelNavStavka[];
  aktivna: PanelNavSekcija | null;
  /** Icon rail: the label stays for screen readers and as the tooltip. */
  skupljeno?: boolean;
  /** Called when an item is chosen (the phone drawer closes itself). */
  onIzbor?: () => void;
}) {
  return (
    <nav aria-label={t.shell.navigacija}>
      <ul className="grid gap-2">
        {stavke.map(({ sekcija, href }) => {
          const Ikonica = SEKCIJA_IKONICA[sekcija];
          const trenutna = sekcija === aktivna;
          const oznaka = t.sekcije[sekcija];
          return (
            <li key={sekcija}>
              <Link
                href={href}
                aria-current={trenutna ? "page" : undefined}
                title={skupljeno ? oznaka : undefined}
                data-sekcija={sekcija}
                onClick={onIzbor}
                className={cn(
                  "relative flex min-h-[var(--mp-meta)] items-center gap-3 rounded-[var(--mp-radius-kontrola)] text-[0.9375rem] text-[var(--mp-tekst)]",
                  "transition-colors duration-[var(--mp-trajanje-1)] ease-[var(--mp-kriva-ulaz)] motion-reduce:transition-none",
                  skupljeno ? "size-[var(--mp-meta)] justify-center" : "px-3",
                  trenutna
                    ? "bg-[var(--mp-akcent-meko)] font-semibold ring-1 ring-inset ring-[color-mix(in_oklab,var(--mp-akcent-tekst)_40%,transparent)]"
                    : "font-medium hover:bg-[var(--mp-povrsina-utisana)]",
                )}
              >
                {trenutna ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-[var(--mp-mastilo)]"
                  />
                ) : null}
                <Ikonica aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
                <span className={skupljeno ? "sr-only" : "min-w-0 truncate"}>{oznaka}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
