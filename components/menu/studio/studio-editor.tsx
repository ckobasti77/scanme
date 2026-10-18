"use client";

// ScanMe Menu V1 — the editor (K10; master §13.4, docs/meni/planovi/K09.md).
// Presentational: data comes in as StudioPodaci, every change goes out through
// StudioRadnje (Convex in the app, memory in the izlog). This component owns
// only UI state: the mode (`Ponuda` / `Izgled`), the phone pane, overlays and
// the save queue. Layout by window width (MENU-UX §8):
//   ≥ 1280 structure | work | live preview
//   1024–1279 structure | work, preview as an overlay
//   768–1023 work, structure in a drawer, preview as an overlay
//   < 768 `Struktura / Uredi / Pregled`
// K15: a click on an article opens its detail IN the work area (no new tab or
// section); the list stays mounted (hidden), so search, collapsed sections and
// the selection survive, and `Nazad` returns to the same scroll position with
// the focus on the row.

import { BedDouble, ChevronDown, Palette } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuDesign } from "@/lib/design-engine/menu-tokens";
import { kljucCene } from "@/lib/menu/studio/autosave-queue";
import { javniPregled } from "@/lib/menu/studio/javni-pregled";
import type { StudioPodaci, StudioRadnje, StudioRadniSadrzaj, StudioRed } from "@/lib/menu/studio/model";
import { sadrzajSaCekanjem } from "@/lib/menu/studio/overlay";
import { cn } from "@/lib/utils";
import { useMinutniSat } from "../javni/use-minutni-sat";
import { Dugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import { Kartica } from "../zajednicko/kartica";
import { PraznoStanje, UcitavanjeStanje } from "../zajednicko/stanja";
import { DetaljArtikla, type DetaljPocetno } from "./artikal/detalj-artikla";
import { NoviKombo } from "./kombo/novi-kombo";
import { ObjavaDijalog } from "./objava/objava-dijalog";
import { PonudaRadniProstor, type PonudaPocetno, type PonudaRadnje } from "./ponuda/radni-prostor";
import { PregledNacrta, type StudioUredjaj } from "./pregled/pregled-nacrta";
import { Segmenti } from "./shell/segmenti";
import { useSirina } from "./shell/use-sirina";
import { StudioZaglavlje, type StudioTab } from "./shell/zaglavlje";
import { useAutosave } from "./status-cuvanja/use-autosave";
import { StraniceKolona, type StraniceRadnje } from "./stranice/stranice-kolona";
import { dodatoTekst, TabelarniUnos } from "./tabelarni-unos/tabelarni-unos";

const t = menuStudioSr;

export type StudioPano = "struktura" | "uredi" | "pregled";

export type StudioPocetno = {
  tab?: StudioTab;
  pano?: StudioPano;
  /** Opens the structure drawer or the preview overlay on the narrower layouts (izlog `pogled`). */
  preklop?: "struktura" | "pregled";
  tabela?: boolean;
  /** K11: `Izaberi više` on with these rows selected, and the price dialog (izlog `stanje=izaberi-vise`). */
  ponuda?: PonudaPocetno;
  /** K15: the open detail (izlog `fokus=artikal|varijante`) and the row it is shown from. */
  detalj?: DetaljPocetno & { izvorPrikaz?: string };
};

export function StudioEditor({
  podaci,
  radnje,
  izabranaStranica,
  onIzaberiStranicu,
  pocetno = {},
  dizajnPregleda = null,
  otvorenArtikal = null,
  onOtvoriArtikal,
  sada,
}: {
  podaci: StudioPodaci;
  radnje: StudioRadnje;
  /** The open page (null = the default page). */
  izabranaStranica: string | null;
  onIzaberiStranicu: (id: string) => void;
  pocetno?: StudioPocetno;
  /** The izlog's `design=dark`: the dark colours for the preview. */
  dizajnPregleda?: MenuDesign | null;
  /** K15: the key of the article whose detail is open (null = the list). */
  otvorenArtikal?: string | null;
  /** K15: open (a key) or close (null) the detail; the container loads its data. */
  onOtvoriArtikal?: (artikalKey: string | null) => void;
  /** K15: a fixed instant (the izlog); without it the editor follows the clock by the minute. */
  sada?: number;
}) {
  const { kontekst, stranice, status, nedostupni } = podaci;
  const sirina = useSirina();
  const red = useAutosave();
  const panelId = useId();
  const naslovId = useId();
  const detaljNaslovId = useId();
  const sadaSat = useMinutniSat(sada ?? 0, sada === undefined);
  // K15: the row a detail was opened from, and where the list was, for the way back.
  const [izvorPrikaz, setIzvorPrikaz] = useState<string | null>(pocetno.detalj?.izvorPrikaz ?? null);
  const povratak = useRef<{ y: number; vrh: number | null; prikazId: string | null } | null>(null);
  // The izlog's opening state of the detail holds for the first article only.
  const [detaljPocetno, setDetaljPocetno] = useState(pocetno.detalj);

  const [tab, setTab] = useState<StudioTab>(pocetno.tab ?? "ponuda");
  const [pano, setPano] = useState<StudioPano>(pocetno.pano ?? "uredi");
  const [strukturaOtvorena, setStrukturaOtvorena] = useState(pocetno.preklop === "struktura");
  const [pregledOtvoren, setPregledOtvoren] = useState(pocetno.preklop === "pregled");
  const [uredjaj, setUredjaj] = useState<StudioUredjaj>("telefon");
  const [roomService, setRoomService] = useState(false);
  const [tabela, setTabela] = useState(pocetno.tabela ?? false);
  const [kombo, setKombo] = useState(false);
  const [objava, setObjava] = useState(false);
  const [najava, setNajava] = useState("");
  // K11: "Privremeno nedostupno" is confirmed once per editor session (it goes live at once).
  const [dostupnostPotvrdjena, setDostupnostPotvrdjena] = useState(false);
  // The izlog's opening state of `Ponuda` holds for the first page only.
  const [ponudaPocetno, setPonudaPocetno] = useState(pocetno.ponuda);

  const aktivnaStranica =
    izabranaStranica ??
    stranice?.find((s) => s.podrazumevana && !s.arhivirana)?.id ??
    stranice?.find((s) => !s.arhivirana)?.id ??
    null;
  // A new map only when the queue changed (lib/menu/studio/autosave-queue.ts).
  const naCekanju = red.naCekanju();
  const sadrzaj = useMemo<StudioRadniSadrzaj | null | undefined>(
    () => (podaci.sadrzaj ? sadrzajSaCekanjem(podaci.sadrzaj, naCekanju) : podaci.sadrzaj),
    [podaci.sadrzaj, naCekanju],
  );
  const javni = useMemo(
    () => (sadrzaj ? javniPregled({ naziv: kontekst.lokal, slug: kontekst.slug }, sadrzaj, nedostupni) : null),
    [sadrzaj, kontekst.lokal, kontekst.slug, nedostupni],
  );

  const mozeUredjivanje = kontekst.mozeUredjivanje;
  const rezim = fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes[kontekst.rezim] });

  // --- actions -------------------------------------------------------------
  const onCena = useCallback(
    (artikalId: string, ocekivana: number | null, nova: number | null) =>
      red.zakazi(kljucCene(artikalId), {
        ocekivano: ocekivana,
        vrednost: nova,
        posalji: (o, v) => radnje.postaviCenu(artikalId, o as number | null, v as number | null),
      }),
    [red, radnje],
  );
  const ponudaRadnje = useMemo<PonudaRadnje>(
    () => ({
      onCena,
      onPonovo: (artikalId) => red.pokusajPonovo(kljucCene(artikalId)),
      onZadrziMoju: (artikalId) => red.zadrziMoju(kljucCene(artikalId)),
      onUzmiSacuvanu: (artikalId) => red.odbaci(kljucCene(artikalId)),
      dodajSekciju: (naziv) => red.prati(() => radnje.dodajSekciju(aktivnaStranica ?? "", naziv)),
      preimenujSekciju: (id, naziv, ocekivano) => red.prati(() => radnje.preimenujSekciju(id, naziv, ocekivano)),
      obrisiSekciju: (id) => red.prati(() => radnje.obrisiSekciju(id)),
      brziUnos: (sekcijaId, unos, dozvoliDuplikat) => red.prati(() => radnje.brziUnos(sekcijaId, unos, dozvoliDuplikat)),
      dodajPostojeci: (sekcijaId, artikalId) => red.prati(() => radnje.dodajPostojeci(sekcijaId, artikalId)),
      otvoriTabelu: () => setTabela(true),
      otvoriKombo: () => setKombo(true),
      // K11: order, states and group actions. Writes are tracked by the save status; reads are not.
      premestiPrikaz: (prikazId, uSekciju, prePrikaza) => red.prati(() => radnje.premestiPrikaz(prikazId, uSekciju, prePrikaza)),
      premestiSekciju: (sekcijaId, naIndeks) => red.prati(() => radnje.premestiSekciju(sekcijaId, naIndeks)),
      postaviDostupnost: (artikalIds, dostupno) => red.prati(() => radnje.postaviDostupnost(artikalIds, dostupno)),
      postaviVidljivost: (prikazIds, sakriveno) => red.prati(() => radnje.postaviVidljivost(prikazIds, sakriveno)),
      ukloniSaStranice: (prikazIds) => red.prati(() => radnje.ukloniSaStranice(prikazIds)),
      premestiUSekciju: (prikazIds, sekcijaId) => red.prati(() => radnje.premestiUSekciju(prikazIds, sekcijaId)),
      dodajNaStranicu: (artikalIds, sekcijaId) => red.prati(() => radnje.dodajNaStranicu(artikalIds, sekcijaId)),
      sekcijeStranice: (stranicaId) => radnje.sekcijeStranice(stranicaId),
      postaviCene: (promene) => red.prati(() => radnje.postaviCene(promene)),
      uticajBrisanja: (artikalIds) => radnje.uticajBrisanja(artikalIds),
      obrisiArtikle: (artikalIds, token) => red.prati(() => radnje.obrisiArtikle(artikalIds, token)),
    }),
    [red, radnje, onCena, aktivnaStranica],
  );
  const druge = useMemo(
    () => (stranice ?? []).filter((s) => !s.arhivirana && s.id !== aktivnaStranica).map((s) => ({ id: s.id, naziv: s.naziv })),
    [stranice, aktivnaStranica],
  );
  const straniceRadnje = useMemo<StraniceRadnje>(
    () => ({
      dodaj: (naziv) => red.prati(() => radnje.dodajStranicu(naziv)),
      preimenuj: (id, naziv, ocekivano) => red.prati(() => radnje.preimenujStranicu(id, naziv, ocekivano)),
      dupliraj: (id) => red.prati(() => radnje.duplirajStranicu(id)),
      premesti: (id, naIndeks) => red.prati(() => radnje.premestiStranicu(id, naIndeks)),
      arhiviraj: (id) => red.prati(() => radnje.arhivirajStranicu(id)),
      vrati: (id) => red.prati(() => radnje.vratiStranicu(id)),
      obrisi: (id) => red.prati(() => radnje.obrisiStranicu(id)),
    }),
    [red, radnje],
  );
  const onPregledObjave = useCallback(() => radnje.pregledObjave(), [radnje]);
  const onObjavi = useCallback((revizija: number, potvrda: string | undefined) => red.prati(() => radnje.objavi(revizija, potvrda)), [red, radnje]);
  const nazivArtikla = useCallback(
    (artikalKey: string) => {
      for (const sekcija of sadrzaj?.sekcije ?? []) {
        for (const r of sekcija.redovi) if (r.artikal.key === artikalKey) return r.artikal.naziv;
      }
      return null;
    },
    [sadrzaj],
  );

  const otvoriArtikal = useCallback(
    (stavka: StudioRed) => {
      // Where the row was on screen: the way back puts it there again, even if rows above changed height.
      const vrh = document.querySelector(`[data-meni-reda="${CSS.escape(stavka.prikazId)}"]`)?.closest("[data-red-artikla]")?.getBoundingClientRect().top ?? null;
      povratak.current = { y: window.scrollY, vrh, prikazId: stavka.prikazId };
      setIzvorPrikaz(stavka.prikazId);
      setDetaljPocetno(undefined);
      onOtvoriArtikal?.(stavka.artikal.key);
    },
    [onOtvoriArtikal],
  );
  const zatvoriArtikal = useCallback(() => {
    setDetaljPocetno(undefined);
    onOtvoriArtikal?.(null);
  }, [onOtvoriArtikal]);
  // Opening: the detail starts at its top with the focus on its title. Closing: the list is
  // back where it was, with the focus on the row's menu (or its price), as before the click.
  const bioOtvoren = useRef(otvorenArtikal !== null);
  useLayoutEffect(() => {
    const otvoren = otvorenArtikal !== null;
    if (otvoren === bioOtvoren.current) return;
    bioOtvoren.current = otvoren;
    if (otvoren) {
      // Instant: the app scrolls smoothly by default, which would race the focus and the way back.
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById(detaljNaslovId)?.focus({ preventScroll: true });
      return;
    }
    const nazad = povratak.current;
    povratak.current = null;
    if (!nazad) return;
    window.scrollTo({ top: nazad.y, behavior: "instant" });
    if (!nazad.prikazId) return;
    const meta =
      document.querySelector<HTMLElement>(`[data-meni-reda="${CSS.escape(nazad.prikazId)}"]`) ??
      document.getElementById(`cena-${nazad.prikazId}`);
    meta?.focus({ preventScroll: true });
    // Rows off screen keep an estimated height (content-visibility) until drawn: the row is put
    // back where it was on screen once now and again over the next two frames.
    const kartica = meta?.closest("[data-red-artikla]");
    const vrh = nazad.vrh;
    if (!kartica || vrh === null) return;
    const namesti = () => window.scrollBy({ top: kartica.getBoundingClientRect().top - vrh, behavior: "instant" });
    namesti();
    const okvir = requestAnimationFrame(() => {
      namesti();
      requestAnimationFrame(namesti);
    });
    return () => cancelAnimationFrame(okvir);
  }, [otvorenArtikal, detaljNaslovId]);

  const izaberiStranicu = (id: string) => {
    setPonudaPocetno(undefined);
    povratak.current = null;
    if (otvorenArtikal) onOtvoriArtikal?.(null);
    setRoomService(false);
    setTab("ponuda");
    setStrukturaOtvorena(false);
    if (sirina === "telefon") setPano("uredi");
    onIzaberiStranicu(id);
  };

  // --- regions -------------------------------------------------------------
  const struktura = stranice ? (
    <StraniceKolona
      stranice={stranice}
      izabrana={aktivnaStranica}
      roomService={kontekst.roomService}
      roomServiceIzabran={roomService}
      mozeUredjivanje={mozeUredjivanje}
      radnje={straniceRadnje}
      onIzaberi={izaberiStranicu}
      onRoomService={() => {
        setRoomService(true);
        setTab("ponuda");
        setStrukturaOtvorena(false);
        if (sirina === "telefon") setPano("uredi");
      }}
    />
  ) : (
    <UcitavanjeStanje oblik="lista" redova={3} />
  );

  let rad: ReactNode;
  if (tab === "izgled") {
    rad = (
      <Kartica>
        <h1 id={naslovId} className="sr-only">
          {t.izgled.naslov}
        </h1>
        <PraznoStanje ikonica={Palette} naslov={t.izgled.naslov} opis={t.izgled.opis} />
      </Kartica>
    );
  } else if (roomService) {
    rad = (
      <Kartica>
        <h1 id={naslovId} className="sr-only">
          {t.stranice.roomService}
        </h1>
        <PraznoStanje ikonica={BedDouble} naslov={t.stranice.roomService} opis={t.stranice.roomServiceUskoro} />
      </Kartica>
    );
  } else if (sadrzaj === undefined) {
    rad = <UcitavanjeStanje oblik="lista" redova={6} />;
  } else if (sadrzaj === null) {
    rad = (
      <Kartica>
        <PraznoStanje naslov={t.stanja.greskaNaslov} opis={t.stanja.greskaOpis} />
      </Kartica>
    );
  } else {
    const ponuda = (
      <PonudaRadniProstor
        key={sadrzaj.stranica.id}
        sadrzaj={sadrzaj}
        nedostupni={nedostupni}
        red={red}
        mozeUredjivanje={mozeUredjivanje}
        mozeDostupnost={kontekst.mozeDostupnost}
        druge={druge}
        dostupnostPotvrdjena={dostupnostPotvrdjena}
        onDostupnostPotvrdjena={() => setDostupnostPotvrdjena(true)}
        pocetno={ponudaPocetno}
        radnje={ponudaRadnje}
        naslovId={naslovId}
        onOtvoriArtikal={onOtvoriArtikal ? otvoriArtikal : undefined}
      />
    );
    rad =
      otvorenArtikal === null ? (
        ponuda
      ) : (
        <>
          <div hidden data-lista-ispod-detalja="">
            {ponuda}
          </div>
          <DetaljArtikla
            key={otvorenArtikal}
            detalj={podaci.detalj}
            sadrzaj={sadrzaj}
            izvorPrikazId={izvorPrikaz}
            stranice={stranice ?? []}
            nedostupni={nedostupni}
            kontekst={kontekst}
            red={red}
            radnje={radnje}
            naslovId={detaljNaslovId}
            pocetno={detaljPocetno}
            sada={sadaSat}
            onNazad={zatvoriArtikal}
            najavi={setNajava}
          />
        </>
      );
  }

  const nazivStranice = sadrzaj?.stranica.naziv ?? "";
  const pregled = (visina: "kolona" | "preklop" | "pano", naslov = true) => (
    <PregledNacrta
      pregled={javni && javni.view.sekcije.length > 0 ? javni : null}
      naziv={nazivStranice}
      dizajn={dizajnPregleda}
      uredjaj={uredjaj}
      onUredjaj={setUredjaj}
      naslov={naslov}
      visina={visina}
    />
  );

  const zaglavlje = (
    <StudioZaglavlje
      lokal={kontekst.lokal}
      rezim={rezim}
      sirina={sirina}
      tab={tab}
      onTab={(sledeci) => {
        setTab(sledeci);
        if (sirina === "telefon" && pano === "struktura" && sledeci === "izgled") setPano("uredi");
      }}
      panelId={panelId}
      cuvanje={red.zbir()}
      status={status}
      povezano={podaci.povezano}
      mozeObjavu={kontekst.mozeObjavu}
      prikaziPregled={sirina !== "telefon"}
      onPonovo={() => red.pokusajPonovo()}
      onPregled={() => setPregledOtvoren(true)}
      onObjavi={() => setObjava(true)}
    />
  );

  const sekcijeZaUnos = sadrzaj?.sekcije ?? [];
  const dijalozi = (
    <>
      <TabelarniUnos
        key={`tabela-${aktivnaStranica ?? ""}`}
        otvoreno={tabela}
        onOtvoreno={setTabela}
        sekcije={sekcijeZaUnos}
        podrazumevanaSekcija={sekcijeZaUnos[0]?.id ?? null}
        onPosalji={(redovi) => red.prati(() => radnje.brziUnosVise(aktivnaStranica ?? "", redovi))}
        onDodato={(broj) => setNajava(dodatoTekst(broj))}
      />
      <NoviKombo
        key={`kombo-${aktivnaStranica ?? ""}`}
        otvoreno={kombo}
        onOtvoreno={setKombo}
        sekcije={sekcijeZaUnos}
        podrazumevanaSekcija={sekcijeZaUnos[0]?.id ?? null}
        onDodaj={(sekcijaId, unos) => red.prati(() => radnje.noviKombo(sekcijaId, unos))}
      />
      <ObjavaDijalog
        otvoreno={objava}
        onOtvoreno={setObjava}
        nazivArtikla={nazivArtikla}
        onPregled={onPregledObjave}
        onObjavi={onObjavi}
      />
      <p role="status" aria-live="polite" className="sr-only" data-studio-najava="">
        {najava}
      </p>
    </>
  );

  const samoCitanje = !mozeUredjivanje ? (
    <p role="status" className="rounded-[var(--mp-radius-kontrola)] border px-4 py-3 text-sm [--border:var(--mp-info-ivica)] bg-[var(--mp-info-meko)]">
      {t.zaglavlje.samoCitanje}
    </p>
  ) : null;

  const zaglavljeOkvir = (deca: ReactNode) => (
    <div className="sticky top-16 z-20 -mx-4 border-b bg-[var(--mp-okvir)] px-4 py-3 [--border:var(--mp-ivica)] sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-b-[var(--mp-radius-kartica)] lg:px-0">
      {deca}
    </div>
  );

  // --- phone ---------------------------------------------------------------
  if (sirina === "telefon") {
    const panoi =
      tab === "izgled"
        ? [
            { vrednost: "uredi" as const, tekst: t.panoi.podesavanja },
            { vrednost: "pregled" as const, tekst: t.panoi.pregled },
          ]
        : [
            { vrednost: "struktura" as const, tekst: t.panoi.struktura },
            { vrednost: "uredi" as const, tekst: t.panoi.uredi },
            { vrednost: "pregled" as const, tekst: t.panoi.pregled },
          ];
    const vidljivPano = tab === "izgled" && pano === "struktura" ? "uredi" : pano;
    return (
      <div className="grid gap-4" data-studio="telefon">
        {zaglavljeOkvir(
          <div className="grid gap-3">
            {zaglavlje}
            <Segmenti<StudioPano>
              oznaka={t.panoi.oznaka}
              idPrefiks="studio-pano"
              kontrolise={panelId}
              izabrano={vidljivPano}
              onIzbor={setPano}
              vrednosti={panoi}
              className="flex w-full"
            />
          </div>,
        )}
        {samoCitanje}
        <div id={panelId} role="tabpanel" aria-labelledby={`studio-pano-${vidljivPano}`} data-pano={vidljivPano}>
          {vidljivPano === "uredi" ? null : (
            <h1 className="sr-only">{roomService ? t.stranice.roomService : tab === "izgled" ? t.izgled.naslov : nazivStranice}</h1>
          )}
          {vidljivPano === "struktura" ? struktura : vidljivPano === "pregled" ? pregled("pano") : rad}
        </div>
        {dijalozi}
      </div>
    );
  }

  // --- tablet and desktop ----------------------------------------------------
  const prekrivniPregled =
    sirina !== "desktop" || pregledOtvoren ? (
      <Fioka
        naslov={t.pregled.naslov}
        strana="desno"
        otvoreno={pregledOtvoren}
        onOtvoreno={setPregledOtvoren}
        className={sirina === "desktop" ? "w-[min(40rem,94vw)] sm:max-w-[40rem]" : "w-[min(26rem,94vw)] sm:max-w-[26rem]"}
      >
        {pregled("preklop", false)}
      </Fioka>
    ) : null;

  return (
    <div className="grid gap-5" data-studio={sirina}>
      {zaglavljeOkvir(zaglavlje)}
      {samoCitanje}
      <div
        className={cn(
          "grid items-start gap-5",
          sirina === "desktop" && "grid-cols-[17rem_minmax(0,1fr)_24rem] gap-6",
          sirina === "siroko" && "grid-cols-[16rem_minmax(0,1fr)]",
        )}
      >
        {sirina === "usko" ? null : (
          <aside className="sticky top-36 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-3 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)]">
            {struktura}
          </aside>
        )}
        <div id={panelId} role="tabpanel" aria-labelledby={`studio-tab-${tab}`} className="grid min-w-0 gap-4">
          {sirina === "usko" ? (
            <Fioka
              naslov={t.stranice.naslov}
              strana="levo"
              otvoreno={strukturaOtvorena}
              onOtvoreno={setStrukturaOtvorena}
              okidac={
                <Dugme vrsta="sekundarno" velicina="kompaktna" className="justify-self-start" data-struktura-dugme="">
                  {fmt(t.stranice.otvori, { naziv: roomService ? t.stranice.roomService : nazivStranice })}
                  <ChevronDown aria-hidden="true" strokeWidth={1.75} />
                </Dugme>
              }
            >
              {struktura}
            </Fioka>
          ) : null}
          {rad}
        </div>
        {sirina === "desktop" ? (
          <aside className="sticky top-36 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)]">
            {pregled("kolona")}
          </aside>
        ) : null}
      </div>
      {prekrivniPregled}
      {dijalozi}
    </div>
  );
}
