// ScanMe Menu V1 — the panel's whole-screen states (K08): loading, sign in,
// no access (with the way to the waiter panel for staff), service switched
// off, and a section the role does not see. Each one says what happened and
// what to do next (docs/menu/MENU-UX.md §9); none of them is a dead end.

import { KeyRound, Lock, LogIn, PowerOff, ShieldX, UserRoundCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { fmt } from "@/lib/i18n/format";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { cn } from "@/lib/utils";
import { Dugme } from "../zajednicko/dugme";
import { Kartica } from "../zajednicko/kartica";
import { MenuPovrsina } from "../zajednicko/povrsina";
import { PraznoStanje, UcitavanjeStanje } from "../zajednicko/stanja";
import { ZaglavljeSaStatusom } from "../zajednicko/zaglavlje-sa-statusom";
import tokeni from "../zajednicko/tokeni.module.css";

const t = menuPanelSr;

/** A whole-screen message: the ScanMe wordmark, one card, room for a second card. */
export function PanelPoruka({ children }: { children: ReactNode }) {
  return (
    <MenuPovrsina as="main" className="grid min-h-[100dvh] place-items-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-[34rem] gap-4">
        <BrandLogo width="6.25rem" className="mb-2 justify-self-center" />
        {children}
      </div>
    </MenuPovrsina>
  );
}

function Poruka({
  ikonica: Ikonica,
  naslov,
  opis,
  radnje,
}: {
  ikonica: LucideIcon;
  naslov: string;
  opis: string;
  radnje?: ReactNode;
}) {
  return (
    <Kartica className="grid justify-items-center gap-3 px-5 py-8 text-center sm:px-8">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]">
        <Ikonica aria-hidden="true" strokeWidth={1.75} className="size-6" />
      </span>
      <h1 className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-[var(--mp-tekst)]">{naslov}</h1>
      <p className="max-w-[46ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{opis}</p>
      {radnje ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{radnje}</div> : null}
    </Kartica>
  );
}

/** The shell is on its way: a skeleton in the shape of the frame (side navigation or top bar) and a section. */
export function PanelUcitavanje() {
  const kost = (klase: string) => cn(tokeni.kostur, "rounded-[var(--mp-radius-unutra)]", klase);
  return (
    <MenuPovrsina className="min-h-[100dvh] lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <div aria-hidden="true" className="flex min-h-16 items-center gap-3 border-b px-3 [--border:var(--mp-ivica)] sm:px-5 lg:hidden">
        <div className={kost("size-11")} />
        <div className="grid gap-1.5">
          <div className={kost("h-4 w-32")} />
          <div className={kost("h-3.5 w-44")} />
        </div>
      </div>
      <div aria-hidden="true" className="hidden py-3 pl-3 lg:block">
        <div className="grid h-[calc(100dvh-1.5rem)] content-start gap-3 rounded-[var(--mp-radius-okvir)] border p-6 [--border:var(--mp-ivica)]">
          <div className={kost("h-5 w-24")} />
          <div className={kost("mb-4 h-4 w-40")} />
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className={kost("h-9")} />
          ))}
        </div>
      </div>
      <div className="mx-auto grid w-full max-w-[72rem] content-start gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div aria-hidden="true" className="grid gap-2">
          <div className={kost("h-8 w-48")} />
          <div className={kost("h-4 w-72 max-w-full")} />
        </div>
        <UcitavanjeStanje oblik="kartice" redova={1} oznaka={t.stanja.ucitavanje} />
      </div>
    </MenuPovrsina>
  );
}

/** A quiet card with an icon, a heading, one sentence and one action. */
function SporednaKartica({
  id,
  ikonica: Ikonica,
  naslov,
  opis,
  akcija,
}: {
  id: string;
  ikonica: LucideIcon;
  naslov: string;
  opis: string;
  akcija?: ReactNode;
}) {
  return (
    <Kartica as="section" ton="utisana" aria-labelledby={id} className="grid gap-3">
      <div className="flex items-start gap-3">
        <Ikonica aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
        <div className="grid gap-1">
          <h2 id={id} className="text-base font-semibold text-[var(--mp-tekst)]">
            {naslov}
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{opis}</p>
        </div>
      </div>
      {akcija ? <div className="justify-self-start sm:pl-8">{akcija}</div> : null}
    </Kartica>
  );
}

