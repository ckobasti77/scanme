"use client";

// ScanMe Menu V1 — the article detail (K15; master §5.5–§5.7, §7.3–§7.6, §7.9,
// §13.4; mockup 03). It takes the work area of `Ponuda` itself — no new tab,
// no new section: `Nazad na <sekcija>` returns to the list at the same place.
// The basic data comes first (name, price, section, description, quantity),
// then how the article shows (image, icon or nothing). The advanced groups
// are collapsed until opened, so a plain article stays `Naziv + Cena`:
//   Varijante i dodaci · Alergeni i oznake · Gde se prikazuje · Dostupnost i akcija.
// Everything goes into the draft by itself, except availability (live).
// K18: when someone else has the same article open, a quiet strip under the
// title says so (nothing is locked; a conflict of one field is asked about).

import { ArrowLeft, CircleSlash, Package, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { kljucCene, type AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { MenuPromoPriceContext } from "@/lib/menu/promo";
import type {
  StudioDetaljArtikla,
  StudioJezici,
  StudioKontekst,
  StudioRadnje,
  StudioRadniSadrzaj,
  StudioStranica,
} from "@/lib/menu/studio/model";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { KomboDetalj } from "../kombo/kombo-detalj";
import { useDrugiNaArtiklu } from "../prisustvo/kontekst";
import { PrisustvoTraka } from "../prisustvo/prisustvo";
import { ProblemObjaveTraka, type ProblemIzObjave } from "./problem-objave";
import { PrevodiArtikla, sazetakPrevoda } from "../prevodi/prevodi-artikla";
import { AlergeniIOznake } from "./alergeni-i-oznake";
import { DostupnostIAkcija, stanjeAkcije } from "./dostupnost-i-akcija";
import { GdeSePrikazuje } from "./gde-se-prikazuje";
import { OsnovnoArtikla } from "./osnovno";
import { SklopivaGrupa } from "./polja";
import { PrikazMedija } from "./prikaz-medija";
import { VarijanteIDodaci, type VarijantePocetno } from "./varijante-i-dodaci";

const t = menuStudioSr.artikal;
const g = t.grupe;

export type GrupaDetalja = "varijante" | "alergeni" | "gde" | "dostupnost" | "prevodi";

/** What the izlog opens the detail with (`fokus=artikal`, `fokus=varijante`). */
export type DetaljPocetno = {
  otvoreneGrupe?: readonly GrupaDetalja[];
  varijante?: VarijantePocetno;
  /** The promotion form open (inside `Dostupnost i akcija`). */
  akcijaOtvorena?: boolean;
  /** K18: opened from Objavi — what blocked or warned (a strip under the title says it and what to do). */
  problemi?: ProblemIzObjave;
};

function mnozina(grupa: { one: string; few: string; many: string }, n: number) {
  return fmt(grupa[srPluralCategory(n)], { n });
}

/** The one-line summaries of the collapsed groups (a closed group still says what is in it). */
export function sazeciGrupa(detalj: StudioDetaljArtikla, nedostupan: boolean, sada: number): Record<Exclude<GrupaDetalja, "prevodi">, string> {
  const varijante = [
    detalj.ukljuceno.varijante ? mnozina(g.varijante, detalj.varijante.length) : null,
    detalj.ukljuceno.dodaci ? mnozina(g.dodaci, detalj.grupe.length) : null,
    detalj.ukljuceno.napomena ? g.napomena : null,
  ].filter((deo): deo is string => deo !== null);
  const alergeni = detalj.alergeniUkljuceni
    ? detalj.alergeni === null
      ? g.alergeniNisuUneti
      : [
          detalj.alergeni.sadrzi.length > 0 ? fmt(g.sadrziBroj, { n: detalj.alergeni.sadrzi.length }) : null,
          detalj.alergeni.tragovi.length > 0 ? fmt(g.tragoviBroj, { n: detalj.alergeni.tragovi.length }) : null,
        ]
          .filter(Boolean)
          .join(" · ")
    : null;
  const oznake = detalj.oznake.length > 0 ? mnozina(g.oznakeBroj, detalj.oznake.length) : g.bezOznaka;
  const stranice = new Set(detalj.prikazi.map((prikaz) => prikaz.stranicaId)).size;
  return {
    varijante: varijante.length > 0 ? varijante.join(" · ") : g.iskljuceno,
    alergeni: [alergeni, oznake].filter(Boolean).join(" · "),
    gde: stranice > 0 ? mnozina(g.stranice, stranice) : g.nijednaStranica,
    dostupnost: [
      nedostupan ? g.nedostupno : g.dostupno,
      detalj.akcija ? fmt(g.akcija, { opis: stanjeAkcije(detalj.akcija, sada) }) : g.bezAkcije,
    ].join(" · "),
  };
}

export function DetaljArtikla({
  detalj,
  sadrzaj,
  izvorPrikazId,
  stranice,
  nedostupni,
  kontekst,
  red,
  radnje,
  naslovId,
  pocetno,
  sada,
  onNazad,
  najavi,
  jezici,
  podesavanjaHref = null,
  onObjavi = null,
}: {
  /** undefined = loading, null = the article no longer exists. */
  detalj: StudioDetaljArtikla | null | undefined;
  /** The open page (its sections for "Sekcija", the name of the way back). */
  sadrzaj: StudioRadniSadrzaj;
  /** The row the detail was opened from (null: opened by its key, e.g. from the address). */
  izvorPrikazId: string | null;
  stranice: readonly StudioStranica[];
  nedostupni: ReadonlySet<string>;
  kontekst: StudioKontekst;
  red: AutosaveRed;
  radnje: StudioRadnje;
  naslovId: string;
  pocetno?: DetaljPocetno;
  sada: number;
  onNazad: () => void;
  najavi: (tekst: string) => void;
  /** K16: the menu's languages (the "Prevodi" group); undefined = not loaded yet. */
  jezici?: StudioJezici;
  podesavanjaHref?: string | null;
  /** K18: opens Objavi again (the strip of an article reached from it). */
  onObjavi?: (() => void) | null;
}) {
  const [otvorene, setOtvorene] = useState<ReadonlySet<GrupaDetalja>>(() => new Set(pocetno?.otvoreneGrupe ?? []));
  const drugi = useDrugiNaArtiklu();
  const prebaci = (grupa: GrupaDetalja) => (otvoreno: boolean) =>
    setOtvorene((pre) => {
      const sledece = new Set(pre);
      if (otvoreno) sledece.add(grupa);
      else sledece.delete(grupa);
      return sledece;
    });

  // The section of the row on this page: the one it was opened from, else its first on this page.
  const naStranici = detalj?.prikazi.filter((prikaz) => prikaz.stranicaId === sadrzaj.stranica.id) ?? [];
  const izvor = naStranici.find((prikaz) => prikaz.prikazId === izvorPrikazId) ?? naStranici[0] ?? null;
  const nazad = izvor?.sekcija ?? sadrzaj.stranica.naziv;
  const dugmeNazad = (
    <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={ArrowLeft} onClick={onNazad} aria-label={fmt(t.nazadOznaka, { naziv: nazad })} className="justify-self-start" data-nazad-na-listu="">
      {fmt(t.nazad, { naziv: nazad })}
    </Dugme>
  );

  if (detalj === undefined) {
    return (
      <div className="grid content-start gap-4" data-detalj-artikla="ucitava">
        {dugmeNazad}
        <h1 id={naslovId} className="sr-only">
          {t.ucitava}
        </h1>
        <UcitavanjeStanje oblik="lista" redova={5} oznaka={t.ucitava} />
      </div>
    );
  }
  if (detalj === null) {
    return (
      <div className="grid content-start gap-4" data-detalj-artikla="nema">
        {dugmeNazad}
        <Kartica>
          <h1 id={naslovId} className="sr-only">
            {t.nePostojiNaslov}
          </h1>
          <PraznoStanje naslov={t.nePostojiNaslov} opis={t.nePostojiOpis} />
        </Kartica>
      </div>
    );
  }

  const { artikal } = detalj;
  const nedostupan = nedostupni.has(artikal.key);
  const mozeUredjivanje = kontekst.mozeUredjivanje && !sadrzaj.stranica.arhivirana;
  const sazeci = sazeciGrupa(detalj, nedostupan, sada);
  const cenaStanje = red.stanje(kljucCene(artikal.id));
  const cena = cenaStanje ? (typeof cenaStanje.vrednost === "number" ? cenaStanje.vrednost : null) : artikal.cena;
  const kontekstCene: MenuPromoPriceContext = {
    basePriceRsd: cena,
    variantsEnabled: detalj.ukljuceno.varijante,
    variants: detalj.varijante.map((varijanta) => ({ key: varijanta.key, priceRsd: varijanta.cena })),
  };

  return (
    <article className="grid content-start gap-4" data-detalj-artikla={artikal.key} aria-labelledby={naslovId}>
      {dugmeNazad}
      <header className="grid gap-2">
        <h1 id={naslovId} tabIndex={-1} className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] outline-none [overflow-wrap:anywhere] lg:text-[1.75rem]">
          {artikal.naziv}
        </h1>
        {artikal.vrsta === "combo" || nedostupan || artikal.proveriCenu ? (
          <span className="flex flex-wrap gap-1.5">
            {artikal.vrsta === "combo" ? (
              <StatusOznaka ton="neutralno" ikonica={Package} velicina="mala">
                {t.kombo}
              </StatusOznaka>
            ) : null}
            {nedostupan ? (
              <StatusOznaka ton="upozorenje" ikonica={CircleSlash} velicina="mala">
                {g.nedostupno}
              </StatusOznaka>
            ) : null}
            {artikal.proveriCenu ? (
              <StatusOznaka ton="upozorenje" ikonica={TriangleAlert} velicina="mala">
                {menuStudioSr.red.proveriCenu}
              </StatusOznaka>
            ) : null}
          </span>
        ) : null}
        <p className="text-sm text-[var(--mp-tekst-sporedni)]">{mozeUredjivanje ? t.nacrt : t.samoCitanje}</p>
      </header>
      <PrisustvoTraka imena={drugi} />
      {pocetno?.problemi ? (
        <ProblemObjaveTraka
          problem={pocetno.problemi}
          stanje={{
            naziv: artikal.naziv,
            cena,
            varijanteUkljucene: detalj.ukljuceno.varijante,
            ceneVarijanti: detalj.varijante.map((varijanta) => varijanta.cena),
            prikaza: detalj.prikazi.filter((prikaz) => !prikaz.arhivirana).length,
          }}
          onObjavi={onObjavi}
        />
      ) : null}

      <OsnovnoArtikla
        detalj={detalj}
        red={red}
        radnje={radnje}
        mozeUredjivanje={mozeUredjivanje}
        sekcije={sadrzaj.sekcije}
        izvor={izvor ? { prikazId: izvor.prikazId, sekcijaId: izvor.sekcijaId } : null}
        nazivStranice={sadrzaj.stranica.naziv}
      />
      {artikal.vrsta === "combo" && detalj.kombo ? (
        <KomboDetalj
          artikal={artikal}
          kombo={detalj.kombo}
          cena={cena}
          radnje={radnje}
          mozeUredjivanje={mozeUredjivanje}
          najavi={najavi}
          onNovaCena={() =>
            document.querySelector<HTMLInputElement>(`[data-detalj-artikla="${CSS.escape(artikal.key)}"] input[data-cena-polje]`)?.focus()
          }
        />
      ) : null}
      <PrikazMedija detalj={detalj} red={red} radnje={radnje} mozeUredjivanje={mozeUredjivanje} najavi={najavi} />

      <SklopivaGrupa
        id={`${naslovId}-varijante`}
        naslov={g.varijanteIDodaci}
        sazetak={sazeci.varijante}
        otvoreno={otvorene.has("varijante")}
        onOtvoreno={prebaci("varijante")}
      >
        <VarijanteIDodaci detalj={detalj} red={red} radnje={radnje} mozeUredjivanje={mozeUredjivanje} pocetno={pocetno?.varijante} najavi={najavi} />
      </SklopivaGrupa>
      <SklopivaGrupa
        id={`${naslovId}-alergeni`}
        naslov={detalj.alergeniUkljuceni ? g.alergeniIOznake : g.oznake}
        sazetak={sazeci.alergeni}
        otvoreno={otvorene.has("alergeni")}
        onOtvoreno={prebaci("alergeni")}
      >
        <AlergeniIOznake detalj={detalj} red={red} radnje={radnje} mozeUredjivanje={mozeUredjivanje} />
      </SklopivaGrupa>
      <SklopivaGrupa id={`${naslovId}-gde`} naslov={g.gdeSePrikazuje} sazetak={sazeci.gde} otvoreno={otvorene.has("gde")} onOtvoreno={prebaci("gde")}>
        <GdeSePrikazuje detalj={detalj} cena={cena} stranice={stranice} radnje={radnje} mozeUredjivanje={mozeUredjivanje} najavi={najavi} />
      </SklopivaGrupa>
      <SklopivaGrupa
        id={`${naslovId}-dostupnost`}
        naslov={g.dostupnostIAkcija}
        sazetak={sazeci.dostupnost}
        otvoreno={otvorene.has("dostupnost")}
        onOtvoreno={prebaci("dostupnost")}
      >
        <DostupnostIAkcija
          detalj={detalj}
          kontekstCene={kontekstCene}
          nedostupan={nedostupan}
          red={red}
          radnje={radnje}
          mozeUredjivanje={mozeUredjivanje}
          mozeDostupnost={kontekst.mozeDostupnost}
          premium={kontekst.plan === "premium"}
          sada={sada}
          najavi={najavi}
          pocetnoOtvorena={pocetno?.akcijaOtvorena}
        />
      </SklopivaGrupa>
      {jezici && detalj.prevodi && (jezici.prevodi.length > 0 || jezici.vanLimita.length > 0) ? (
        <SklopivaGrupa
          id={`${naslovId}-prevodi`}
          naslov={menuStudioSr.posebno.prevodi.naslov}
          sazetak={sazetakPrevoda(detalj.prevodi, jezici)}
          otvoreno={otvorene.has("prevodi")}
          onOtvoreno={prebaci("prevodi")}
        >
          <PrevodiArtikla
            stavke={detalj.prevodi}
            jezici={jezici}
            radnje={radnje}
            red={red}
            mozeUredjivanje={mozeUredjivanje}
            najavi={najavi}
            podesavanjaHref={podesavanjaHref ?? undefined}
          />
        </SklopivaGrupa>
      ) : null}
    </article>
  );
}
