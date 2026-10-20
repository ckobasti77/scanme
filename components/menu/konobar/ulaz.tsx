// ScanMe Menu V1 — entry of the waiter panel without its code (K08). The
// client panel sends staff here ("Kako da uđem u konobarski panel"); the panel
// itself lives behind a secret code (`/[slug]/konobar/[kod]`, K22) that is never
// shown to someone who is not signed in to it. This page only says how staff
// gets in. Waiter identity: higher contrast, 48 px targets (docs/menu/MENU-UX.md §1.3).

import { ConciergeBell } from "lucide-react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { Kartica } from "../zajednicko/kartica";
import { MenuPovrsina } from "../zajednicko/povrsina";

const t = menuPanelSr.konobar;

export function KonobarUlaz({ klijentskiPanelHref }: { klijentskiPanelHref: string }) {
  return (
    <MenuPovrsina as="main" povrsina="konobar" className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="grid w-full max-w-[30rem] gap-4">
        <BrandLogo width="6.25rem" className="mb-2 justify-self-center" />
        <Kartica className="grid gap-5 px-5 py-8 sm:px-8">
          <span className="grid size-14 place-items-center rounded-full bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]">
            <ConciergeBell aria-hidden="true" strokeWidth={2} className="size-6" />
          </span>
          <div className="grid gap-2">
            <h1 className="text-2xl font-bold leading-tight text-[var(--mp-tekst)]">{t.naslov}</h1>
            <p className="text-base leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.opis}</p>
          </div>
          <ol className="grid list-decimal gap-2 pl-5 text-base leading-relaxed text-[var(--mp-tekst)] marker:font-bold">
            {t.koraci.map((korak) => (
              <li key={korak}>{korak}</li>
            ))}
          </ol>
          <p className="border-t pt-4 text-base leading-relaxed text-[var(--mp-tekst)] [--border:var(--mp-ivica)]">
            {t.bezLinka}
          </p>
        </Kartica>
        <Link
          href={klijentskiPanelHref}
          className="inline-flex min-h-[var(--mp-meta)] items-center justify-self-center rounded-[var(--mp-radius-kontrola)] px-3 text-center text-base font-semibold text-[var(--mp-tekst)] underline underline-offset-4 hover:bg-[var(--mp-povrsina-utisana)]"
        >
          {t.vlasnik}
        </Link>
      </div>
    </MenuPovrsina>
  );
}
