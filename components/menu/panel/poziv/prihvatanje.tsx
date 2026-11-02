// ScanMe Menu V1 (K28) — the page where an invited person accepts the invitation
// into the Menu team (master §10.6). One calm card, one job per state: accept,
// sign in first, use the other account, or learn that the link is no good. The
// screen is presentational; prihvatanje-ruta.tsx connects it to the backend.
//
// The invalid and expired states never carry the venue name or any address: a
// link that does not work must not tell a stranger anything. No state shows an
// e-mail address at all.

import { CircleCheck, Clock, LinkIcon, LoaderCircle, LogIn, MailCheck, OctagonAlert, UserX, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { belgradeParts } from "@/lib/belgrade-time";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { PanelPoruka } from "../stanja-panela";

const t = menuPanelSr.poziv;

export type PozivStanje = "ucitava" | "vazeca" | "istekla" | "nevazeca" | "prijava" | "drugi-nalog" | "prihvaceno";
export type PozivUloga = "owner" | "manager" | "editor";

export type PrihvatanjeProps = {
  stanje: PozivStanje;
  /** Venue name; shown only while the invitation is valid. */
  lokal?: string;
  uloga?: PozivUloga;
  /** Expiry of the invitation, epoch ms. */
  istice?: number;
  /** The existing client-panel sign-in. */
  prijavaHref: string;
  /** The Menu panel of the venue, after acceptance. */
  panelHref: string;
  /** The acceptance is running. */
  radi?: boolean;
  /** An already translated message about the last failed attempt. */
  greska?: string | null;
  onPrihvati?: () => void;
};

/** dd. mm. yyyy. in Belgrade time. */
function datumBeograd(ms: number): string {
  const { day, month, year } = belgradeParts(ms);
  return `${String(day).padStart(2, "0")}. ${String(month).padStart(2, "0")}. ${year}.`;
}

function Okvir({
  ikonica: Ikonica,
  naslov,
  children,
  okretanje,
}: {
  ikonica: LucideIcon;
  naslov: string;
  children?: ReactNode;
  /** The icon spins (loading). */
  okretanje?: boolean;
}) {
  return (
    <PanelPoruka>
      <Kartica className="grid justify-items-center gap-3 px-5 py-8 text-center sm:px-8">
        <span className="grid size-14 place-items-center rounded-full bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]">
          <Ikonica
            aria-hidden="true"
            strokeWidth={1.75}
            className={okretanje ? "size-6 animate-spin motion-reduce:animate-none" : "size-6"}
          />
        </span>
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--mp-tekst)]">{naslov}</h1>
        {children}
      </Kartica>
    </PanelPoruka>
  );
}

function Opis({ children }: { children: ReactNode }) {
  return <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{children}</p>;
}

export function Prihvatanje({
  stanje,
  lokal,
  uloga,
  istice,
  prijavaHref,
  panelHref,
  radi = false,
  greska = null,
  onPrihvati,
}: PrihvatanjeProps) {
  switch (stanje) {
    case "ucitava":
      return (
        <Okvir ikonica={LoaderCircle} naslov={t.naslov} okretanje>
          <p role="status" className="text-[0.9375rem] text-[var(--mp-tekst-sporedni)]">
            {t.ucitavanje}
          </p>
        </Okvir>
      );

    case "vazeca": {
      const rola = uloga ? menuPanelSr.tim.uloge[uloga] : null;
      return (
        <Okvir ikonica={MailCheck} naslov={t.naslov}>
          <Opis>{fmt(t.opis, { lokal: lokal ?? "", uloga: rola?.naziv ?? "" })}</Opis>
          {rola ? (
            <p className="max-w-[46ch] rounded-[var(--mp-radius-unutra)] bg-[var(--mp-povrsina-utisana)] px-4 py-3 text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
              <span className="font-semibold text-[var(--mp-tekst)]">{rola.naziv}</span>
              {" — "}
              {rola.opis}
            </p>
          ) : null}
          {istice !== undefined ? (
            <p className="text-sm text-[var(--mp-tekst-sporedni)]">{fmt(t.istice, { datum: datumBeograd(istice) })}</p>
          ) : null}
          <div className="mt-2 grid justify-items-center gap-3">
            <Dugme vrsta="primarno" ucitava={radi} onClick={onPrihvati}>
              {radi ? t.prihvata : t.prihvati}
            </Dugme>
            {greska ? (
              <p role="alert" className="flex items-start gap-1.5 text-sm font-medium text-[var(--mp-tekst)]">
                <OctagonAlert aria-hidden="true" strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-[var(--mp-opasnost)]" />
                <span className="min-w-0 text-left">{greska}</span>
              </p>
            ) : null}
          </div>
        </Okvir>
      );
    }

    case "istekla":
      return (
        <Okvir ikonica={Clock} naslov={t.istekaoNaslov}>
          <Opis>{t.istekaoOpis}</Opis>
        </Okvir>
      );

    case "nevazeca":
      return (
        <Okvir ikonica={LinkIcon} naslov={t.nevazeciNaslov}>
          <Opis>{t.nevazeciOpis}</Opis>
        </Okvir>
      );

    case "prijava":
      return (
        <Okvir ikonica={LogIn} naslov={t.prijavaNaslov}>
          <Opis>{t.prijavaOpis}</Opis>
          <div className="mt-2">
            <Dugme asChild vrsta="primarno">
              <Link href={prijavaHref}>{t.prijavaDugme}</Link>
            </Dugme>
          </div>
        </Okvir>
      );

    case "drugi-nalog":
      return (
        <Okvir ikonica={UserX} naslov={t.drugiNalogNaslov}>
          <Opis>{t.drugiNalogOpis}</Opis>
        </Okvir>
      );

    case "prihvaceno":
      return (
        <Okvir ikonica={CircleCheck} naslov={t.uspehNaslov}>
          <div className="mt-2">
            <Dugme asChild vrsta="primarno">
              <Link href={panelHref}>{t.otvoriPanel}</Link>
            </Dugme>
          </div>
        </Okvir>
      );
  }
}
