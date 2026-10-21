// ScanMe Menu V1 (K27) — Pažnja, the first block of Početna (master §13.2; plan
// docs/meni/planovi/K24.md §4.2): the yes/no answer to "does anything need my
// attention?". Either the calm sentence "Sve je u redu." or a count and one line
// per thing, each with an icon AND words (never colour alone): danger for what
// hurts guests right now (late requests and reservations, nobody on shift),
// warning for the rest. Lines about the floor come first and have no link of
// their own: one button right under them leads to Operativa (and one to the
// waiter panel when nobody is on shift); the other lines follow.
// Presentational: Početna passes the summary computed by lib/menu/home-summary.ts.

import {
  Activity,
  BedDouble,
  CalendarClock,
  CalendarX,
  CircleCheck,
  ConciergeBell,
  Hourglass,
  MailWarning,
  PencilLine,
  UserX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { HomeSummary, PaznjaStavka, PaznjaVrsta } from "@/lib/menu/home-summary";
import { roleCan, type MenuActor } from "@/lib/menu/permissions";
import { kadaTekst } from "@/lib/menu/studio/kada";
import { cn } from "@/lib/utils";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import type { PocetnaHrefs } from "./pocetna";

const t = menuPanelSr.pocetna.paznja;

type Ton = "opasnost" | "upozorenje";

const STAVKA: Readonly<Record<PaznjaVrsta, { ikonica: LucideIcon; ton: Ton }>> = {
  "zahtevi-kasne": { ikonica: Hourglass, ton: "opasnost" },
  "bez-osoblja": { ikonica: UserX, ton: "opasnost" },
  "rezervacije-kasne": { ikonica: CalendarX, ton: "opasnost" },
  "rezervacije-cekaju": { ikonica: CalendarClock, ton: "upozorenje" },
  posta: { ikonica: MailWarning, ton: "upozorenje" },
  "room-service": { ikonica: BedDouble, ton: "upozorenje" },
  neobjavljeno: { ikonica: PencilLine, ton: "upozorenje" },
};

const TON_KLASE: Readonly<Record<Ton, string>> = {
  opasnost: "bg-[var(--mp-opasnost-meko)] text-[var(--mp-opasnost)]",
  upozorenje: "bg-[var(--mp-upozorenje-meko)] text-[var(--mp-upozorenje)]",
};

/** The lines about the floor: they are answered in Operativa. */
const OPERATIVNE: readonly PaznjaVrsta[] = ["zahtevi-kasne", "bez-osoblja", "rezervacije-kasne", "rezervacije-cekaju"];

function tekstStavke(stavka: PaznjaStavka, nowMs: number): string {
  switch (stavka.vrsta) {
    case "zahtevi-kasne":
      return fmt(t.zahteviKasne[srPluralCategory(stavka.broj)], { n: stavka.broj, prag: stavka.pragMin });
    case "bez-osoblja":
      return t.bezOsoblja;
    case "rezervacije-kasne":
      return fmt(t.rezervacijeKasne[srPluralCategory(stavka.broj)], { n: stavka.broj });
    case "rezervacije-cekaju":
      return fmt(t.rezervacijeCekaju[srPluralCategory(stavka.broj)], { n: stavka.broj });
    case "posta":
      return t.posta;
    case "room-service":
      return fmt(t.roomService[srPluralCategory(stavka.broj)], { n: stavka.broj });
    case "neobjavljeno":
      return fmt(t.neobjavljeno, { kada: kadaTekst(stavka.od, nowMs, menuStudioSr.zaglavlje) });
  }
}

/** The one small link of a line that is not about the floor; null for the floor lines. */
function radnjaStavke(stavka: PaznjaStavka, actor: MenuActor, hrefs: PocetnaHrefs): { tekst: string; href: string } | null {
  switch (stavka.vrsta) {
    case "posta":
      return roleCan(actor, "settings.edit") ? { tekst: t.radnje.podesavanja, href: hrefs.podesavanja } : null;
    case "room-service":
      return roleCan(actor, "menu.read") ? { tekst: t.radnje.editor, href: hrefs.editor } : null;
    // "neobjavljeno" has no link of its own: the Meni block next to it shows the seam and `Otvori Editor`.
    default:
      return null;
  }
}

function Mirno({ urednik }: { urednik: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--mp-uspeh-meko)] text-[var(--mp-uspeh)]"
      >
        <CircleCheck strokeWidth={2} className="size-6" />
      </span>
      <div className="grid min-w-0 gap-1">
        <p className="text-lg font-semibold leading-snug text-[var(--mp-tekst)]">{t.mirno}</p>
        <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">
          {urednik ? t.mirnoUrednik : t.mirnoOpis}
        </p>
      </div>
    </div>
  );
}

