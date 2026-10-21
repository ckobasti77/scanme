// ScanMe Menu V1 (K28) — the layout of the client-panel section Podešavanja (master
// §13.9; plan docs/meni/planovi/K24.md §4.7): what applies to the whole venue,
// in seven blocks that each save on their own. From 1280 px a sticky anchor index
// stands on the left and the blocks follow one under another on the right; below
// it the blocks are an accordion of native <details> (the first one open), so the
// section needs no JavaScript and is a Server Component. The blocks are passed in
// ready (the route wires their data), so this file knows only their order.
//
// One markup for both layouts: from 1280 px the summary bars are hidden and the
// closed blocks are shown anyway (details::details-content), so nothing is
// rendered twice and the blocks keep one state. Browsers without
// ::details-content get every block opened by OtvoriNaSirokom (a few lines of
// JS). The summary is a plain label, not a heading: each block brings its own
// h2, which is the only heading on desktop.

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { ZaglavljeSaStatusom } from "../../zajednicko/zaglavlje-sa-statusom";
import { OtvoriNaSirokom } from "./otvori-na-sirokom";

const t = menuPanelSr.podesavanja;

export type PodesavanjaKljuc = "radnoVreme" | "jezici" | "konobar" | "zadrzavanje" | "posta" | "sabloni" | "brend";

/** The order of the blocks on the screen. */
export const PODESAVANJA_REDOSLED: readonly PodesavanjaKljuc[] = [
  "radnoVreme",
  "jezici",
  "konobar",
  "zadrzavanje",
  "posta",
  "sabloni",
  "brend",
];

const sidroId = (kljuc: PodesavanjaKljuc) => `podesavanja-${kljuc}`;

// The index has no scroll tracking (it stays a plain anchor list): the block last chosen in it (the
// :target of the address) is marked, and before any choice the first one.
const AKTIVNA_STAVKA = "border-color:var(--mp-mastilo);background:var(--mp-povrsina-utisana);color:var(--mp-tekst)";
const AKTIVNA_CSS =
  PODESAVANJA_REDOSLED.map(
    (kljuc) => `[data-podesavanja]:has(#${sidroId(kljuc)}:target) a[href="#${sidroId(kljuc)}"]`,
  ).join(",") +
  `,[data-podesavanja]:not(:has(:target)) li:first-child a{${AKTIVNA_STAVKA}}`;

const FOKUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)]";

export function Podesavanja({ blokovi }: { blokovi: Record<PodesavanjaKljuc, ReactNode> }) {
  return (
    <div
      data-podesavanja=""
      className="grid min-w-0 gap-5 xl:grid-cols-[12rem_minmax(0,1fr)] xl:items-start xl:gap-x-10"
    >
      <ZaglavljeSaStatusom className="xl:col-span-2" naslov={menuPanelSr.sekcije.podesavanja} opis={t.opis} />

      <style>{AKTIVNA_CSS}</style>
      <nav aria-label={t.sidro} className="hidden xl:sticky xl:top-6 xl:block">
        <ul className="m-0 grid list-none gap-0.5 border-l p-0 [--border:var(--mp-ivica)]">
          {PODESAVANJA_REDOSLED.map((kljuc) => (
            <li key={kljuc}>
              <a
                href={`#${sidroId(kljuc)}`}
                className={`-ml-px flex min-h-11 items-center border-l-2 border-transparent px-3 py-1.5 text-sm font-medium leading-snug text-[var(--mp-tekst-sporedni)] no-underline hover:border-[var(--mp-mastilo)] hover:text-[var(--mp-tekst)] ${FOKUS}`}
              >
                {t.blokovi[kljuc]}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid min-w-0 gap-3 xl:gap-8">
        {PODESAVANJA_REDOSLED.map((kljuc, indeks) => (
          <section
            key={kljuc}
            id={sidroId(kljuc)}
            aria-labelledby={`${sidroId(kljuc)}-naslov`}
            data-podesavanja-blok={kljuc}
            className="min-w-0 scroll-mt-6"
          >
            <details
              open={indeks === 0}
              className="group min-w-0 xl:[&::details-content]:[content-visibility:visible]"
            >
              <summary
                className={`flex min-h-[var(--mp-meta)] cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--mp-radius-kontrola)] border px-4 py-2 [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] [&::-webkit-details-marker]:hidden xl:hidden ${FOKUS}`}
              >
                <span id={`${sidroId(kljuc)}-naslov`} className="min-w-0 text-base font-semibold leading-snug text-[var(--mp-tekst)]">
                  {t.blokovi[kljuc]}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)] transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <div className="min-w-0 pt-3 xl:pt-0">{blokovi[kljuc]}</div>
            </details>
          </section>
        ))}
      </div>
      <OtvoriNaSirokom />
    </div>
  );
}
