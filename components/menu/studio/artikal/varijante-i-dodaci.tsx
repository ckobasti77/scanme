"use client";

// ScanMe Menu V1 — `Varijante i dodaci` of the article detail (K15; master
// §5.7, §7.5). Everything here is OFF by default, so a plain article stays
// `Naziv + Cena`: three separate switches — variants (the guest picks one,
// each with its own price), add-on groups (one or several choices, required
// or optional, min / max as an advanced setting; a group can be LINKED to
// many articles) and the guest's free note. A switch that goes off keeps
// every row (the server does too).

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_TEXT } from "@/lib/menu/limits";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type { StudioDetaljArtikla, StudioIshod, StudioRadnje, StudioVarijanta } from "@/lib/menu/studio/model";
import { formatCenaPolje, parseCenaUnos } from "@/lib/menu/studio/price-input";
import { cleanText } from "@/lib/menu/text";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { Prekidac } from "../../zajednicko/prekidac";
import { porukaGreske } from "../red-artikla/red-artikla";
import { DodajGrupuDijalog } from "./dodaj-grupu-dijalog";
import { GrupaDodataka } from "./grupa-dodataka";
import { POLJE_KLASA, ProblemKljuca, StanjeKljuca } from "./polja";
import { PrimeniNaDruge } from "./primeni-na-druge";
import { UticajGrupeDijalog, type OpsegIzmene } from "./uticaj-grupe-dijalog";

const t = menuStudioSr.artikal;

export type VarijanteRadnje = Pick<
  StudioRadnje,
  | "postaviPrekidace"
  | "dodajVarijantu"
  | "izmeniVarijantu"
  | "obrisiVarijantu"
  | "novaGrupa"
  | "postojeceGrupe"
  | "prikaciGrupu"
  | "otkaciGrupu"
  | "uticajGrupe"
  | "izmeniGrupu"
  | "dodajOpciju"
  | "izmeniOpciju"
  | "obrisiOpciju"
  | "primeniGrupuNa"
  | "traziArtikle"
>;

/** What the izlog opens with (`fokus=varijante`): the impact dialog of a linked group. */
export type VarijantePocetno = { uticajGrupe?: string };

function poruka(ishod: StudioIshod<unknown>): string | null {
  if (ishod.ok) return null;
  if (ishod.vrsta === "konflikt") return fmt(t.konflikt, { sacuvano: String(ishod.sacuvano ?? t.bezVrednosti) });
  return ishod.ponovljivo ? t.nijeSacuvano : (porukaGreske(ishod.kod) ?? t.nijeSacuvano);
}

