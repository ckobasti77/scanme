// ScanMe Menu V1 (K30) — the small pieces every analytics block uses. The
// rule of the section: every number on the screen is a `Broj` whose
// `aria-describedby` points to the sentence that says what is counted (from
// docs/menu/ANALITIKA-DEFINICIJE.md through lib/i18n/sr/menu-analitika.ts), and
// that sentence is in the markup — visible next to the headline numbers, one
// click away ("Šta se broji") next to tables. The render test walks every
// `data-broj` and checks its explanation.

import { ArrowDownRight, ArrowUpRight, Equal, Info } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { menuStudioPosebnoSr } from "@/lib/i18n/sr/menu-studio-posebno";
import { formatBroj, formatProcenat, type NaziviRaspodele, type Promena } from "@/lib/menu/analitika/prikaz";
import { cn } from "@/lib/utils";

const t = menuAnalitikaSr;

/** The id of the explanation of one number (`kljuc` is stable per block). */
export const objasnjenjeId = (kljuc: string) => `an-obj-${kljuc}`;

/** A number of the screen, tied to its explanation. `procenat` shows "12,5%". */
export function Broj({
  kljuc,
  vrednost,
  objasnjenje,
  procenat = false,
  className,
}: {
  kljuc: string;
  vrednost: number;
  /** The id of the element that explains it (`objasnjenjeId(...)`). */
  objasnjenje: string;
  procenat?: boolean;
  className?: string;
}) {
  return (
    <data
      value={vrednost}
      data-broj={kljuc}
      aria-describedby={objasnjenje}
      className={cn("tabular-nums", className)}
    >
      {procenat ? formatProcenat(vrednost) : formatBroj(vrednost)}
    </data>
  );
}

/** A dictionary sentence with one number in it: the `{n}` of `sablon` becomes `children`. */
export function TekstSaBrojem({
  sablon,
  parametri = {},
  children,
}: {
  sablon: string;
  parametri?: Record<string, string | number>;
  children: ReactNode;
}) {
  return <SablonTekst sablon={fmt(sablon, parametri)} delovi={{ n: children }} />;
}

/** A dictionary sentence whose `{kljuc}` placeholders become nodes (several numbers in one sentence). */
export function SablonTekst({ sablon, delovi }: { sablon: string; delovi: Record<string, ReactNode> }) {
  const komadi = sablon.split(/\{(\w+)\}/);
  return (
    <>
      {komadi.map((komad, i) =>
        i % 2 === 0 ? (
          <Fragment key={i}>{komad}</Fragment>
        ) : (
          <Fragment key={i}>{Object.prototype.hasOwnProperty.call(delovi, komad) ? delovi[komad] : `{${komad}}`}</Fragment>
        ),
      )}
    </>
  );
}

/** A visible explanation sentence (`id` = `objasnjenjeId(kljuc)`). */
export function Objasnjenje({ kljuc, children, className }: { kljuc: string; children: ReactNode; className?: string }) {
  return (
    <p id={objasnjenjeId(kljuc)} data-objasnjenje={kljuc} className={cn("text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]", className)}>
      {children}
    </p>
  );
}

/** "Šta se broji": the explanations of a table or a group of numbers, one click away. */
export function StaSeBroji({
  stavke,
  className,
}: {
  stavke: readonly { kljuc: string; tekst: ReactNode }[];
  className?: string;
}) {
  return (
    <details className={cn("group rounded-[var(--mp-radius-unutra)] text-sm", className)}>
      <summary className="inline-flex min-h-[var(--mp-meta)] cursor-pointer list-none items-center gap-2 rounded-[var(--mp-radius-dugme)] font-semibold text-[var(--mp-tekst)] [&::-webkit-details-marker]:hidden">
        <Info aria-hidden="true" strokeWidth={1.75} className="size-4 text-[var(--mp-tekst-sporedni)]" />
        <span className="underline decoration-[var(--mp-ivica-kontrole)] underline-offset-4 group-open:no-underline">{t.staSeBroji}</span>
      </summary>
      <ul className="mt-1 grid gap-2 pb-1">
        {stavke.map((stavka) => (
          <li key={stavka.kljuc}>
            <Objasnjenje kljuc={stavka.kljuc}>{stavka.tekst}</Objasnjenje>
          </li>
        ))}
      </ul>
    </details>
  );
}

const SMER_IKONICA = { vise: ArrowUpRight, manje: ArrowDownRight, isto: Equal } as const;

/**
 * The comparison with the previous period (Premium) in words, in neutral ink:
 * more is not always better (cancellations), so no good/bad colour.
 */
export function PromenaRed({
  kljuc,
  promena,
  dana,
  objasnjenje,
  predmet,
}: {
  kljuc: string;
  promena: Promena;
  dana: number;
  objasnjenje: string;
  /** "Poslati zahtevi:" before the sentence when the block shows several numbers. */
  predmet?: string;
}) {
  const Ikonica = SMER_IKONICA[promena.smer];
  const sablon = t.poredjenje[promena.smer];
  return (
    <p data-promena={promena.smer} className="flex items-start gap-1.5 text-sm leading-snug text-[var(--mp-tekst)]">
      <Ikonica aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-tekst-sporedni)]" />
      <span>
        {predmet ? <span className="font-semibold">{predmet} </span> : null}
        {promena.smer === "isto" ? (
          fmt(sablon, { dana })
        ) : (
          <TekstSaBrojem sablon={sablon} parametri={{ dana }}>
            <Broj kljuc={`${kljuc}-razlika`} vrednost={promena.razlika} objasnjenje={objasnjenje} />
          </TekstSaBrojem>
        )}
        {promena.procenat !== null ? (
          <>
            {" ("}
            {promena.smer === "manje" ? "−" : "+"}
            <Broj kljuc={`${kljuc}-promena`} vrednost={promena.procenat} objasnjenje={objasnjenje} procenat />
            {")"}
          </>
        ) : null}
      </span>
    </p>
  );
}

/** What the breakdowns and the CSV call the values (lib/menu/analitika/prikaz.ts `nazivVrednosti`). */
export const NAZIVI_RASPODELE: NaziviRaspodele = {
  ostalo: t.raspodela.ostalo,
  uklonjeno: t.raspodela.uklonjeno,
  bezNaziva: t.raspodela.bezNaziva,
  sat: t.raspodela.sat,
  uredjaji: t.raspodela.uredjaji,
  kanali: t.raspodela.kanali,
  ko: t.raspodela.ko,
  vrsteZahteva: t.zahtevi.vrste,
  jezici: menuStudioPosebnoSr.prevodi.jezici,
};

/** A one-series bar fill: the dark ScanMe green in the light theme, the ScanMe green in the dark one (≥ 3:1 on the card). */
export const STUB_BOJA = "bg-[var(--mp-akcent-tekst)]";