function StavkaRed({
  stavka,
  nowMs,
  radnja,
}: {
  stavka: PaznjaStavka;
  nowMs: number;
  radnja: { tekst: string; href: string } | null;
}) {
  const { ikonica: Ikonica, ton } = STAVKA[stavka.vrsta];
  const tekstId = `pocetna-paznja-${stavka.vrsta}`;
  return (
    <li data-paznja-stavka={stavka.vrsta} data-ton={ton} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span aria-hidden="true" className={cn("grid size-9 shrink-0 place-items-center rounded-full", TON_KLASE[ton])}>
        <Ikonica strokeWidth={2} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <p
          id={tekstId}
          className="min-w-0 flex-1 basis-56 py-1.5 text-[0.9375rem] font-medium leading-snug tabular-nums text-[var(--mp-tekst)]"
        >
          {tekstStavke(stavka, nowMs)}
        </p>
        {radnja ? (
          <Dugme asChild vrsta="sekundarno" velicina="kompaktna">
            <Link href={radnja.href} aria-describedby={tekstId}>
              {radnja.tekst}
            </Link>
          </Dugme>
        ) : null}
      </div>
    </li>
  );
}

export function Paznja({
  summary,
  actor,
  nowMs,
  hrefs,
  className,
}: {
  summary: HomeSummary;
  actor: MenuActor;
  nowMs: number;
  hrefs: PocetnaHrefs;
  className?: string;
}) {
  const vidiOperativu = roleCan(actor, "operations.read");
  const imaOperativne = vidiOperativu && summary.paznja.some((stavka) => OPERATIVNE.includes(stavka.vrsta));
  const bezOsoblja = summary.paznja.some((stavka) => stavka.vrsta === "bez-osoblja") && roleCan(actor, "waiter.work");
  const n = summary.paznja.length;
  const operativne = summary.paznja.filter((stavka) => OPERATIVNE.includes(stavka.vrsta));
  const ostale = summary.paznja.filter((stavka) => !OPERATIVNE.includes(stavka.vrsta));

  return (
    <Kartica data-blok="paznja" data-paznja={summary.stanje} className={className}>
      <OkvirSekcije id="pocetna-paznja" naslov={t.naslov}>
        {summary.stanje === "mirno" ? (
          <Mirno urednik={!vidiOperativu} />
        ) : (
          <div className="grid gap-4">
            <p className="text-[0.9375rem] font-semibold leading-snug tabular-nums text-[var(--mp-tekst)]">
              {fmt(t.ima[srPluralCategory(n)], { n })}
            </p>
            {operativne.length > 0 ? (
              <ul className="grid divide-y [--border:var(--mp-ivica)]">
                {operativne.map((stavka) => (
                  <StavkaRed key={stavka.vrsta} stavka={stavka} nowMs={nowMs} radnja={radnjaStavke(stavka, actor, hrefs)} />
                ))}
              </ul>
            ) : null}
            {imaOperativne ? (
              <div className="flex flex-wrap items-center gap-2">
                <Dugme asChild vrsta="primarno">
                  <Link href={hrefs.operativa}>
                    <Activity aria-hidden="true" strokeWidth={1.75} />
                    {t.radnje.operativa}
                  </Link>
                </Dugme>
                {bezOsoblja ? (
                  <Dugme asChild vrsta="sekundarno">
                    <Link href={hrefs.konobar}>
                      <ConciergeBell aria-hidden="true" strokeWidth={1.75} />
                      {t.radnje.konobar}
                    </Link>
                  </Dugme>
                ) : null}
              </div>
            ) : null}
            {ostale.length > 0 ? (
              <ul
                className={cn(
                  "grid divide-y [--border:var(--mp-ivica)]",
                  operativne.length > 0 && "border-t pt-3",
                )}
              >
                {ostale.map((stavka) => (
                  <StavkaRed key={stavka.vrsta} stavka={stavka} nowMs={nowMs} radnja={radnjaStavke(stavka, actor, hrefs)} />
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </OkvirSekcije>
    </Kartica>
  );
}