export function VarijanteIDodaci({
  detalj,
  red,
  radnje,
  mozeUredjivanje,
  pocetno,
  najavi,
}: {
  detalj: StudioDetaljArtikla;
  red: AutosaveRed;
  radnje: VarijanteRadnje;
  mozeUredjivanje: boolean;
  pocetno?: VarijantePocetno;
  najavi: (tekst: string) => void;
}) {
  const { artikal } = detalj;
  const kombo = artikal.vrsta === "combo";
  // The group being edited, by its place on the article (a copy keeps the place), and for whom.
  const [uredi, setUredi] = useState<{ indeks: number; opseg: OpsegIzmene } | null>(null);
  const [uticaj, setUticaj] = useState<string | null>(pocetno?.uticajGrupe ?? null);
  const [primeni, setPrimeni] = useState<string | null>(null);
  const [dodaj, setDodaj] = useState(false);

  const prekidac = (polje: keyof StudioDetaljArtikla["ukljuceno"]) => {
    const kljuc = `prekidac:${polje}:${artikal.id}`;
    const stanje = red.stanje(kljuc);
    const vrednost = stanje && typeof stanje.vrednost === "boolean" ? stanje.vrednost : detalj.ukljuceno[polje];
    return {
      kljuc,
      vrednost,
      promeni: (sledece: boolean) =>
        red.zakazi(kljuc, {
          ocekivano: detalj.ukljuceno[polje],
          vrednost: sledece,
          posalji: (_, v) => radnje.postaviPrekidace(artikal.id, { [polje]: v as boolean }),
        }),
    };
  };
  const varijante = prekidac("varijante");
  const dodaci = prekidac("dodaci");
  const napomena = prekidac("napomena");
  const grupaUticaja = detalj.grupe.find((grupa) => grupa.id === uticaj) ?? null;
  const grupaPrimene = detalj.grupe.find((grupa) => grupa.id === primeni) ?? null;

  return (
    <div className="grid gap-6" data-varijante-i-dodaci="">
      {/* Variants */}
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <Prekidac
            naziv={t.varijante.prekidac}
            opis={kombo ? t.varijante.komboNe : t.varijante.prekidacOpis}
            checked={varijante.vrednost}
            disabled={!mozeUredjivanje || (kombo && !varijante.vrednost)}
            onChange={(event) => varijante.promeni(event.target.checked)}
            data-prekidac-varijante=""
          />
          <StanjeKljuca red={red} kljuc={varijante.kljuc} />
        </div>
        <ProblemKljuca red={red} kljuc={varijante.kljuc} />
        {varijante.vrednost ? (
          <Varijante varijante={detalj.varijante} artikalId={artikal.id} red={red} radnje={radnje} mozeUredjivanje={mozeUredjivanje} />
        ) : null}
      </div>

      {/* Add-on groups */}
      <div className="grid gap-3 border-t pt-5 [--border:var(--mp-ivica)]">
        <div className="flex items-start justify-between gap-3">
          <Prekidac
            naziv={t.dodaci.prekidac}
            opis={t.dodaci.prekidacOpis}
            checked={dodaci.vrednost}
            disabled={!mozeUredjivanje}
            onChange={(event) => dodaci.promeni(event.target.checked)}
            data-prekidac-dodaci=""
          />
          <StanjeKljuca red={red} kljuc={dodaci.kljuc} />
        </div>
        <ProblemKljuca red={red} kljuc={dodaci.kljuc} />
        {dodaci.vrednost ? (
          <div className="grid gap-3">
            {detalj.grupe.length === 0 ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.dodaci.prazno}</p> : null}
            {detalj.grupe.length > 0 ? (
              <ul className="grid gap-2">
                {detalj.grupe.map((grupa, indeks) => (
                  <GrupaDodataka
                    key={grupa.id}
                    grupa={grupa}
                    artikalId={artikal.id}
                    red={red}
                    radnje={radnje}
                    mozeUredjivanje={mozeUredjivanje}
                    opseg={uredi?.indeks === indeks ? uredi.opseg : null}
                    onIzmeni={() => (grupa.brojArtikala > 1 ? setUticaj(grupa.id) : setUredi({ indeks, opseg: "sve" }))}
                    onZavrsi={() => setUredi(null)}
                    onPrimeni={() => setPrimeni(grupa.id)}
                    najavi={najavi}
                  />
                ))}
              </ul>
            ) : null}
            {mozeUredjivanje ? (
              <span>
                <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Plus} onClick={() => setDodaj(true)} data-dodaj-grupu="">
                  {t.dodaci.dodajGrupu}
                </Dugme>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* The guest's free note */}
      <div className="grid gap-1 border-t pt-5 [--border:var(--mp-ivica)]">
        <div className="flex items-start justify-between gap-3">
          <Prekidac
            naziv={t.napomena.prekidac}
            opis={t.napomena.opis}
            checked={napomena.vrednost}
            disabled={!mozeUredjivanje}
            onChange={(event) => napomena.promeni(event.target.checked)}
            data-prekidac-napomena=""
          />
          <StanjeKljuca red={red} kljuc={napomena.kljuc} />
        </div>
        <ProblemKljuca red={red} kljuc={napomena.kljuc} />
      </div>

      <UticajGrupeDijalog
        grupa={grupaUticaja}
        artikal={{ id: artikal.id, naziv: artikal.naziv }}
        ucitaj={radnje.uticajGrupe}
        onNastavi={(opseg) => {
          const indeks = detalj.grupe.findIndex((grupa) => grupa.id === uticaj);
          setUticaj(null);
          if (indeks >= 0) setUredi({ indeks, opseg });
        }}
        onZatvori={() => setUticaj(null)}
      />
      <PrimeniNaDruge grupa={grupaPrimene} artikalId={artikal.id} radnje={radnje} onGotovo={najavi} onZatvori={() => setPrimeni(null)} />
      <DodajGrupuDijalog
        otvoreno={dodaj}
        artikal={{ id: artikal.id, naziv: artikal.naziv }}
        naArtiklu={new Set(detalj.grupe.map((grupa) => grupa.id))}
        radnje={radnje}
        onGotovo={najavi}
        onZatvori={() => setDodaj(false)}
      />
    </div>
  );
}

function Varijante({
  varijante,
  artikalId,
  red,
  radnje,
  mozeUredjivanje,
}: {
  varijante: readonly StudioVarijanta[];
  artikalId: string;
  red: AutosaveRed;
  radnje: VarijanteRadnje;
  mozeUredjivanje: boolean;
}) {
  const [nova, setNova] = useState({ naziv: "", cena: "" });
  const [greska, setGreska] = useState<string | null>(null);
  const [radi, setRadi] = useState(false);

  const izvrsi = async (rad: () => Promise<StudioIshod<unknown>>) => {
    setRadi(true);
    const ishod = await red.prati(rad);
    setRadi(false);
    setGreska(poruka(ishod));
    return ishod.ok;
  };

  const dodaj = async () => {
    const naziv = cleanText(nova.naziv);
    const cena = parseCenaUnos(nova.cena);
    if (naziv === "" || naziv.length > MENU_TEXT.variantName) {
      setGreska(naziv === "" ? menuStudioSr.opste.nazivObavezan : fmt(t.osnovno.greske.predugo, { n: MENU_TEXT.variantName }));
      return;
    }
    if (!cena.ok) {
      setGreska(menuStudioSr.cena.greske[cena.greska]);
      return;
    }
    if (await izvrsi(() => radnje.dodajVarijantu(artikalId, naziv, cena.cena))) setNova({ naziv: "", cena: "" });
  };

  return (
    <div className="grid gap-2 pl-0 sm:pl-[3.75rem]" data-varijante="">
      {varijante.length === 0 ? <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.varijante.prazno}</p> : null}
      {varijante.length > 0 ? (
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_7rem_2.75rem] gap-2 text-xs font-semibold text-[var(--mp-tekst-sporedni)]">
          <span>{t.varijante.naziv}</span>
          <span className="text-right">{t.varijante.cenaKolona}</span>
        </div>
      ) : null}
      {varijante.length > 0 ? (
        <ul className="grid gap-2">
          {varijante.map((varijanta, indeks) => (
            <VarijantaRed
              key={varijanta.id}
              varijanta={varijanta}
              redniBroj={indeks + 1}
              onemoguceno={!mozeUredjivanje}
              radi={radi}
              onSacuvaj={(ocekivano, izmena) => izvrsi(() => radnje.izmeniVarijantu(varijanta.id, ocekivano, izmena))}
              onUkloni={() => void izvrsi(() => radnje.obrisiVarijantu(varijanta.id))}
              onGreska={setGreska}
            />
          ))}
        </ul>
      ) : null}
      {mozeUredjivanje ? (
        <div className="grid gap-2 rounded-[var(--mp-radius-kontrola)] bg-[var(--mp-povrsina-utisana)] p-3">
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
            <label className="grid gap-1">
              <span className="text-sm font-semibold">{t.varijante.nova}</span>
              <input
                value={nova.naziv}
                autoComplete="off"
                placeholder={t.varijante.nazivPrimer}
                onChange={(event) => setNova({ ...nova, naziv: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void dodaj();
                  }
                }}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
                data-nova-varijanta=""
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-semibold">{t.osnovno.cena}</span>
              <input
                value={nova.cena}
                inputMode="numeric"
                aria-label={t.varijante.novaCena}
                onChange={(event) => setNova({ ...nova, cena: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void dodaj();
                  }
                }}
                className={cn(POLJE_KLASA, "h-[var(--mp-meta)] text-right tabular-nums")}
              />
            </label>
          </div>
          <span>
            <Dugme vrsta="sekundarno" velicina="kompaktna" ikonica={Plus} ucitava={radi} onClick={() => void dodaj()} data-dodaj-varijantu="">
              {t.varijante.dodaj}
            </Dugme>
          </span>
        </div>
      ) : null}
      {greska ? (
        <p role="alert" className="text-sm font-medium text-[var(--mp-opasnost)]">
          {greska}
        </p>
      ) : null}
    </div>
  );
}

