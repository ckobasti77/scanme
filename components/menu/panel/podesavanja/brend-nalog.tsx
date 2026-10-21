// ScanMe Menu V1 (K28) — Podešavanja > Brend i nalog (master §13.9; plan
// docs/meni/planovi/K24.md §4.7): the venue name, the account's plan and what
// Premium unlocks, the service mode and the way to the menu's look. Nothing here
// changes anything: the venue name is kept on the ScanMe account, the mode is
// changed only by ScanMe on request (a prepared e-mail, a plain link) and colours
// and fonts are edited in the Editor (a link). So there is no button, select or
// switch in this block. Presentational and Server-renderable.

import { Check, Mail, Palette } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuMode } from "@/lib/menu/modes";
import { cn } from "@/lib/utils";
import { dugmeKlase } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { StatusOznaka } from "../../zajednicko/status-oznaka";

const t = menuPanelSr.podesavanja.brend;

/** Where a request to change the mode goes. */
export const ADRESA_ZA_PROMENU_REZIMA = "office@scanme.rs";

/** The prepared e-mail asking ScanMe to change the mode of `lokal`. */
export function zatraziPromenuHref(lokal: string): string {
  const predmet = encodeURIComponent(fmt(t.zatraziPredmet, { lokal }));
  const telo = encodeURIComponent(fmt(t.zatraziTelo, { lokal }));
  return `mailto:${ADRESA_ZA_PROMENU_REZIMA}?subject=${predmet}&body=${telo}`;
}

export type BrendNalogProps = {
  naziv: string;
  plan: "standard" | "premium";
  rezim: MenuMode;
  /** The Editor's look page; null = the role has no way there and the row has no link. */
  izgledHref: string | null;
  /** A mailto: link, see `zatraziPromenuHref`. */
  zatraziHref: string;
  nivo?: 2 | 3;
};

const LINK_KLASA = cn(dugmeKlase({ vrsta: "sekundarno", velicina: "kompaktna" }), "no-underline");

function Red({ naslov, children }: { naslov: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t py-4 first:border-t-0 first:pt-0 last:pb-0 [--border:var(--mp-ivica)] sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-x-6">
      <dt className="text-sm font-semibold text-[var(--mp-tekst)]">{naslov}</dt>
      <dd className="m-0 grid min-w-0 content-start justify-items-start gap-2">{children}</dd>
    </div>
  );
}

export function BrendNalog({ naziv, plan, rezim, izgledHref, zatraziHref, nivo = 2 }: BrendNalogProps) {
  const premium = plan === "premium";
  return (
    <Kartica data-brend-nalog="">
      <OkvirSekcije naslov={t.naslov} opis={t.opis} nivo={nivo}>
        <dl className="m-0 grid">
          <Red naslov={t.naziv}>
            <p className="break-words text-[0.9375rem] font-medium text-[var(--mp-tekst)]">{naziv}</p>
            <p className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{t.nazivPomoc}</p>
          </Red>

          <Red naslov={t.plan}>
            <StatusOznaka ton={premium ? "uspeh" : "neutralno"}>
              {premium ? t.planPremium : t.planStandard}
            </StatusOznaka>
            {premium ? (
              <p className="text-sm leading-relaxed text-[var(--mp-tekst)]">{t.premiumUkljucen}</p>
            ) : (
              <div className="grid gap-1.5">
                <p className="text-sm font-medium text-[var(--mp-tekst)]">{t.premiumOtkljucava}</p>
                <ul className="m-0 grid list-none gap-1.5 p-0">
                  {t.premiumStavke.map((stavka) => (
                    <li key={stavka} className="flex items-start gap-2 text-sm leading-snug text-[var(--mp-tekst)]">
                      <Check aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-uspeh)]" />
                      <span className="min-w-0">{stavka}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Red>

          <Red naslov={t.rezim}>
            <p className="text-[0.9375rem] font-medium text-[var(--mp-tekst)]">
              {fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes[rezim] })}
            </p>
            <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.rezimPomoc}</p>
            <a href={zatraziHref} className={LINK_KLASA}>
              <Mail aria-hidden="true" strokeWidth={1.75} />
              {t.zatraziPromenu}
            </a>
          </Red>

          <Red naslov={t.izgled}>
            <p className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.izgledPomoc}</p>
            {izgledHref !== null ? (
              <Link href={izgledHref} className={LINK_KLASA}>
                <Palette aria-hidden="true" strokeWidth={1.75} />
                {t.otvoriIzgled}
              </Link>
            ) : null}
          </Red>
        </dl>
      </OkvirSekcije>
    </Kartica>
  );
}
