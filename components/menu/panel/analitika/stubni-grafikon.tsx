// ScanMe Menu V1 (K30) — a one-series column chart of a metric by day (the
// `dataviz` mark specs: columns at most 24 px wide with a 4 px rounded top and a
// square base, a 2 px surface gap between neighbours (1 px past 31 days), one
// hairline baseline and one hairline grid line at half, no legend because the
// title names the series, the largest day labelled once). No colour carries
// meaning on its own: today's column (a day still running) is lighter AND said
// in words. Hover shows "15. okt: 120" (the whole day slot is the target); the
// text equivalent is the table "Brojke po danima" under the chart, which also
// serves keyboard and screen-reader users. Server-renderable, no client JS.

import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { danKratko, formatBroj, indeksNajveceg, lepaSkala, opsegTekst } from "@/lib/menu/analitika/prikaz";
import { cn } from "@/lib/utils";
import { Broj, TekstSaBrojem } from "./zajednicko";

const t = menuAnalitikaSr;

export function StubniGrafikon({
  kljuc,
  naziv,
  dani,
  vrednosti,
  objasnjenje,
  danasJePoslednji = false,
  boja = "bg-[var(--mp-akcent-tekst)]",
  visina = "h-44 sm:h-52",
  saTabelom = true,
  className,
}: {
  /** Stable key of the chart (ids, `data-broj` keys). */
  kljuc: string;
  /** What is counted ("Otvaranja menija"): the title of the series. */
  naziv: string;
  dani: readonly string[];
  vrednosti: readonly number[];
  /** The id of the explanation of this metric. */
  objasnjenje: string;
  /** The last day is today (still running): its column is lighter and the note says so. */
  danasJePoslednji?: boolean;
  boja?: string;
  visina?: string;
  saTabelom?: boolean;
  className?: string;
}) {
  const max = Math.max(0, ...vrednosti);
  const skala = lepaSkala(max);
  const najveci = indeksNajveceg(vrednosti);
  const ukupno = vrednosti.reduce((a, b) => a + b, 0);
  const opseg = dani.length > 0 ? opsegTekst({ od: dani[0], do: dani[dani.length - 1] }, t.meseci) : "";
  const gusto = dani.length > 31;
  const sredina = Math.floor((dani.length - 1) / 2);
  const oznakeX = dani.length > 2 ? [0, sredina, dani.length - 1] : dani.map((_, i) => i);

  return (
    <figure data-grafikon={kljuc} className={cn("grid gap-3", className)}>
      <div
        role="img"
        aria-label={fmt(t.trend.grafikon, { metrika: naziv, opseg, max: formatBroj(max), ukupno: formatBroj(ukupno) })}
        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2"
      >
        {/* Value axis: clean ticks, recessive. */}
        <div aria-hidden="true" className={cn("relative w-[3ch] text-right text-xs tabular-nums text-[var(--mp-tekst-sporedni)]", visina)}>
          <span className="absolute right-0 top-0 -translate-y-1/2">{formatBroj(skala)}</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">{formatBroj(skala / 2)}</span>
          <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
        </div>
        <div className={cn("relative", visina)}>
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-[var(--mp-ivica)]" />
          <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-[var(--mp-ivica)]" />
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-[var(--mp-ivica-kontrole)]" />
          <div className={cn("absolute inset-0 flex items-end", gusto ? "gap-px" : "gap-0.5")}>
            {dani.map((dan, i) => {
              const vrednost = vrednosti[i] ?? 0;
              const visinaStuba = vrednost > 0 ? `max(2px, ${(vrednost / skala) * 100}%)` : "0";
              const danas = danasJePoslednji && i === dani.length - 1;
              return (
                <div
                  key={dan}
                  title={`${danKratko(dan, t.meseci)}: ${formatBroj(vrednost)}`}
                  data-dan={dan}
                  className="flex h-full min-w-0 flex-1 items-end justify-center"
                >
                  <div
                    className={cn("w-full max-w-6 rounded-t-[4px]", boja, danas && "opacity-50")}
                    style={{ height: visinaStuba }}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <div />
        <div aria-hidden="true" className="relative mt-1.5 h-4 text-xs text-[var(--mp-tekst-sporedni)]">
          {oznakeX.map((i) => (
            <span
              key={dani[i]}
              className={cn(
                "absolute top-0 whitespace-nowrap",
                i === 0 ? "left-0" : i === dani.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
              )}
            >
              {danKratko(dani[i], t.meseci)}
            </span>
          ))}
        </div>
      </div>
      <figcaption className="grid gap-1 text-sm text-[var(--mp-tekst-sporedni)]">
        {najveci >= 0 ? (
          <span>
            <TekstSaBrojem sablon={t.trend.najvise} parametri={{ dan: danKratko(dani[najveci], t.meseci) }}>
              <Broj kljuc={`${kljuc}-najvise`} vrednost={vrednosti[najveci]} objasnjenje={objasnjenje} className="font-semibold text-[var(--mp-tekst)]" />
            </TekstSaBrojem>
          </span>
        ) : null}
        {danasJePoslednji ? <span>{t.trend.danas}</span> : null}
      </figcaption>
      {saTabelom ? (
        <details className="group text-sm">
          <summary className="inline-flex min-h-[var(--mp-meta)] cursor-pointer list-none items-center rounded-[var(--mp-radius-dugme)] font-semibold text-[var(--mp-tekst)] underline decoration-[var(--mp-ivica-kontrole)] underline-offset-4 group-open:no-underline [&::-webkit-details-marker]:hidden">
            {t.trend.tabela}
          </summary>
          <div className="mt-2 max-h-80 overflow-y-auto rounded-[var(--mp-radius-unutra)] border [--border:var(--mp-ivica)]">
            <table className="w-full text-sm">
              <caption className="sr-only">{fmt(t.trend.grafikon, { metrika: naziv, opseg, max: formatBroj(max), ukupno: formatBroj(ukupno) })}</caption>
              <thead className="sticky top-0 bg-[var(--mp-povrsina-utisana)]">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-semibold">{t.trend.kolonaDan}</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">{naziv}</th>
                </tr>
              </thead>
              <tbody>
                {dani.map((dan, i) => (
                  <tr key={dan} className="border-t [--border:var(--mp-ivica)]">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      <time dateTime={dan}>{danKratko(dan, t.meseci)}</time>
                    </th>
                    <td className="px-3 py-1.5 text-right">
                      <Broj kljuc={`${kljuc}-dan-${dan}`} vrednost={vrednosti[i] ?? 0} objasnjenje={objasnjenje} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
