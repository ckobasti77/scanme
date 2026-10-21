"use client";

// ScanMe Menu V1 — Izgled, the second mode of the editor (K17; master §7.1,
// §7.4, §13.4, §15.2; plan K09 §3.4). A curated choice that gives every venue
// a good result, never a free design tool: layout (with a live miniature and
// its Premium variant), colours (curated palettes as specimens, or the
// venue's brand palette after the automatic contrast check — never the ScanMe
// panel palette), the font pair, density and emphasis, the menu-wide media
// display, the guest tools, the ScanMe signature, and a quiet way to ask
// for a fully custom design. No spacing or size of any element is set here.
//
// Every choice saves at once into the DRAFT through the editor's save queue
// (lib/menu/studio/izgled-red.ts); guests see it after Objavi. The values on
// screen are the server's with the choices on the way laid over them — the
// same values the preview draws.

import { Info } from "lucide-react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { CasValue } from "@/lib/menu/cas";
import type { IzgledIzmena } from "@/lib/menu/identity/izbor";
import { premiumDelovi } from "@/lib/menu/identity/premium";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import type { MenuPresentationValues } from "@/lib/menu/presentation";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import { deoIzgleda, izgledIzTeksta, izgledKaoTekst, kljucIzgleda, type IzgledGrupa } from "@/lib/menu/studio/izgled-red";
import type { StudioIzgled, StudioRadnje } from "@/lib/menu/studio/model";
import { Kartica } from "../../zajednicko/kartica";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { BrendPaleta } from "./brend-paleta";
import { Brending } from "./brending";
import { GustinaIzbor, NaglasakIzbor } from "./gustina-naglasak";
import { GrupaIzgleda } from "./kontrole";
import { MedijiIzbor } from "./mediji-izbor";
import { imePalete, Palete } from "./palete";
import { imePara, ParoviPisma } from "./parovi-pisma";
import { PrilagodjenDizajn } from "./prilagodjen-dizajn";
import { RasporedIzbor, type MiniSadrzaj } from "./raspored-izbor";
import { ZaGoste } from "./za-goste";

const t = menuStudioSr.izgled;

/** Words for a value saved meanwhile by someone else (a conflict). */
function prikazSacuvanog(tekst: CasValue): string {
  const izmena = izgledIzTeksta(tekst);
  if (!izmena) return t.drugiIzbor;
  if (izmena.layout) return t.raspored.layouti[izmena.layout].naziv;
  if (izmena.paletteId) return izmena.paletteId.startsWith("brend") ? t.boje.brend.kartica : imePalete(izmena.paletteId === "default" ? "topla" : izmena.paletteId);
  if (izmena.fontPairId) return imePara(izmena.fontPairId === "default" ? "osnovni" : izmena.fontPairId);
  if (izmena.density) return t.gustina.vrednosti[izmena.density];
  if (izmena.emphasis) return t.naglasak.vrednosti[izmena.emphasis];
  if (izmena.defaultMediaMode) return t.mediji.vrednosti[izmena.defaultMediaMode];
  if (izmena.branding) return t.brending.vrednosti[izmena.branding];
  return t.drugiIzbor;
}