// K34: exported for the render test.
export function VarijantaRed({
  varijanta,
  redniBroj,
  onemoguceno,
  radi,
  onSacuvaj,
  onUkloni,
  onGreska,
}: {
  varijanta: StudioVarijanta;
  redniBroj: number;
  /** The role may not edit: the fields and the button are disabled. */
  onemoguceno: boolean;
  /**
   * K34: a save is running. Leaving a field saves it, so the next field (or the remove button) has just
   * got the focus when this turns true: nothing may turn `disabled` then, or the browser drops the focus
   * to the body. The fields keep taking input (a read-only field would swallow the first keystrokes of
   * a price); a clash with the save in flight is the server's compare-and-set. The remove button
   * ignores clicks (`aria-disabled`) and keeps the focus.
   */
  radi: boolean;
  onSacuvaj: (ocekivano: { naziv?: string; cena?: number | null }, izmena: { naziv?: string; cena?: number | null }) => Promise<boolean>;
  onUkloni: () => void;
  onGreska: (greska: string | null) => void;
}) {
  const [naziv, setNaziv] = useState<string | null>(null);
  const [cena, setCena] = useState<string | null>(null);
  return (
    <li className="grid gap-1" data-varijanta={varijanta.key}>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2">
        <input
          value={naziv ?? varijanta.naziv}
          autoComplete="off"
          disabled={onemoguceno}
          aria-label={fmt(t.varijante.nazivOznaka, { n: redniBroj })}
          onChange={(event) => setNaziv(event.target.value)}
          onBlur={() => {
            if (naziv === null) return;
            const cist = cleanText(naziv);
            setNaziv(null);
            if (cist === varijanta.naziv) return;
            if (cist === "" || cist.length > MENU_TEXT.variantName) {
              onGreska(cist === "" ? menuStudioSr.opste.nazivObavezan : fmt(t.osnovno.greske.predugo, { n: MENU_TEXT.variantName }));
              return;
            }
            void onSacuvaj({ naziv: varijanta.naziv }, { naziv: cist });
          }}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)]")}
        />
        <input
          value={cena ?? formatCenaPolje(varijanta.cena)}
          inputMode="numeric"
          placeholder="—"
          disabled={onemoguceno}
          aria-label={fmt(t.varijante.cenaOznaka, { naziv: varijanta.naziv })}
          title={varijanta.cena === null ? t.varijante.bezCene : undefined}
          onChange={(event) => setCena(event.target.value)}
          onBlur={() => {
            if (cena === null) return;
            const unos = parseCenaUnos(cena);
            setCena(null);
            if (!unos.ok) {
              onGreska(menuStudioSr.cena.greske[unos.greska]);
              return;
            }
            if (unos.cena !== varijanta.cena) void onSacuvaj({ cena: varijanta.cena }, { cena: unos.cena });
          }}
          className={cn(POLJE_KLASA, "h-[var(--mp-meta)] text-right tabular-nums")}
        />
        <IkonicaDugme
          ikonica={Trash2}
          oznaka={fmt(t.varijante.ukloni, { naziv: varijanta.naziv })}
          disabled={onemoguceno}
          aria-disabled={radi || undefined}
          onClick={radi ? undefined : onUkloni}
        />
      </div>
      {varijanta.cena === null ? <p className="text-xs text-[var(--mp-tekst-sporedni)]">{t.varijante.bezCene}</p> : null}
    </li>
  );
}
