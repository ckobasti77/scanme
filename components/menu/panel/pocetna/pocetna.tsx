// ScanMe Menu V1 (K27) — Početna of the client panel (master §13.2, §13.3; plan
// docs/meni/planovi/K24.md §4.2): "does anything need my attention?", then what
// is happening now, the menu status, the (still empty) analytics card and the
// quick entries. Blocks in this order: Pažnja · Meni · Sada u lokalu · Analitika
// · Brzi ulazi. From 1024 px a 12-column grid (Pažnja 7 + Meni 5, Sada 7 +
// Analitika 5, the entries in one row; Meni and Analitika are only as tall as
// their content, not as tall as the block next to them); below that one column
// in the same order.
// The Analitika card is the ONE darker card of the screen and shows no number
// until K30. Each block shows only what the role may open: an Urednik gets
// Pažnja (the menu lines), Meni and the entry to the Editor.
//
// Presentational: the route (pocetna-ruta.tsx) and the izlog pass the summary
// computed by lib/menu/home-summary.ts, the clock and the links. The same
// number is never shown in two blocks (that rule lives in home-summary.ts).

import { Activity, ChartColumn, ConciergeBell, QrCode, SquarePen, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { HomeSummary } from "@/lib/menu/home-summary";
import { roleCan, type MenuActor, type MenuPermission } from "@/lib/menu/permissions";
import { kadaTekst } from "@/lib/menu/studio/kada";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { SavObjave } from "../../zajednicko/sav-objave";
import { PraznoStanje } from "../../zajednicko/stanja";
import { ZaglavljeSaStatusom } from "../../zajednicko/zaglavlje-sa-statusom";
import { Paznja } from "./paznja";
import { Sada } from "./sada";

const t = menuPanelSr.pocetna;

/** Where each link of Početna leads (the route builds them from the slug, the izlog from its own route). */
export type PocetnaHrefs = {
  editor: string;
  operativa: string;
  lokal: string;
  analitika: string;
  podesavanja: string;
  konobar: string;
};

/** The quick entries, in order, each with the permission that opens it (lib/menu/panel-nav.ts). */
const ULAZI: readonly { kljuc: keyof PocetnaHrefs & keyof typeof t.brziUlazi; dozvola: MenuPermission; ikonica: LucideIcon }[] = [
  { kljuc: "editor", dozvola: "menu.read", ikonica: SquarePen },
  { kljuc: "operativa", dozvola: "operations.read", ikonica: Activity },
  { kljuc: "lokal", dozvola: "venue.edit", ikonica: QrCode },
  { kljuc: "analitika", dozvola: "analytics.read", ikonica: ChartColumn },
  { kljuc: "konobar", dozvola: "waiter.work", ikonica: ConciergeBell },
];

function MeniBlok({ meni, nowMs, editorHref, className }: { meni: HomeSummary["meni"]; nowMs: number; editorHref: string; className?: string }) {
  return (
    <Kartica data-blok="meni" data-meni={meni.stanje} className={className}>
      <OkvirSekcije id="pocetna-meni" naslov={t.meni.naslov} opis={t.meni.opis}>
        <div className="grid justify-items-start gap-4">
          <SavObjave
            objavljeno={
              meni.objavljeno
                ? { broj: meni.objavljeno.broj, kada: kadaTekst(meni.objavljeno.kada, nowMs, menuStudioSr.zaglavlje) }
                : null
            }
            neobjavljeneIzmene={meni.stanje === "dirty" ? "ima" : 0}
          />
          {meni.objavljeno === null ? (
            <p className="max-w-[60ch] text-[0.9375rem] leading-relaxed text-[var(--mp-tekst-sporedni)]">{t.meni.nikad}</p>
          ) : null}
          <Dugme asChild vrsta="sekundarno">
            <Link href={editorHref}>
              <SquarePen aria-hidden="true" strokeWidth={1.75} />
              {menuPanelSr.sekcija.otvoriEditor}
            </Link>
          </Dugme>
        </div>
      </OkvirSekcije>
    </Kartica>
  );
}

/** The one darker card of the screen. Until K30 it says honestly that analytics is coming: no number. */
function AnalitikaBlok({ className }: { className?: string }) {
  return (
    <Kartica ton="istaknuta" data-blok="analitika" className={className}>
      <OkvirSekcije id="pocetna-analitika" naslov={t.analitika.naslov}>
        <PraznoStanje nivo={3} ikonica={ChartColumn} naslov={t.analitika.prazno} opis={t.analitika.praznoOpis} className="py-6" />
      </OkvirSekcije>
    </Kartica>
  );
}

function BrziUlazi({ actor, hrefs, className }: { actor: MenuActor; hrefs: PocetnaHrefs; className?: string }) {
  const ulazi = ULAZI.filter((ulaz) => roleCan(actor, ulaz.dozvola));
  return (
    <div data-blok="brzi-ulazi" className={className}>
      <OkvirSekcije id="pocetna-brzi-ulazi" naslov={t.brziUlazi.naslov}>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {ulazi.map(({ kljuc, ikonica: Ikonica }) => (
            <li key={kljuc} className="flex">
              <Link
                href={hrefs[kljuc]}
                data-ulaz={kljuc}
                className="flex min-h-[var(--mp-meta)] w-full flex-col items-start gap-3 rounded-[var(--mp-radius-kartica)] border [--border:var(--mp-ivica)] bg-[var(--mp-povrsina)] p-4 shadow-[var(--mp-senka-xs)] transition-colors duration-[var(--mp-trajanje-1)] ease-[var(--mp-kriva-ulaz)] hover:bg-[var(--mp-povrsina-utisana)] motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--mp-akcent-meko)] text-[var(--mp-akcent-tekst)]"
                >
                  <Ikonica strokeWidth={1.75} className="size-5" />
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span className="font-semibold leading-snug text-[var(--mp-tekst)]">{t.brziUlazi[kljuc].naziv}</span>
                  <span className="text-sm leading-snug text-[var(--mp-tekst-sporedni)]">{t.brziUlazi[kljuc].opis}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </OkvirSekcije>
    </div>
  );
}

export function Pocetna({
  summary,
  actor,
  nowMs,
  hrefs,
}: {
  summary: HomeSummary;
  actor: MenuActor;
  nowMs: number;
  hrefs: PocetnaHrefs;
}) {
  return (
    <>
      <ZaglavljeSaStatusom naslov={menuPanelSr.sekcije.pocetna} opis={t.opis} />
      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        <Paznja summary={summary} actor={actor} nowMs={nowMs} hrefs={hrefs} className="lg:col-span-7" />
        <MeniBlok meni={summary.meni} nowMs={nowMs} editorHref={hrefs.editor} className="lg:col-span-5 lg:self-start" />
        {summary.sada ? <Sada sada={summary.sada} className="lg:col-span-7" /> : null}
        {roleCan(actor, "analytics.read") ? <AnalitikaBlok className="lg:col-span-5 lg:self-start" /> : null}
        <BrziUlazi actor={actor} hrefs={hrefs} className="lg:col-span-12" />
      </div>
    </>
  );
}