export function IzgledRadniProstor({
  izgled,
  prikaz,
  javni,
  mini,
  radnje,
  red,
  mozeUredjivanje,
  naslovId,
  lokal,
  slug,
}: {
  /** The draft appearance from the server (undefined = loading, null = refused). */
  izgled: StudioIzgled | null | undefined;
  /** The values on screen: the server's with the choices on the way. */
  prikaz: MenuPresentationValues | null;
  /** The appearance the venue's guests would get (the miniatures use it). */
  javni: JavniIzgled | null;
  mini: MiniSadrzaj;
  radnje: StudioRadnje;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  naslovId: string;
  lokal: string;
  slug: string;
}) {
  const naslov = (
    <h1 id={naslovId} tabIndex={-1} className="text-[1.5rem] font-semibold tracking-[-0.02em] lg:text-[1.75rem]">
      {t.naslov}
    </h1>
  );
  if (!izgled || !prikaz || !javni) {
    return (
      <Kartica className="grid gap-4">
        {naslov}
        {izgled === null ? <GreskaStanje opis={t.greska} /> : <UcitavanjeStanje oblik="forma" oznaka={t.ucitava} />}
      </Kartica>
    );
  }

  const vrednosti = izgled.vrednosti;
  const plan = izgled.plan;
  const onemoguceno = !mozeUredjivanje;
  const promeni = (grupa: IzgledGrupa, izmena: IzgledIzmena) => {
    const kljuc = kljucIzgleda(grupa);
    const novo = { ...deoIzgleda(prikaz, grupa), ...izmena };
    red.zakazi(kljuc, {
      ocekivano: izgledKaoTekst(deoIzgleda(vrednosti, grupa)),
      vrednost: izgledKaoTekst(novo),
      posalji: (ocekivano, vrednost) =>
        radnje.postaviIzgled(izgledIzTeksta(ocekivano) ?? {}, izgledIzTeksta(vrednost) ?? {}),
    });
  };
  const delovi = premiumDelovi(vrednosti);
  const izgubljen =
    (!plan.extraLayouts && (delovi.paleta || delovi.par || delovi.varijanta)) || (!plan.reducedBranding && delovi.brending);
  const grupa = (g: IzgledGrupa) => [kljucIzgleda(g)];

  return (
    <Kartica className="@container grid gap-5" data-izgled="">
      <div className="grid gap-2">
        {naslov}
        <p className="flex max-w-[62ch] items-start gap-2 text-sm leading-snug text-[var(--mp-tekst-sporedni)]">
          <Info aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
          {t.uvod}
        </p>
        {izgubljen ? (
          <p role="note" data-izgubljen-premium="" className="rounded-[var(--mp-radius-kontrola)] border bg-[var(--mp-upozorenje-meko)] px-3 py-2 text-[0.8125rem] leading-snug [--border:var(--mp-ivica-kontrole)]">
            {t.izgubljenPremium}
          </p>
        ) : null}
      </div>

      <GrupaIzgleda id="izgled-raspored" naslov={t.raspored.naslov} opis={t.raspored.opis} red={red} kljucevi={grupa("raspored")} prikaz={prikazSacuvanog}>
        <RasporedIzbor
            layout={prikaz.layout}
            varijanta={prikaz.layoutVariant ?? null}
            izgled={javni}
            sadrzaj={mini}
            premium={plan.extraLayouts}
            onLayout={(layout) => promeni("raspored", { layout, layoutVariant: null })}
            onVarijanta={(layoutVariant) => promeni("raspored", { layoutVariant })}
            onemoguceno={onemoguceno}
          />
      </GrupaIzgleda>

      <GrupaIzgleda id="izgled-boje" naslov={t.boje.naslov} opis={t.boje.opis} red={red} kljucevi={grupa("paleta")} prikaz={prikazSacuvanog}>
        <Palete
            paletteId={prikaz.paletteId}
            brandColors={prikaz.brandColors}
            premium={plan.extraLayouts}
            onIzbor={(paletteId) => promeni("paleta", { paletteId, brandColors: prikaz.brandColors })}
            onemoguceno={onemoguceno}
          />
        <BrendPaleta
          paletteId={prikaz.paletteId}
          brandColors={prikaz.brandColors}
          onemoguceno={onemoguceno}
          onSacuvaj={(paletteId, brandColors) => promeni("paleta", { paletteId, brandColors })}
        />
      </GrupaIzgleda>

      <GrupaIzgleda id="izgled-pismo" naslov={t.pismo.naslov} opis={t.pismo.opis} red={red} kljucevi={grupa("pismo")} prikaz={prikazSacuvanog}>
        <ParoviPisma
          fontPairId={prikaz.fontPairId}
          premium={plan.extraLayouts}
          onIzbor={(fontPairId) => promeni("pismo", { fontPairId })}
          onemoguceno={onemoguceno}
        />
      </GrupaIzgleda>

      <div className="grid gap-5 @lg:grid-cols-2 @lg:gap-6">
        <GrupaIzgleda id="izgled-gustina" naslov={t.gustina.naslov} opis={t.gustina.opis} red={red} kljucevi={grupa("gustina")} prikaz={prikazSacuvanog}>
          <GustinaIzbor gustina={prikaz.density} onIzbor={(density) => promeni("gustina", { density })} onemoguceno={onemoguceno} />
        </GrupaIzgleda>
        <GrupaIzgleda id="izgled-naglasak" naslov={t.naglasak.naslov} opis={t.naglasak.opis} red={red} kljucevi={grupa("naglasak")} prikaz={prikazSacuvanog}>
          <NaglasakIzbor naglasak={prikaz.emphasis} onIzbor={(emphasis) => promeni("naglasak", { emphasis })} onemoguceno={onemoguceno} />
        </GrupaIzgleda>
      </div>

      <GrupaIzgleda id="izgled-mediji" naslov={t.mediji.naslov} opis={t.mediji.opis} red={red} kljucevi={grupa("mediji")} prikaz={prikazSacuvanog}>
        <MedijiIzbor
            mediji={prikaz.defaultMediaMode}
            kompaktno={prikaz.layout === "compact"}
            onIzbor={(defaultMediaMode) => promeni("mediji", { defaultMediaMode })}
            onemoguceno={onemoguceno}
          />
      </GrupaIzgleda>

      <GrupaIzgleda
        id="izgled-za-goste"
        naslov={t.zaGoste.naslov}
        opis={t.zaGoste.opis}
        red={red}
        kljucevi={[kljucIzgleda("pretraga"), kljucIzgleda("filteri"), kljucIzgleda("valuta")]}
      >
        <ZaGoste
          pretraga={prikaz.search}
          filteri={prikaz.filters}
          valuta={prikaz.currencyToggle}
          onemoguceno={onemoguceno}
          onPretraga={(search) => promeni("pretraga", { search })}
          onFilteri={(filters) => promeni("filteri", { filters })}
          onValuta={(currencyToggle) => promeni("valuta", { currencyToggle })}
        />
      </GrupaIzgleda>

      <GrupaIzgleda id="izgled-brending" naslov={t.brending.naslov} opis={t.brending.opis} red={red} kljucevi={grupa("brending")} prikaz={prikazSacuvanog}>
        <Brending
          brending={prikaz.branding}
          premium={plan.reducedBranding}
          onIzbor={(branding) => promeni("brending", { branding })}
          onemoguceno={onemoguceno}
        />
      </GrupaIzgleda>

      <PrilagodjenDizajn lokal={lokal} slug={slug} />
    </Kartica>
  );
}
