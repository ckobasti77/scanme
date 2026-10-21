// ScanMe Menu V1 (K20) — how a QR card is described in words: its state, where
// a scan leads, when it was last scanned, and what is wrong with it. All of it
// reads the diagnosis of lib/menu/qr-diagnostics.ts, so the list of cards and
// the drawer of a position can never disagree. A state is an icon plus text,
// never colour alone.

import { CircleCheck, ExternalLink, PowerOff, TriangleAlert, type LucideIcon } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuLokalSr } from "@/lib/i18n/sr/menu-lokal";
import type { LokalKartica } from "@/lib/menu/lokal/model";
import type { QrDijagnoza, QrProblem, QrStanje } from "@/lib/menu/qr-diagnostics";
import { StatusOznaka, type StatusTon } from "../../zajednicko/status-oznaka";
import { nazivStranice } from "../zajednicko";

const t = menuLokalSr.kartice;

const STANJA: Record<QrStanje, { ton: StatusTon; ikonica: LucideIcon; tekst: string }> = {
  aktivna: { ton: "uspeh", ikonica: CircleCheck, tekst: t.stanje.aktivna },
  iskljucena: { ton: "neutralno", ikonica: PowerOff, tekst: t.stanje.iskljucena },
  "drugo-odrediste": { ton: "info", ikonica: ExternalLink, tekst: t.stanje.drugoOdrediste },
};

export function StanjeKartice({ stanje }: { stanje: QrStanje }) {
  const opis = STANJA[stanje];
  return (
    <StatusOznaka ton={opis.ton} ikonica={opis.ikonica}>
      {opis.tekst}
    </StatusOznaka>
  );
}

/**
 * "Meni · Sto 12" / "Ulaz u meni · bez mesta": what a scan opens. The default
 * page is "Meni" (as the guest knows it); no page is the menu's entry; no
 * position is "bez mesta". null when the card opens nothing (off, or elsewhere).
 */
export function odredisteDelovi(dijagnoza: QrDijagnoza): string | null {
  if (!dijagnoza.otvara) return null;
  const { stranica, pozicija } = dijagnoza.otvara;
  return [stranica ? nazivStranice(stranica) : t.otvara.ulaz, pozicija ? pozicija.label : t.otvara.bezMesta].join(
    t.otvara.razdelnik,
  );
}

/** "Otvara: Meni · Sto 12". */
export function odredisteTekst(dijagnoza: QrDijagnoza): string | null {
  const delovi = odredisteDelovi(dijagnoza);
  return delovi === null ? null : fmt(t.otvara.prefiks, { odrediste: delovi });
}

const DATUM = new Intl.DateTimeFormat("sr-Latn-RS", { timeZone: "Europe/Belgrade", day: "numeric", month: "numeric" });
const VREME = new Intl.DateTimeFormat("sr-Latn-RS", {
  timeZone: "Europe/Belgrade",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "17. 10. u 18:20", in the venue's time (Europe/Belgrade). */
export function vremeSkena(trenutak: number): string {
  return fmt(t.sken.kadaFormat, { datum: DATUM.format(trenutak), vreme: VREME.format(trenutak) });
}

/** The line about scanning: the last scan, or that there was none. */
export function skenTekst(kartica: LokalKartica, dijagnoza: QrDijagnoza): string {
  if (dijagnoza.nikadSkenirana || kartica.lastScanAt === null) return t.sken.nikad;
  return fmt(t.sken.poslednji, { kada: vremeSkena(kartica.lastScanAt) });
}

const PROBLEMI: Record<QrProblem, string> = {
  "veza-iskljucena": t.problemi.vezaIskljucena,
  "stranica-nedostupna": t.problemi.stranicaNedostupna,
  "pozicija-nedostupna": t.problemi.pozicijaNedostupna,
};

/** What is wrong with a card, one warning line each (icon + text). Nothing when all is well. */
export function ProblemiKartice({ problemi }: { problemi: readonly QrProblem[] }) {
  if (problemi.length === 0) return null;
  return (
    <ul data-problemi="" className="grid gap-1.5">
      {problemi.map((problem) => (
        <li
          key={problem}
          className="flex items-start gap-2 rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm leading-snug text-[var(--mp-tekst)] [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]"
        >
          <TriangleAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-upozorenje)]" />
          <span className="min-w-0">
            <span className="sr-only">{t.problemi.oznaka} </span>
            {PROBLEMI[problem]}
          </span>
        </li>
      ))}
    </ul>
  );
}
