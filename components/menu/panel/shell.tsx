"use client";

// ScanMe Menu V1 — the client panel shell (K08, master §13.1, §13.3).
//
// Presentational: the route (ruta.tsx) and the izlog pass the venue, the
// pre-rendered mode line, the role and the visible sections; the shell draws
// the frame and owns only two bits of UI state (rail collapsed, drawer open).
//   - from 1024 px: a side navigation on the warm frame; it collapses into an
//     icon rail on demand and by default while the Editor is open;
//   - below 1024 px (tablet portrait, phone): a top bar and the same list in a
//     drawer from the left.
// The mode ("ScanMe Menu · Ugostiteljstvo") is a quiet line under the venue
// name, never a control (master §4.1). The app's global theme button stays
// the only theme control (docs/menu/MENU-UX.md §8); the content keeps room
// for it at the bottom.

import { LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { navSkupljenaPodrazumevano, PANEL_NAV_SEKCIJE, type PanelNavSekcija } from "@/lib/menu/panel-nav";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import { MenuPovrsina } from "../zajednicko/povrsina";
import { StatusOznaka } from "../zajednicko/status-oznaka";
import { PanelNav, type PanelNavStavka } from "./nav";

const t = menuPanelSr;

export const MENU_PANEL_SADRZAJ_ID = "menu-panel-sadrzaj";
const BOCNA_NAVIGACIJA_ID = "menu-panel-bocna-navigacija";

export type MenuPanelShellProps = {
  /** The venue's name. */
  lokal: string;
  /** "ScanMe Menu · Ugostiteljstvo" — menu-domen.serviceLabel with the locked mode. */
  rezim: string;
  premium: boolean;
  /** The caller's role in words (menu-domen.roles). */
  uloga: string;
  /** Visible sections with their links, already in the locked order. */
  stavke: readonly PanelNavStavka[];
  aktivna: PanelNavSekcija | null;
  /** The existing client panel with every other service of the venue. */
  klijentskiPanelHref: string;
  children: ReactNode;
};

function Lokal({ lokal, rezim, premium }: { lokal: string; rezim: string; premium: boolean }) {
  return (
    <div className="grid min-w-0 justify-items-start gap-1">
      <p className="text-[1.0625rem] font-semibold leading-snug tracking-[-0.01em] text-[var(--mp-tekst)] [overflow-wrap:anywhere]">
        {lokal}
      </p>
      <p data-rezim="" className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
        {rezim}
      </p>
      {premium ? (
        <StatusOznaka ton="neutralno" ikonica={Sparkles} velicina="mala" className="mt-1">
          {t.shell.premium}
        </StatusOznaka>
      ) : null}
    </div>
  );
}

const linkKlase =
  "flex min-h-[var(--mp-meta)] items-center gap-3 rounded-[var(--mp-radius-kontrola)] text-sm font-medium text-[var(--mp-tekst)] transition-colors duration-[var(--mp-trajanje-1)] hover:bg-[var(--mp-povrsina-utisana)] motion-reduce:transition-none";

function NazadNaKlijentskiPanel({ href, skupljeno = false }: { href: string; skupljeno?: boolean }) {
  return (
    <Link
      href={href}
      title={skupljeno ? t.shell.nazadNaKlijentskiPanel : undefined}
      className={cn(linkKlase, skupljeno ? "size-[var(--mp-meta)] justify-center" : "px-3")}
    >
      <LayoutGrid aria-hidden="true" strokeWidth={1.75} className="size-5 shrink-0" />
      <span className={skupljeno ? "sr-only" : undefined}>{t.shell.nazadNaKlijentskiPanel}</span>
    </Link>
  );
}

export function MenuPanelShell({
  lokal,
  rezim,
  premium,
  uloga,
  stavke,
  aktivna,
  klijentskiPanelHref,
  children,
}: MenuPanelShellProps) {
  const [skupljeno, setSkupljeno] = useState(() => navSkupljenaPodrazumevano(aktivna));
  const [fiokaOtvorena, setFiokaOtvorena] = useState(false);
  // Entering or leaving the Editor resets the rail to its default for that
  // screen; moving between the other sections keeps the person's own choice.
  const [prethodna, setPrethodna] = useState(aktivna);
  if (prethodna !== aktivna) {
    setPrethodna(aktivna);
    const editorSada = navSkupljenaPodrazumevano(aktivna);
    if (editorSada !== navSkupljenaPodrazumevano(prethodna)) setSkupljeno(editorSada);
  }

  const ulogaTekst = fmt(t.shell.uloga, { uloga });
  // A role that sees fewer than the eight sections (Urednik) is told why the list is short.
  const skraceno = stavke.length < PANEL_NAV_SEKCIJE.length;
  const ulogaBlok = (
    <div className="grid gap-1 px-3 pb-1 text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
      <p>{ulogaTekst}</p>
      {skraceno ? <p>{t.shell.ostaleSekcije}</p> : null}
    </div>
  );

  return (
    <MenuPovrsina
      data-menu-panel=""
      data-nav={skupljeno ? "skupljena" : "prosirena"}
      className="min-h-[100dvh] lg:grid lg:grid-cols-[auto_minmax(0,1fr)]"
    >
      <a
        href={`#${MENU_PANEL_SADRZAJ_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-[var(--mp-meta)] focus:items-center focus:rounded-[var(--mp-radius-kontrola)] focus:bg-[var(--mp-mastilo)] focus:px-4 focus:text-sm focus:font-semibold focus:text-[var(--mp-na-mastilu)]"
      >
        {t.shell.preskoci}
      </a>

      {/* Below 1024 px: top bar + drawer. */}
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] px-3 py-2 sm:px-5 lg:hidden">
        <Fioka
          okidac={
            <Dugme ikonica={Menu} vrsta="sekundarno" velicina="kompaktna" className="shrink-0">
              <span className="sr-only sm:not-sr-only">{t.shell.otvoriNavigaciju}</span>
            </Dugme>
          }
          naslov={lokal}
          opis={rezim}
          strana="levo"
          otvoreno={fiokaOtvorena}
          onOtvoreno={setFiokaOtvorena}
        >
          <div className="grid gap-4">
            {premium ? (
              <StatusOznaka ton="neutralno" ikonica={Sparkles} velicina="mala" className="justify-self-start">
                {t.shell.premium}
              </StatusOznaka>
            ) : null}
            <PanelNav stavke={stavke} aktivna={aktivna} onIzbor={() => setFiokaOtvorena(false)} />
            <div className="grid gap-2 border-t pt-3 [--border:var(--mp-ivica)]">
              {ulogaBlok}
              <NazadNaKlijentskiPanel href={klijentskiPanelHref} />
            </div>
          </div>
        </Fioka>
        <div className="grid min-w-0 gap-0.5">
          <p className="truncate font-semibold leading-snug text-[var(--mp-tekst)]">{lokal}</p>
          <p data-rezim="" className="truncate text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
            {rezim}
          </p>
        </div>
      </header>

      {/* From 1024 px: side navigation, collapsible into an icon rail. */}
      <aside className="sticky top-0 hidden h-[100dvh] py-3 pl-3 lg:block">
        <div
          id={BOCNA_NAVIGACIJA_ID}
          className={cn(
            "flex h-full flex-col rounded-[var(--mp-radius-okvir)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] shadow-[var(--mp-senka-xs)]",
            skupljeno ? "w-[4.75rem] items-center px-2 py-3" : "w-[16rem] p-3",
          )}
        >
          {skupljeno ? null : (
            <div className="grid gap-4 px-3 pb-5 pt-2">
              <BrandLogo width="6.25rem" />
              <Lokal lokal={lokal} rezim={rezim} premium={premium} />
            </div>
          )}
          {/* The focus ring sits 3 px outside a link (app/globals.css): the scroll box keeps 6 px for it. */}
          <div
            className={cn(
              "-mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5",
              skupljeno ? "pt-1.5" : "border-t pt-3 [--border:var(--mp-ivica)]",
            )}
          >
            <PanelNav stavke={stavke} aktivna={aktivna} skupljeno={skupljeno} />
          </div>
          <div
            className={cn(
              "grid gap-2 border-t pt-3 [--border:var(--mp-ivica)]",
              skupljeno ? "justify-items-center" : undefined,
            )}
          >
            {skupljeno ? null : ulogaBlok}
            <NazadNaKlijentskiPanel href={klijentskiPanelHref} skupljeno={skupljeno} />
            {skupljeno ? (
              <IkonicaDugme
                ikonica={PanelLeftOpen}
                oznaka={t.shell.prosiriNavigaciju}
                aria-expanded={false}
                aria-controls={BOCNA_NAVIGACIJA_ID}
                onClick={() => setSkupljeno(false)}
              />
            ) : (
              <Dugme
                vrsta="tiho"
                velicina="kompaktna"
                ikonica={PanelLeftClose}
                aria-expanded
                aria-controls={BOCNA_NAVIGACIJA_ID}
                onClick={() => setSkupljeno(true)}
                className="w-full justify-start px-3 [--button-radius:var(--mp-radius-kontrola)] rounded-[var(--mp-radius-kontrola)]"
              >
                {t.shell.skupiNavigaciju}
              </Dugme>
            )}
          </div>
        </div>
      </aside>

      <main
        id={MENU_PANEL_SADRZAJ_ID}
        tabIndex={-1}
        className="min-w-0 px-4 pb-24 pt-6 outline-none sm:px-6 lg:px-8 lg:pb-16 lg:pt-10"
      >
        <div className="mx-auto grid max-w-[72rem] gap-8">{children}</div>
      </main>
    </MenuPovrsina>
  );
}
