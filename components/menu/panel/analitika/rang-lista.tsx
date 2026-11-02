// ScanMe Menu V1 (K30) — a ranked list with a bar per row (the most opened
// articles, scans per QR card, a Premium breakdown). The name and the number
// are text (the list itself is the text equivalent); the bar under them is
// decoration scaled to the largest row, one hue, a 4 px rounded end. A row may
// carry a share ("31% od ukupno") — only when the caller's rule of 20 allows.

import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { cn } from "@/lib/utils";
import { Broj, STUB_BOJA, TekstSaBrojem } from "./zajednicko";

type Mnozina = { one: string; few: string; many: string };

export type RangStavka = {
  kljuc: string;
  naziv: string;
  broj: number;
  /** Share of the whole in percent, or null (rule of 20 / too little data). */
  udeo?: number | null;
  /** The "Ostalo" row: muted, never ranked. */
  ostalo?: boolean;
  /** This row has its own explanation (the steps of the guest flow). */
  objasnjenje?: string;
};

export function RangLista({
  kljuc,
  stavke,
  jedinica,
  objasnjenje,
  numerisano = true,
  udeoSablon = menuAnalitikaSr.raspodela.udeo,
}: {
  kljuc: string;
  stavke: readonly RangStavka[];
  /** "{n} otvaranja" with Serbian plurals. */
  jedinica: Mnozina;
  /** The id of the explanation of the counted metric. */
  objasnjenje: string;
  numerisano?: boolean;
  /** How a share is said ("{p} od ukupno"). */
  udeoSablon?: string;
}) {
  // The scale is the largest ranked row; "Ostalo" never rescales the others (its bar stops at full width).
  const max = Math.max(1, ...stavke.filter((stavka) => !stavka.ostalo).map((stavka) => stavka.broj));
  const Lista = numerisano ? "ol" : "ul";
  return (
    <Lista data-rang={kljuc} className="grid gap-3">
      {stavke.map((stavka, indeks) => (
        <li key={stavka.kljuc} data-stavka={stavka.kljuc} className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={cn("min-w-0 break-words", stavka.ostalo ? "text-[var(--mp-tekst-sporedni)]" : "font-medium text-[var(--mp-tekst)]")}>
              {numerisano && !stavka.ostalo ? (
                <span aria-hidden="true" className="mr-2 inline-block w-[2ch] text-right tabular-nums text-[var(--mp-tekst-sporedni)]">
                  {indeks + 1}.
                </span>
              ) : null}
              {stavka.naziv}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[var(--mp-tekst)]">
              <TekstSaBrojem sablon={jedinica[srPluralCategory(stavka.broj)]}>
                <Broj kljuc={`${kljuc}-${stavka.kljuc}`} vrednost={stavka.broj} objasnjenje={stavka.objasnjenje ?? objasnjenje} className="font-semibold" />
              </TekstSaBrojem>
              {stavka.udeo !== undefined && stavka.udeo !== null ? (
                <span className="ml-2 text-[var(--mp-tekst-sporedni)]">
                  <TekstSaBrojem sablon={fmt(udeoSablon, { p: "{n}" })}>
                    <Broj kljuc={`${kljuc}-${stavka.kljuc}-udeo`} vrednost={stavka.udeo} objasnjenje={stavka.objasnjenje ?? objasnjenje} procenat />
                  </TekstSaBrojem>
                </span>
              ) : null}
            </span>
          </div>
          <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[var(--mp-povrsina-utisana)]">
            <div
              className={cn("h-full rounded-r-[4px]", stavka.ostalo ? "bg-[var(--mp-ivica-kontrole)]" : STUB_BOJA)}
              style={{ width: stavka.broj > 0 ? `max(4px, ${Math.min(100, (stavka.broj / max) * 100)}%)` : "0" }}
            />
          </div>
        </li>
      ))}
    </Lista>
  );
}
