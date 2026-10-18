"use client";

// ScanMe Menu V1 — the work area of `Ponuda` (K10, K11; master §13.4): the
// sections and articles of the open page, a search over them, `+ Dodaj` with
// exactly three choices (artikal, sekcija, kombo) and the quieter table entry.
// Adding a page is not here: it belongs to the page column.
// K11 adds the order and the group work, without weighing on the default view:
//   - dragging (mouse; a long press on touch) of sections and articles, also
//     between sections; `Premesti` as the keyboard way; a move shows at once
//     and goes back if it is not saved;
//   - the states of an article from its row menu: `Privremeno nedostupno`
//     (live at once, confirmed the first time), `Sakrij` / `Ukloni sa ove
//     stranice` (draft), `Obriši artikal` (after the consequences);
//   - `Izaberi više`: a mode with checkboxes and a bar of group actions.
// K15: a click on a card (or "Uredi artikal") opens the article detail.
// Every result is announced (aria-live) and shown in one line above the list.

import { FilePlus2, LayoutList, ListChecks, ListPlus, MoreHorizontal, Package, Plus, Rows3, Search, X } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { CenaArtikla } from "@/lib/menu/bulk-price";
import { MENU_TEXT } from "@/lib/menu/limits";
import {
  planNaMesto,
  planSekcije,
  postaviNaMesto,
  pozicijaPrikaza,
  primeniPremestanje,
  primeniPremestanjeSekcije,
  rasporedIz,
  type PlanPremestanja,
} from "@/lib/menu/reorder";
import type { AutosaveRed } from "@/lib/menu/studio/autosave-queue";
import type {
  BrziUnosRezultat,
  StudioIshod,
  StudioRadnje,
  StudioRadniSadrzaj,
  StudioRed,
  StudioSekcija,
} from "@/lib/menu/studio/model";
import { artikliIzbora, izabraniRedovi, ocistiIzbor, prebaciIzbor, prebaciSekciju } from "@/lib/menu/studio/selection";
import { foldSerbian } from "@/lib/menu/text";
import { cn } from "@/lib/utils";
import { Dugme, IkonicaDugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { PraznoStanje } from "../../zajednicko/stanja";
import { StudioDijalog } from "../dijalog";
import { PonudaDnd } from "../dnd/ponuda-dnd";
import { BrisanjeDijalog } from "../izaberi-vise/brisanje-dijalog";
import { CeneDijalog, type CenePocetno } from "../izaberi-vise/cene-dijalog";
import { RasporedDijalog, type RasporedVrsta } from "../izaberi-vise/raspored-dijalog";
import { TrakaIzbora, type RadnjaIzbora } from "../izaberi-vise/traka-izbora";
import { MeniRadnji } from "../meni-radnji";
import { NazivPolje } from "../naziv-polje";
import { PremestiDijalog, type PremestiCilj } from "../premesti/premesti-dijalog";
import { porukaGreske, type RadnjaReda, type RedRadnje } from "../red-artikla/red-artikla";
import { SekcijaBlok } from "./sekcija-blok";

const t = menuStudioSr;

/** Sections longer than this start collapsed (K01 §8 K09). */
export const STUDIO_SKUPLJENO_PREKO = 60;

type K11Radnje =
  | "premestiPrikaz"
  | "premestiSekciju"
  | "postaviDostupnost"
  | "postaviVidljivost"
  | "ukloniSaStranice"
  | "premestiUSekciju"
  | "dodajNaStranicu"
  | "sekcijeStranice"
  | "postaviCene"
  | "uticajBrisanja"
  | "obrisiArtikle";

export type PonudaRadnje = RedRadnje &
  Pick<StudioRadnje, K11Radnje> & {
    dodajSekciju: (naziv: string) => Promise<StudioIshod<{ id: string }>>;
    preimenujSekciju: (sekcijaId: string, naziv: string, ocekivano: string) => Promise<StudioIshod>;
    obrisiSekciju: (sekcijaId: string) => Promise<StudioIshod>;
    brziUnos: (
      sekcijaId: string,
      unos: { naziv: string; cena: number | null },
      dozvoliDuplikat: boolean,
    ) => Promise<StudioIshod<BrziUnosRezultat>>;
    dodajPostojeci: (sekcijaId: string, artikalId: string) => Promise<StudioIshod>;
    otvoriTabelu: () => void;
    otvoriKombo: () => void;
  };

/** What the izlog opens with (`stanje=izaberi-vise`). */
export type PonudaPocetno = { izbor?: readonly string[]; cene?: CenePocetno };

type Obavestenje = { ton: "info" | "greska"; tekst: string } | null;

function mnozina(grupa: { one: string; few: string; many: string }, n: number, vrednosti: Record<string, string | number> = {}) {
  return fmt(grupa[srPluralCategory(n)], { n, ...vrednosti });
}

function tekstNeuspeha(ishod: StudioIshod<unknown>): string {
  if (ishod.ok) return "";
  const tekst = ishod.vrsta === "greska" ? porukaGreske(ishod.kod) : null;
  return tekst ? `${t.red.nijeSacuvano} ${tekst}` : t.red.nijeSacuvano;
}

const css = (vrednost: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(vrednost) : vrednost);

export function PonudaRadniProstor({
  sadrzaj,
  nedostupni,
  red,
  mozeUredjivanje,
  mozeDostupnost = false,
  druge = [],
  dostupnostPotvrdjena = false,
  onDostupnostPotvrdjena,
  pocetno,
  radnje,
  naslovId,
  onOtvoriArtikal,
}: {
  sadrzaj: StudioRadniSadrzaj;
  nedostupni: ReadonlySet<string>;
  red: AutosaveRed;
  mozeUredjivanje: boolean;
  /** menu.availability (live, also when client editing is off). */
  mozeDostupnost?: boolean;
  /** The other active pages ("Dodaj na drugu stranicu"). */
  druge?: readonly { id: string; naziv: string }[];
  /** "Privremeno nedostupno" was already confirmed in this session. */
  dostupnostPotvrdjena?: boolean;
  onDostupnostPotvrdjena?: () => void;
  pocetno?: PonudaPocetno;
  radnje: PonudaRadnje;
  naslovId: string;
  /** K15: a click on a card or "Uredi artikal" opens the detail of that row. */
  onOtvoriArtikal?: (red: StudioRed) => void;
}) {
  const [upit, setUpit] = useState("");
  const odlozeniUpit = useDeferredValue(upit);
  const [skupljene, setSkupljene] = useState<Record<string, boolean>>({});
  const [brziUnosU, setBrziUnosU] = useState<string | null>(null);
  const [novaSekcija, setNovaSekcija] = useState(false);
  const [brisanje, setBrisanje] = useState<StudioSekcija | null>(null);
  const [radi, setRadi] = useState(false);
  const [poruka, setPoruka] = useState<string | null>(null);
  // K11
  const [izborAktivan, setIzborAktivan] = useState(Boolean(pocetno?.izbor));
  const [izabraniSirovo, setIzabrani] = useState<ReadonlySet<string>>(() => new Set(pocetno?.izbor ?? []));
  const [premestanja, setPremestanja] = useState<readonly PlanPremestanja[]>([]);
  const [premestanjaSekcija, setPremestanjaSekcija] = useState<readonly { sekcijaId: string; naIndeks: number }[]>([]);
  const [obavestenje, setObavestenje] = useState<Obavestenje>(null);
  const [premesti, setPremesti] = useState<PremestiCilj | null>(null);
  const [brisanjeArtikala, setBrisanjeArtikala] = useState<{ ids: string[]; naziv: string | null } | null>(null);
  const [ceneOtvoreno, setCeneOtvoreno] = useState(Boolean(pocetno?.cene));
  const [raspored, setRaspored] = useState<RasporedVrsta | null>(null);
  const [potvrdaDostupnosti, setPotvrdaDostupnosti] = useState<string[] | null>(null);
  const [radiGrupno, setRadiGrupno] = useState(false);
  const [osveziFokus, setOsveziFokus] = useState(0);
  const fokusPosle = useRef<{ sekcijaKey: string; artikalKey: string | null; cekaj: boolean } | null>(null);
  const koren = useRef<HTMLDivElement>(null);

  const uredjivo = mozeUredjivanje && !sadrzaj.stranica.arhivirana;
  const dostupnostUredjiva = mozeDostupnost && !sadrzaj.stranica.arhivirana;
  const trazi = foldSerbian(odlozeniUpit.trim());

  // What the screen shows: the server content with the moves not yet confirmed.
  const sekcijePrikaz = useMemo(() => {
    let sekcije: readonly StudioSekcija[] = sadrzaj.sekcije;
    for (const plan of premestanjaSekcija) sekcije = primeniPremestanjeSekcije(sekcije, plan.sekcijaId, plan.naIndeks);
    for (const plan of premestanja) sekcije = primeniPremestanje(sekcije, plan);
    return sekcije;
  }, [sadrzaj.sekcije, premestanja, premestanjaSekcija]);
  const izabrani = useMemo(() => ocistiIzbor(izabraniSirovo, sadrzaj), [izabraniSirovo, sadrzaj]);
  const redoviIzbora = useMemo(() => izabraniRedovi({ ...sadrzaj, sekcije: [...sekcijePrikaz] }, izabrani), [sadrzaj, sekcijePrikaz, izabrani]);
  const artikliIzabranih = useMemo(() => artikliIzbora(redoviIzbora), [redoviIzbora]);

  const pronadjeno = useMemo(() => {
    if (!trazi) return null;
    const mapa = new Map<string, StudioSekcija["redovi"]>();
    let ukupno = 0;
    for (const sekcija of sekcijePrikaz) {
      const redovi = sekcija.redovi.filter((r) => foldSerbian(r.artikal.naziv).includes(trazi));
      if (redovi.length > 0) {
        mapa.set(sekcija.id, redovi);
        ukupno += redovi.length;
      }
    }
    return { mapa, ukupno };
  }, [sekcijePrikaz, trazi]);

  const jeSkupljena = useCallback(
    (sekcija: StudioSekcija) => (pronadjeno ? false : (skupljene[sekcija.id] ?? sekcija.redovi.length > STUDIO_SKUPLJENO_PREKO)),
    [pronadjeno, skupljene],
  );
  const jeSkupljenaId = useCallback(
    (sekcijaId: string) => {
      const sekcija = sekcijePrikaz.find((candidate) => candidate.id === sekcijaId);
      return sekcija ? jeSkupljena(sekcija) : false;
    },
    [sekcijePrikaz, jeSkupljena],
  );

  // Focus goes to the card moved by `Premesti` once the move is on screen.
  useEffect(() => {
    const cilj = fokusPosle.current;
    if (!cilj || cilj.cekaj || !koren.current) return;
    const sekcija = koren.current.querySelector(`[data-sekcija="${css(cilj.sekcijaKey)}"]`);
    const kandidati = cilj.artikalKey
      ? sekcija?.querySelectorAll<HTMLElement>(`[data-artikal="${css(cilj.artikalKey)}"] [data-meni-reda], [data-artikal="${css(cilj.artikalKey)}"] input[data-cena-polje]`)
      : sekcija?.querySelectorAll<HTMLElement>("h2 button");
    const element = [...(kandidati ?? [])].find((candidate) => candidate.offsetParent !== null);
    if (!element) return;
    fokusPosle.current = null;
    requestAnimationFrame(() => element.focus());
  }, [sekcijePrikaz, osveziFokus]);

  // --- moves --------------------------------------------------------------------
  const sacuvajPremestanje = useCallback(
    async (plan: PlanPremestanja): Promise<boolean> => {
      setPremestanja((pre) => [...pre, plan]);
      const ishod = await radnje.premestiPrikaz(plan.prikazId, plan.uSekciju, plan.prePrikaza);
      setPremestanja((pre) => pre.filter((candidate) => candidate !== plan));
      if (!ishod.ok) setObavestenje({ ton: "greska", tekst: `${t.dnd.nijeSacuvano} ${tekstNeuspeha(ishod)}`.trim() });
      return ishod.ok;
    },
    [radnje],
  );
  const sacuvajPremestanjeSekcije = useCallback(
    async (sekcijaId: string, naIndeks: number): Promise<boolean> => {
      const plan = { sekcijaId, naIndeks };
      setPremestanjaSekcija((pre) => [...pre, plan]);
      const ishod = await radnje.premestiSekciju(sekcijaId, naIndeks);
      setPremestanjaSekcija((pre) => pre.filter((candidate) => candidate !== plan));
      if (!ishod.ok) setObavestenje({ ton: "greska", tekst: `${t.dnd.nijeSacuvano} ${tekstNeuspeha(ishod)}`.trim() });
      return ishod.ok;
    },
    [radnje],
  );

  const premestiDijalogom = async (sekcijaId: string, indeks: number): Promise<boolean> => {
    if (!premesti) return false;
    if (premesti.vrsta === "sekcija") {
      const { sekcija } = premesti;
      const naIndeks = planSekcije(
        sekcijePrikaz.map((candidate) => candidate.id),
        sekcija.id,
        indeks,
      );
      if (naIndeks === null) {
        setObavestenje({ ton: "info", tekst: fmt(t.premesti.bezPromene, { naziv: sekcija.naziv }) });
        return true;
      }
      fokusPosle.current = { sekcijaKey: sekcija.key, artikalKey: null, cekaj: true };
      const uspeh = await sacuvajPremestanjeSekcije(sekcija.id, naIndeks);
      if (fokusPosle.current) fokusPosle.current.cekaj = false;
      if (uspeh) {
        setObavestenje({
          ton: "info",
          tekst: fmt(t.premesti.premestenaSekcija, { naziv: sekcija.naziv, mesto: naIndeks + 1, ukupno: sekcijePrikaz.length }),
        });
      } else {
        fokusPosle.current = null;
      }
      setOsveziFokus((broj) => broj + 1);
      return uspeh;
    }
    const { red: pomeren } = premesti;
    const raspored = rasporedIz(sekcijePrikaz);
    const plan = planNaMesto(raspored, pomeren.prikazId, sekcijaId, indeks);
    if (!plan) {
      setObavestenje({ ton: "info", tekst: fmt(t.premesti.bezPromene, { naziv: pomeren.artikal.naziv }) });
      return true;
    }
    const gde = pozicijaPrikaza(postaviNaMesto(raspored, pomeren.prikazId, sekcijaId, indeks), pomeren.prikazId);
    const ciljna = sekcijePrikaz.find((sekcija) => sekcija.id === sekcijaId);
    if (!ciljna || !gde) return false;
    setSkupljene((pre) => ({ ...pre, [ciljna.id]: false }));
    setUpit("");
    fokusPosle.current = { sekcijaKey: ciljna.key, artikalKey: pomeren.artikal.key, cekaj: true };
    const uspeh = await sacuvajPremestanje(plan);
    if (fokusPosle.current) fokusPosle.current.cekaj = false;
    if (uspeh) {
      setObavestenje({
        ton: "info",
        tekst: fmt(t.premesti.premesteno, { naziv: pomeren.artikal.naziv, sekcija: ciljna.naziv, mesto: gde.indeks + 1, ukupno: gde.ukupno }),
      });
    } else {
      fokusPosle.current = null;
    }
    setOsveziFokus((broj) => broj + 1);
    return uspeh;
  };

  // Closed without a move: focus goes back to the card (its menu) or the section title.
  const zatvoriPremesti = () => {
    if (premesti && !fokusPosle.current) {
      const sekcijaId = premesti.vrsta === "red" ? premesti.sekcijaId : premesti.sekcija.id;
      const sekcijaKey = sekcijePrikaz.find((sekcija) => sekcija.id === sekcijaId)?.key;
      if (sekcijaKey) {
        fokusPosle.current = { sekcijaKey, artikalKey: premesti.vrsta === "red" ? premesti.red.artikal.key : null, cekaj: false };
        setOsveziFokus((broj) => broj + 1);
      }
    }
    setPremesti(null);
  };

  // --- states and group actions --------------------------------------------------
  const grupno = async <T,>(rad: () => Promise<StudioIshod<T>>, tekst: (vrednost: T) => string): Promise<string | null> => {
    setRadiGrupno(true);
    const ishod = await rad();
    setRadiGrupno(false);
    if (!ishod.ok) {
      const problem = tekstNeuspeha(ishod);
      setObavestenje({ ton: "greska", tekst: problem });
      return problem;
    }
    setObavestenje({ ton: "info", tekst: tekst(ishod.vrednost) });
    return null;
  };

  const postaviDostupnost = (artikalIds: readonly string[], dostupno: boolean) =>
    grupno(
      () => radnje.postaviDostupnost(artikalIds, dostupno),
      ({ promenjeno }) =>
        promenjeno === 0
          ? t.stanjaArtikla.bezIzmene
          : mnozina(dostupno ? t.stanjaArtikla.najavaDostupno : t.stanjaArtikla.najavaNedostupno, promenjeno),
    );
  const zatraziNedostupno = (artikalIds: string[]) => {
    if (dostupnostPotvrdjena) void postaviDostupnost(artikalIds, false);
    else setPotvrdaDostupnosti(artikalIds);
  };
  const postaviVidljivost = (prikazIds: readonly string[], sakriveno: boolean) =>
    grupno(
      () => radnje.postaviVidljivost(prikazIds, sakriveno),
      ({ promenjeno }) =>
        promenjeno === 0
          ? t.stanjaArtikla.bezIzmene
          : mnozina(sakriveno ? t.stanjaArtikla.najavaSakriveno : t.stanjaArtikla.najavaPrikazano, promenjeno),
    );
  const ukloniSaStranice = (prikazIds: readonly string[]) =>
    grupno(() => radnje.ukloniSaStranice(prikazIds), ({ uklonjeno }) => mnozina(t.stanjaArtikla.najavaUklonjeno, uklonjeno));

  // Rows are memoized: they get one stable callback that runs the latest handler.
  const naRadnjuReda = useRef<(red: StudioRed, sekcijaId: string, radnja: RadnjaReda) => void>(() => undefined);
  useLayoutEffect(() => {
    naRadnjuReda.current = (stavka, sekcijaId, radnja) => {
      if (radnja === "uredi") onOtvoriArtikal?.(stavka);
      else if (radnja === "premesti") setPremesti({ vrsta: "red", red: stavka, sekcijaId });
      else if (radnja === "nedostupno") zatraziNedostupno([stavka.artikal.id]);
      else if (radnja === "dostupno") void postaviDostupnost([stavka.artikal.id], true);
      else if (radnja === "sakrij" || radnja === "prikazi") void postaviVidljivost([stavka.prikazId], radnja === "sakrij");
      else if (radnja === "ukloni") void ukloniSaStranice([stavka.prikazId]);
      else setBrisanjeArtikala({ ids: [stavka.artikal.id], naziv: stavka.artikal.naziv });
    };
  });
  const redRadnje = useMemo<RedRadnje>(
    () => ({
      onCena: radnje.onCena,
      onPonovo: radnje.onPonovo,
      onZadrziMoju: radnje.onZadrziMoju,
      onUzmiSacuvanu: radnje.onUzmiSacuvanu,
      onRadnja: (stavka, sekcijaId, radnja) => naRadnjuReda.current(stavka, sekcijaId, radnja),
      onIzaberi: (prikazId) => setIzabrani((pre) => prebaciIzbor(pre, prikazId)),
    }),
    [radnje.onCena, radnje.onPonovo, radnje.onZadrziMoju, radnje.onUzmiSacuvanu],
  );

  const naRadnjuIzbora = (radnja: RadnjaIzbora) => {
    const artikalIds = artikliIzabranih.map((artikal) => artikal.id);
    const prikazIds = redoviIzbora.map((stavka) => stavka.prikazId);
    if (radnja === "cene") setCeneOtvoreno(true);
    else if (radnja === "nedostupno") zatraziNedostupno(artikalIds);
    else if (radnja === "dostupno") void postaviDostupnost(artikalIds, true);
    else if (radnja === "premesti" || radnja === "dodaj" || radnja === "ukloni") setRaspored(radnja);
    else if (radnja === "sakrij" || radnja === "prikazi") void postaviVidljivost(prikazIds, radnja === "sakrij");
    else setBrisanjeArtikala({ ids: artikalIds, naziv: artikliIzabranih.length === 1 ? artikliIzabranih[0].naziv : null });
  };

  const zavrsiIzbor = () => {
    setIzborAktivan(false);
    setIzabrani(new Set());
  };

  const naTaster = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || !izborAktivan) return;
    const meta = event.target as HTMLElement;
    if (meta.closest?.('[role="dialog"], [role="menu"], input, textarea, select')) return;
    zavrsiIzbor();
  };

  const dodajArtikal = () => {
    const prva = sadrzaj.sekcije[0];
    if (!prva) {
      setNovaSekcija(true);
      setPoruka(t.ponuda.sekcijaZaArtikal);
      return;
    }
    const cilj = sadrzaj.sekcije.find((s) => s.id === brziUnosU) ?? prva;
    setSkupljene((pre) => ({ ...pre, [cilj.id]: false }));
    setUpit("");
    setBrziUnosU(cilj.id);
  };

  const cenaArtikli = useMemo<CenaArtikla[]>(
    () => artikliIzabranih.map((artikal) => ({ artikalId: artikal.id, naziv: artikal.naziv, cena: artikal.cena, varijante: artikal.varijante })),
    [artikliIzabranih],
  );
  const prevlacenje = uredjivo && !izborAktivan && !pronadjeno;

  return (
    <div ref={koren} className="grid content-start gap-4" data-ponuda="" data-izbor={izborAktivan ? "" : undefined} onKeyDown={naTaster}>
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 id={naslovId} className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] lg:text-[1.75rem]">
            {sadrzaj.stranica.naziv}
          </h1>
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">
            {sadrzaj.stranica.podrazumevana ? t.stranice.podrazumevana : t.ponuda.cenaZajednicka}
          </p>
        </div>
        {uredjivo ? (
          <MeniRadnji
            okidac={<IkonicaDugme ikonica={MoreHorizontal} oznaka={t.ponuda.jos} vrsta="sekundarno" />}
            stavke={[{ kljuc: "tabela", tekst: t.ponuda.brzoVise, ikonica: Rows3, onIzbor: radnje.otvoriTabelu }]}
          />
        ) : null}
      </div>

      {sadrzaj.stranica.arhivirana ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {t.ponuda.arhivirana}
        </p>
      ) : null}
      {sadrzaj.skraceno ? (
        <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm [--border:var(--mp-upozorenje-ivica)] bg-[var(--mp-upozorenje-meko)]">
          {t.ponuda.skraceno}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] basis-full sm:basis-auto sm:flex-1">
          <span className="sr-only">{t.ponuda.pretraga}</span>
          <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 top-3 size-5 text-[var(--mp-tekst-sporedni)]" />
          <input
            type="search"
            value={upit}
            placeholder={t.ponuda.pretraga}
            onChange={(event) => setUpit(event.target.value)}
            className="h-[var(--mp-meta)] w-full rounded-[var(--mp-radius-dugme)] border [--border:var(--mp-ivica-kontrole)] bg-[var(--mp-povrsina)] pl-10 pr-4 text-[0.9375rem] text-[var(--mp-tekst)] placeholder:text-[var(--mp-tekst-sporedni)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mp-fokus)] [&::-webkit-search-cancel-button]:hidden"
          />
        </label>
        {(uredjivo || dostupnostUredjiva) && sadrzaj.sekcije.length > 0 ? (
          <Dugme
            vrsta="sekundarno"
            ikonica={ListChecks}
            aria-pressed={izborAktivan}
            data-izaberi-vise=""
            onClick={() => (izborAktivan ? zavrsiIzbor() : setIzborAktivan(true))}
            className={cn("max-sm:flex-1", izborAktivan && "[--border:var(--mp-mastilo)] bg-[var(--mp-akcent-meko)]")}
          >
            {t.izaberiVise.ukljuci}
          </Dugme>
        ) : null}
        {uredjivo && !izborAktivan ? (
          <MeniRadnji
            okidac={
              <Dugme vrsta="akcent" ikonica={Plus} data-dodaj="" className="max-sm:flex-1">
                {t.ponuda.dodaj}
              </Dugme>
            }
            stavke={[
              { kljuc: "artikal", tekst: t.ponuda.dodajArtikal, opis: t.ponuda.dodajArtikalOpis, ikonica: ListPlus, onIzbor: dodajArtikal },
              { kljuc: "sekcija", tekst: t.ponuda.dodajSekciju, opis: t.ponuda.dodajSekcijuOpis, ikonica: LayoutList, onIzbor: () => setNovaSekcija(true) },
              { kljuc: "kombo", tekst: t.ponuda.dodajKombo, opis: t.ponuda.dodajKomboOpis, ikonica: Package, onIzbor: radnje.otvoriKombo },
            ]}
          />
        ) : null}
      </div>

      <p role="status" className="sr-only">
        {pronadjeno ? fmt(t.ponuda.rezultati[srPluralCategory(pronadjeno.ukupno)], { n: pronadjeno.ukupno }) : ""}
      </p>
      {/* One line for the result of the last action; also read by screen readers. */}
      <p
        role="status"
        aria-live="polite"
        data-obavestenje={obavestenje?.ton ?? ""}
        className={cn(
          obavestenje
            ? "rounded-[var(--mp-radius-kontrola)] border px-3 py-2 text-sm font-medium"
            : "sr-only",
          obavestenje?.ton === "greska" && "[--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)]",
          obavestenje?.ton === "info" && "[--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]",
        )}
      >
        {obavestenje?.tekst ?? ""}
      </p>

      {pronadjeno && pronadjeno.ukupno === 0 ? (
        <Kartica>
          <PraznoStanje
            ikonica={Search}
            naslov={fmt(t.ponuda.nemaRezultata, { upit: odlozeniUpit.trim() })}
            opis={t.ponuda.nemaRezultataOpis}
            akcija={
              <Dugme vrsta="sekundarno" ikonica={X} onClick={() => setUpit("")}>
                {t.ponuda.obrisiPretragu}
              </Dugme>
            }
          />
        </Kartica>
      ) : null}

      {sadrzaj.sekcije.length === 0 && !novaSekcija ? (
        <Kartica>
          <PraznoStanje
            ikonica={FilePlus2}
            naslov={t.ponuda.praznoNaslov}
            opis={t.ponuda.praznoOpis}
            akcija={
              uredjivo ? (
                <>
                  <Dugme vrsta="primarno" ikonica={Plus} onClick={() => setNovaSekcija(true)}>
                    {t.ponuda.prvaSekcija}
                  </Dugme>
                  <Dugme vrsta="tiho" ikonica={Rows3} onClick={radnje.otvoriTabelu}>
                    {t.ponuda.brzoVise}
                  </Dugme>
                </>
              ) : undefined
            }
          />
        </Kartica>
      ) : null}

      <PonudaDnd
        sekcije={sekcijePrikaz}
        jeSkupljena={jeSkupljenaId}
        onPremestiRed={(plan) => void sacuvajPremestanje(plan)}
        onPremestiSekciju={(sekcijaId, naIndeks) => void sacuvajPremestanjeSekcije(sekcijaId, naIndeks)}
      >
        {(sekcijeTokom, dnd) =>
          (pronadjeno ? sekcijeTokom.filter((s) => pronadjeno.mapa.has(s.id)) : sekcijeTokom).map((sekcija) => (
            <SekcijaBlok
              key={sekcija.id}
              sekcija={sekcija}
              redovi={pronadjeno?.mapa.get(sekcija.id) ?? sekcija.redovi}
              skupljena={jeSkupljena(sekcija)}
              onSkupi={(id, skupljena) => setSkupljene((pre) => ({ ...pre, [id]: skupljena }))}
              nedostupni={nedostupni}
              red={red}
              mozeUredjivanje={uredjivo}
              mozeDostupnost={dostupnostUredjiva}
              redRadnje={redRadnje}
              brziUnosOtvoren={brziUnosU === sekcija.id}
              onBrziUnos={setBrziUnosU}
              onDodaj={radnje.brziUnos}
              onDodajPostojeci={radnje.dodajPostojeci}
              onPreimenuj={radnje.preimenujSekciju}
              onObrisi={setBrisanje}
              onPremesti={(s) => setPremesti({ vrsta: "sekcija", sekcija: s })}
              prevlacenje={prevlacenje}
              sekcijaSePrevlaci={dnd.aktivno?.vrsta === "sekcija"}
              cilj={dnd.ciljSekcija === sekcija.id}
              izborAktivan={izborAktivan}
              izabrani={izabrani}
              onIzaberiSekciju={(prikazIds) => setIzabrani((pre) => prebaciSekciju(pre, prikazIds))}
            />
          ))
        }
      </PonudaDnd>

      {novaSekcija && uredjivo ? (
        <Kartica as="section" aria-label={t.ponuda.novaSekcijaNaslov}>
          <NazivPolje
            pocetno=""
            oznaka={t.ponuda.novaSekcijaNaziv}
            primer={t.ponuda.novaSekcijaPrimer}
            potvrda={t.ponuda.novaSekcijaDodaj}
            otkazi={t.sekcija.otkazi}
            maks={MENU_TEXT.sectionName}
            greskaPrazno={t.opste.nazivObavezan}
            greskaDugo={fmt(t.opste.nazivDug, { n: MENU_TEXT.sectionName })}
            radi={radi}
            onSacuvaj={async (naziv) => {
              setRadi(true);
              const ishod = await radnje.dodajSekciju(naziv);
              setRadi(false);
              if (!ishod.ok) {
                setPoruka(ishod.vrsta === "greska" ? (porukaGreske(ishod.kod) ?? t.red.nijeSacuvano) : t.red.nijeSacuvano);
                return;
              }
              setNovaSekcija(false);
              setPoruka(null);
              setBrziUnosU(ishod.vrednost.id);
            }}
            onOtkazi={() => {
              setNovaSekcija(false);
              setPoruka(null);
            }}
          />
          {poruka ? (
            <p role="status" className="mt-2 text-sm text-[var(--mp-tekst-sporedni)]">
              {poruka}
            </p>
          ) : null}
        </Kartica>
      ) : null}

      {izborAktivan ? (
        <TrakaIzbora
          broj={izabrani.size}
          mozeUredjivanje={uredjivo}
          mozeDostupnost={dostupnostUredjiva}
          radi={radiGrupno}
          onRadnja={naRadnjuIzbora}
          onZavrsi={zavrsiIzbor}
        />
      ) : null}

      <StudioDijalog
        otvoreno={brisanje !== null}
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : setBrisanje(null))}
        naslov={brisanje ? fmt(t.sekcija.potvrdaBrisanjaNaslov, { naziv: brisanje.naziv }) : ""}
        podnozje={
          <>
            <Dugme vrsta="tiho" onClick={() => setBrisanje(null)}>
              {t.sekcija.otkazi}
            </Dugme>
            <Dugme
              vrsta="opasno"
              ucitava={radi}
              onClick={async () => {
                if (!brisanje) return;
                setRadi(true);
                await radnje.obrisiSekciju(brisanje.id);
                setRadi(false);
                setBrisanje(null);
              }}
            >
              {t.sekcija.obrisi}
            </Dugme>
          </>
        }
      >
        <p className="text-[0.9375rem] leading-relaxed">{t.sekcija.potvrdaBrisanjaOpis}</p>
      </StudioDijalog>

      <PremestiDijalog cilj={premesti} sekcije={sekcijePrikaz} onPremesti={premestiDijalogom} onZatvori={zatvoriPremesti} />

      <StudioDijalog
        otvoreno={potvrdaDostupnosti !== null}
        onOtvoreno={(otvoreno) => (otvoreno ? undefined : setPotvrdaDostupnosti(null))}
        naslov={t.stanjaArtikla.potvrdaNaslov}
        podnozje={
          <>
            <Dugme vrsta="tiho" onClick={() => setPotvrdaDostupnosti(null)}>
              {t.stanjaArtikla.otkazi}
            </Dugme>
            <Dugme
              vrsta="primarno"
              ucitava={radiGrupno}
              data-potvrdi-nedostupno=""
              onClick={async () => {
                if (!potvrdaDostupnosti) return;
                onDostupnostPotvrdjena?.();
                await postaviDostupnost(potvrdaDostupnosti, false);
                setPotvrdaDostupnosti(null);
              }}
            >
              {t.stanjaArtikla.potvrdaDugme}
            </Dugme>
          </>
        }
      >
        <p className="text-[0.9375rem] leading-relaxed">{t.stanjaArtikla.potvrdaOpis}</p>
      </StudioDijalog>

      <CeneDijalog
        otvoreno={ceneOtvoreno}
        onOtvoreno={setCeneOtvoreno}
        artikli={cenaArtikli}
        pocetno={pocetno?.cene ?? null}
        onPrimeni={(izmene) => radnje.postaviCene(izmene)}
        onGotovo={(broj) => {
          setCeneOtvoreno(false);
          setObavestenje({ ton: "info", tekst: mnozina(t.cene.najava, broj) });
        }}
      />

      <RasporedDijalog
        vrsta={raspored}
        broj={redoviIzbora.length}
        sekcije={sekcijePrikaz.map((sekcija) => ({ id: sekcija.id, naziv: sekcija.naziv }))}
        stranice={druge}
        ucitajSekcije={radnje.sekcijeStranice}
        onPremesti={(sekcijaId) => {
          const naziv = sekcijePrikaz.find((sekcija) => sekcija.id === sekcijaId)?.naziv ?? "";
          return grupno(
            () => radnje.premestiUSekciju(redoviIzbora.map((stavka) => stavka.prikazId), sekcijaId),
            ({ premesteno, preskoceno }) =>
              [mnozina(t.stanjaArtikla.najavaPremesteno, premesteno, { sekcija: naziv }), preskoceno > 0 ? mnozina(t.stanjaArtikla.preskoceno, preskoceno) : ""]
                .filter(Boolean)
                .join(" "),
          );
        }}
        onDodaj={(sekcijaId, stranica) =>
          grupno(
            () => radnje.dodajNaStranicu(artikliIzabranih.map((artikal) => artikal.id), sekcijaId),
            ({ dodato, preskoceno }) =>
              [mnozina(t.stanjaArtikla.najavaDodato, dodato, { stranica }), preskoceno > 0 ? mnozina(t.stanjaArtikla.preskoceno, preskoceno) : ""]
                .filter(Boolean)
                .join(" "),
          )
        }
        onUkloni={() => ukloniSaStranice(redoviIzbora.map((stavka) => stavka.prikazId))}
        onZatvori={() => setRaspored(null)}
      />

      <BrisanjeDijalog
        artikalIds={brisanjeArtikala?.ids ?? null}
        nazivJednog={brisanjeArtikala?.naziv ?? null}
        ucitajUticaj={radnje.uticajBrisanja}
        onObrisi={radnje.obrisiArtikle}
        onGotovo={(broj) => {
          setBrisanjeArtikala(null);
          setObavestenje({ ton: "info", tekst: mnozina(t.stanjaArtikla.najavaObrisano, broj) });
        }}
        onZatvori={() => setBrisanjeArtikala(null)}
      />
    </div>
  );
}
