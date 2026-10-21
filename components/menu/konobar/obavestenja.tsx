// ScanMe Menu V1 (K27) — the quiet reminder strip of the waiter panel (master
// §13.5; plan K24-20; MENU-UX §1.3, §2.2). The Owner or the Manager sends ONE
// reminder from Operativa to the PIN waiter who accepted a request; it stands
// above the queue in the INFO tone of the guest-cancellation strip (radni-red):
// no sound, no pulse, no flash, a polite live region per row. `Otvori` opens
// the request, `U redu` closes the reminder (the server remembers it as seen);
// both are bordered buttons, so closing does not read as plain text.
// The server returns the unseen ones of the last five; the device hides those
// older than 30 minutes (MENU_STAFF_NOTICE_VISIBLE_MS), the query never reads
// the clock.

import { BellRing } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuKonobarSr } from "@/lib/i18n/sr/menu-konobar";
import { clockTime } from "@/lib/menu/elapsed-time";
import { MENU_STAFF_NOTICE_VISIBLE_MS } from "@/lib/menu/limits";
import { Dugme } from "../zajednicko/dugme";
import type { KonobarPodsetnik } from "./model";

const t = menuKonobarSr.podsetnik;
const NIJEDAN: ReadonlySet<string> = new Set();

/** The reminders still worth showing: not older than 30 minutes, not closed on this device. */
export function vidljiviPodsetnici(
  stavke: readonly KonobarPodsetnik[],
  sadaMs: number,
  zatvoreni: ReadonlySet<string>,
): KonobarPodsetnik[] {
  return stavke.filter((stavka) => !zatvoreni.has(stavka.id) && sadaMs - stavka.createdAt <= MENU_STAFF_NOTICE_VISIBLE_MS);
}

export type PodsetniciProps = {
  stavke: readonly KonobarPodsetnik[];
  sadaMs: number;
  /** `Otvori`: the request the reminder is about. */
  onOtvori(requestId: string): void;
  /** `U redu`: close the reminder. */
  onURedu(id: string): void;
  /** Offline: closing needs the connection (nothing is queued). */
  iskljuceno?: boolean;
};

export function Podsetnici({ stavke, sadaMs, onOtvori, onURedu, iskljuceno = false }: PodsetniciProps) {
  const vidljivi = vidljiviPodsetnici(stavke, sadaMs, NIJEDAN);
  if (vidljivi.length === 0) return null;
  return (
    <ul className="grid gap-2" aria-label={t.oznaka} data-podsetnici>
      {vidljivi.map((stavka) => {
        const delovi = {
          vrsta: menuDomenSr.requestKinds[stavka.kind],
          mesto: stavka.positionLabel,
          vreme: clockTime(stavka.requestCreatedAt),
        };
        return (
          <li
            key={stavka.id}
            role="status"
            data-podsetnik={stavka.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)] py-1 pl-4 pr-1.5 text-[0.9375rem] text-[var(--mp-tekst)]"
          >
            <BellRing aria-hidden="true" strokeWidth={2} className="size-5 shrink-0 text-[var(--mp-info)]" />
            <span className="min-w-0 flex-1 basis-52 py-2 font-semibold">
              {stavka.from.trim() ? fmt(t.tekst, { ko: stavka.from, ...delovi }) : fmt(t.tekstBezImena, delovi)}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <Dugme
                vrsta="sekundarno"
                onClick={() => onOtvori(stavka.requestId)}
                aria-label={fmt(t.otvoriCitac, { vrsta: delovi.vrsta, mesto: delovi.mesto })}
                className="min-h-12 px-4 text-base"
              >
                {t.otvori}
              </Dugme>
              <Dugme
                vrsta="sekundarno"
                disabled={iskljuceno}
                onClick={() => onURedu(stavka.id)}
                aria-label={fmt(t.uReduCitac, { vrsta: delovi.vrsta, mesto: delovi.mesto })}
                className="min-h-12 px-4 text-base"
              >
                {t.uRedu}
              </Dugme>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