/**
 * For staff (PIN, no account): the client panel is not theirs (master §10.1);
 * this card says where their work is. Shown wherever staff can land: signed
 * out and signed in without a role.
 */
function OsobljeKartica({ konobarHref }: { konobarHref: string }) {
  return (
    <SporednaKartica
      id="menu-panel-osoblje"
      ikonica={KeyRound}
      naslov={t.stanja.osobljeNaslov}
      opis={t.stanja.osobljeOpis}
      akcija={
        <Dugme asChild vrsta="sekundarno">
          <Link href={konobarHref}>{t.stanja.osobljeDugme}</Link>
        </Dugme>
      }
    />
  );
}

/** Signed out: the existing client panel signs in (the auth flow is not duplicated here). */
export function PanelPrijava({ prijavaHref, konobarHref }: { prijavaHref: string; konobarHref: string }) {
  return (
    <PanelPoruka>
      <Poruka
        ikonica={LogIn}
        naslov={t.stanja.prijavaNaslov}
        opis={t.stanja.prijavaOpis}
        radnje={
          <Dugme asChild vrsta="primarno">
            <Link href={prijavaHref}>{t.stanja.prijavaDugme}</Link>
          </Dugme>
        }
      />
      <OsobljeKartica konobarHref={konobarHref} />
    </PanelPoruka>
  );
}

/**
 * Signed in without a role here (or no ScanMe Menu at this venue: the same
 * answer). Two readers: someone who manages the venue on the wrong account, and
 * staff, who never get the client panel (master §10.1).
 */
export function PanelBezPristupa({
  klijentskiPanelHref,
  konobarHref,
}: {
  klijentskiPanelHref: string;
  konobarHref: string;
}) {
  return (
    <PanelPoruka>
      <Poruka
        ikonica={ShieldX}
        naslov={t.stanja.bezPristupaNaslov}
        opis={t.stanja.bezPristupaOpis}
        radnje={
          <Dugme asChild vrsta="primarno">
            <Link href={klijentskiPanelHref}>{t.stanja.nazadNaKlijentskiPanel}</Link>
          </Dugme>
        }
      />
      <SporednaKartica
        id="menu-panel-vlasnik"
        ikonica={UserRoundCheck}
        naslov={t.stanja.vlasnikNaslov}
        opis={t.stanja.vlasnikOpis}
      />
      <OsobljeKartica konobarHref={konobarHref} />
    </PanelPoruka>
  );
}

/** A role here, but ScanMe switched the service off (serviceProfiles.status). */
export function PanelNeaktivan({ klijentskiPanelHref }: { klijentskiPanelHref: string }) {
  return (
    <PanelPoruka>
      <Poruka
        ikonica={PowerOff}
        naslov={t.stanja.neaktivnoNaslov}
        opis={t.stanja.neaktivnoOpis}
        radnje={
          <Dugme asChild vrsta="sekundarno">
            <Link href={klijentskiPanelHref}>{t.stanja.nazadNaKlijentskiPanel}</Link>
          </Dugme>
        }
      />
    </PanelPoruka>
  );
}

/** Inside the shell: a section the role does not see (an Urednik opening Tim i pristupi by URL). */
export function SekcijaZabranjena({
  naslov,
  uloga,
  pocetnaHref,
}: {
  naslov: string;
  uloga: string;
  pocetnaHref: string;
}) {
  return (
    <>
      <ZaglavljeSaStatusom naslov={naslov} />
      <Kartica data-sekcija-zabranjena="">
        <PraznoStanje
          ikonica={Lock}
          naslov={t.stanja.zabranjenoNaslov}
          opis={fmt(t.stanja.zabranjenoOpis, { uloga })}
          akcija={
            <Dugme asChild vrsta="sekundarno">
              <Link href={pocetnaHref}>{t.stanja.idiNaPocetnu}</Link>
            </Dugme>
          }
        />
      </Kartica>
    </>
  );
}
