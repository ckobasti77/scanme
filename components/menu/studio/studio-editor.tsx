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
// K17: `Izgled` — the curated appearance (izgled/izgled-radni-prostor.tsx).
// Its controls take the work area and the preview the rest of the width (no
// page column: the appearance is the same on every page); the preview in
// both modes draws the DRAFT appearance in a real device frame.
// K18: `Objavi` is the full publish dialog (objava/objava-modal.tsx: errors
// lead to the article, warnings need a conscious yes, consequences, a stale
// review is refreshed first), `Verzije` lists previous publications and makes
// a draft from one (verzije/verzije-dijalog.tsx), and presence shows who else
// has an article open (header, row, detail; conflicts name them). The editor
// tells the container what it has open (`onPrisustvo`); the app sends the
// heartbeat, the izlog shows invented colleagues.

import { ChevronDown } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuDesign } from "@/lib/design-engine/menu-tokens";
import { izgledZaPlan } from "@/lib/menu/identity/premium";
import { javniIzgled } from "@/lib/menu/identity/public-tokens";
import { MENU_DEFAULT_PRESENTATION } from "@/lib/menu/presentation";
import { izgledSaCekanjem } from "@/lib/menu/studio/izgled-red";
import { kljucCene } from "@/lib/menu/studio/autosave-queue";
import { zadrziSadrzaj } from "@/lib/menu/studio/deljenje-redova";
import { javniPregled } from "@/lib/menu/studio/javni-pregled";
import type {
  StudioEntitetPrisustva,
  StudioPodaci,
  StudioRadnje,
  StudioRadniSadrzaj,
  StudioRed,
  StudioRsUpozorenje,
} from "@/lib/menu/studio/model";
import { imenaPoArtiklu, osobe } from "@/lib/menu/studio/presence-view";
import type { ProblemArtikla } from "@/lib/menu/studio/publish-view";
import { sadrzajSaCekanjem } from "@/lib/menu/studio/overlay";
import { cn } from "@/lib/utils";
import { useMinutniSat } from "../javni/use-minutni-sat";
import { Dugme } from "../zajednicko/dugme";
import { Fioka } from "../zajednicko/fioka";
import { Kartica } from "../zajednicko/kartica";
import { PraznoStanje, UcitavanjeStanje } from "../zajednicko/stanja";
import { IzgledRadniProstor } from "./izgled/izgled-radni-prostor";
import { miniSadrzaj } from "./izgled/raspored-izbor";
import { DetaljArtikla, type DetaljPocetno } from "./artikal/detalj-artikla";
import { NoviKombo } from "./kombo/novi-kombo";
import { ObjavaModal, type ObjavaPocetno } from "./objava/objava-modal";
import { DrugiNaArtikluKontekst } from "./prisustvo/kontekst";
import { PonudaRadniProstor, type PonudaPocetno, type PonudaRadnje } from "./ponuda/radni-prostor";
import { PregledNacrta, type StudioUredjaj } from "./pregled/pregled-nacrta";
import { PrevodiStranice } from "./prevodi/prevodi-stranice";
import { RsKontekst } from "./room-service/rs-kontekst";
import { RsUpozorenjeDijalog } from "./room-service/rs-upozorenje-dijalog";
import { Segmenti } from "./shell/segmenti";
import { useSirina } from "./shell/use-sirina";
import { StudioZaglavlje, type StudioTab } from "./shell/zaglavlje";
import { useAutosave } from "./status-cuvanja/use-autosave";
import { StraniceKolona, type StraniceRadnje } from "./stranice/stranice-kolona";
import { dodatoTekst, TabelarniUnos } from "./tabelarni-unos/tabelarni-unos";
import { VerzijeDijalog, type VerzijePocetno } from "./verzije/verzije-dijalog";

const t = menuStudioSr;

export type StudioPano = "struktura" | "uredi" | "pregled";

/** K16: which views need data from the container (Room service, translations). */
export type StudioPogled = { roomService: boolean; prevodi: "stranica" | "room-service" | null };

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
  /** K16: the Room service context open (`?kontekst=room-service`, izlog `fokus=room-service`). */
  roomService?: boolean;
  /** K16: the translations view open (izlog `fokus=prevodi`). */
  prevodi?: "stranica" | "room-service";
  /** K16: the Room service price decision open (izlog `fokus=room-service`). */
  rsUpozorenje?: StudioRsUpozorenje;
  /** K18: the publish dialog open with its review loaded (izlog `modal=objava|objava-greske`). */
  objava?: ObjavaPocetno;
  /** K18: the versions dialog open with its list loaded (izlog `modal=verzije`). */
  verzije?: VerzijePocetno;
  /** K18: an inline price already in conflict (izlog `stanje=konflikt`). */
  konflikt?: { artikalId: string; ocekivano: number | null; pokusano: number | null; sacuvano: number | null };
};

const NIKO: readonly string[] = [];

export function StudioEditor({
  podaci,
  radnje: radnjeSpolja,
  izabranaStranica,
  onIzaberiStranicu,
  pocetno = {},
  dizajnPregleda = null,
  otvorenArtikal = null,
  onOtvoriArtikal,
  sada,
  onPogled,
  podesavanjaHref = null,
  onTab,
  onPrisustvo,
  javniMeniHref = null,
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
  /** K16: the container subscribes to Room service and translations only while they are open. */
  onPogled?: (pogled: StudioPogled) => void;
  /** K16: where languages are managed (Podešavanja); null = no link. */
  podesavanjaHref?: string | null;
  /** K17: the mode changed (the app keeps it in the address). */
  onTab?: (tab: StudioTab) => void;
  /** K18: what this person has open (the app's presence heartbeat). */
  onPrisustvo?: (entitet: StudioEntitetPrisustva | null) => void;
  /** K18: where guests open the menu (offered after a publish, new tab); null = no link. */
  javniMeniHref?: string | null;
}) {
  const { kontekst, stranice, status, nedostupni } = podaci;
  const sirina = useSirina();
  // K18: the izlog's `stanje=konflikt` starts with a price in conflict.
  const konfliktNaPocetku = pocetno.konflikt;
  const red = useAutosave(
    konfliktNaPocetku
      ? (novi) =>
          novi.postaviKonflikt(kljucCene(konfliktNaPocetku.artikalId), {
            ocekivano: konfliktNaPocetku.ocekivano,
            pokusano: konfliktNaPocetku.pokusano,
            sacuvano: konfliktNaPocetku.sacuvano,
            posalji: (o, v) => radnjeSpolja.postaviCenu(konfliktNaPocetku.artikalId, o as number | null, v as number | null),
          })
      : undefined,
  );
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
  const [roomService, setRoomService] = useState(Boolean(pocetno.roomService) && kontekst.roomService);
  // K16: the translations view takes the work area; it belongs to the open page or to Room service.
  const [prevodi, setPrevodi] = useState<"stranica" | "room-service" | null>(pocetno.prevodi ?? null);
  const [rsUpozorenje, setRsUpozorenje] = useState<StudioRsUpozorenje | null>(pocetno.rsUpozorenje ?? null);
  const prevodiNaslovId = useId();
  useEffect(() => {
    onPogled?.({ roomService, prevodi });
  }, [onPogled, roomService, prevodi]);
  const [tabela, setTabela] = useState(pocetno.tabela ?? false);
  const [kombo, setKombo] = useState(false);
  const [objava, setObjava] = useState(Boolean(pocetno.objava));
  const [verzijeOtvoreno, setVerzijeOtvoreno] = useState(Boolean(pocetno.verzije));
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
  // K33 (audit C6): every answer of the server brings new objects for every row. A row whose
  // data is the same keeps the object it had, so the `memo` of a row skips it and one saved
  // price redraws one row, not the whole page (lib/menu/studio/deljenje-redova.ts).
  const [deljeno, setDeljeno] = useState({ izvor: podaci.sadrzaj, sadrzaj: podaci.sadrzaj });
  const novoSaServera = deljeno.izvor !== podaci.sadrzaj;
  const sadrzajServera = !novoSaServera
    ? deljeno.sadrzaj
    : podaci.sadrzaj
      ? zadrziSadrzaj(deljeno.sadrzaj, podaci.sadrzaj)
      : podaci.sadrzaj;
  if (novoSaServera) setDeljeno({ izvor: podaci.sadrzaj, sadrzaj: sadrzajServera });
  // A new map only when the queue changed (lib/menu/studio/autosave-queue.ts).
  const naCekanju = red.naCekanju();
  const sadrzaj = useMemo<StudioRadniSadrzaj | null | undefined>(
    () => (sadrzajServera ? sadrzajSaCekanjem(sadrzajServera, naCekanju) : sadrzajServera),
    [sadrzajServera, naCekanju],
  );
  const javni = useMemo(
    () => (sadrzaj ? javniPregled({ naziv: kontekst.lokal, slug: kontekst.slug }, sadrzaj, nedostupni) : null),
    [sadrzaj, kontekst.lokal, kontekst.slug, nedostupni],
  );
  // The preview is the heaviest part of a redraw (the whole public renderer, memoized on this
  // value): it follows the list a moment later, so typing and saving a price never wait for it.
  const javniOdlozen = useDeferredValue(javni);
  // K17: the draft appearance with the choices still on the way, as guests would get it on this account.
  const izgledServera = podaci.izgled?.vrednosti ?? null;
  const premiumNalog = kontekst.plan === "premium";
  const planIzgleda = podaci.izgled?.plan ?? { extraLayouts: premiumNalog, reducedBranding: premiumNalog };
  const prikazIzgleda = useMemo(
    () => (izgledServera ? izgledSaCekanjem(izgledServera, naCekanju) : null),
    [izgledServera, naCekanju],
  );
  const { extraLayouts, reducedBranding } = planIzgleda;
  const izgledNacrta = useMemo(
    () =>
      javniIzgled(
        izgledZaPlan(prikazIzgleda ?? MENU_DEFAULT_PRESENTATION, { extraLayouts, reducedBranding }),
        dizajnPregleda?.colors ?? null,
      ),
    [prikazIzgleda, extraLayouts, reducedBranding, dizajnPregleda],
  );
  const mini = useMemo(
    () =>
      miniSadrzaj(
        (sadrzaj?.sekcije ?? []).map((sekcija) => ({
          naziv: sekcija.naziv,
          redovi: sekcija.redovi.filter((r) => !r.sakriven).map((r) => ({ naziv: r.artikal.naziv, cena: r.artikal.cena })),
        })),
      ),
    [sadrzaj],
  );

  // K18: who else is here; per article for the rows and the open detail.
  const prisutni = podaci.prisustvo;
  const osobeUEditoru = useMemo(() => osobe(prisutni ?? []), [prisutni]);
  const drugiUEditoru = useMemo(() => osobeUEditoru.map((osoba) => osoba.ime), [osobeUEditoru]);
  const uredjuju = useMemo(() => imenaPoArtiklu(prisutni ?? []), [prisutni]);
  const drugiNaOtvorenom = (otvorenArtikal ? uredjuju.get(otvorenArtikal) : undefined) ?? NIKO;
  const entitetVrsta: StudioEntitetPrisustva["vrsta"] | null = otvorenArtikal ? "article" : roomService ? "room_service" : sadrzaj ? "page" : null;
  const entitetKey = otvorenArtikal ?? (roomService ? "room-service" : (sadrzaj?.stranica.key ?? null));
  useEffect(() => {
    onPrisustvo?.(entitetVrsta && entitetKey ? { vrsta: entitetVrsta, key: entitetKey } : null);
  }, [onPrisustvo, entitetVrsta, entitetKey]);

  // K16: a base price saved under a MANUAL Room service price asks at once (master §5.3) —
  // wherever the price was typed (row, detail). The name comes from what the editor shows.
  const naziviArtikala = useRef<(artikalId: string) => string | null>(() => null);
  useLayoutEffect(() => {
    naziviArtikala.current = (artikalId) => {
      if (podaci.detalj?.artikal.id === artikalId) return podaci.detalj.artikal.naziv;
      for (const sekcija of sadrzaj?.sekcije ?? []) {
        for (const r of sekcija.redovi) if (r.artikal.id === artikalId) return r.artikal.naziv;
      }
      return null;
    };
  }, [podaci.detalj, sadrzaj]);
  const radnje = useMemo<StudioRadnje>(
    () => ({
      ...radnjeSpolja,
      postaviCenu: async (artikalId, ocekivana, nova) => {
        const ishod = await radnjeSpolja.postaviCenu(artikalId, ocekivana, nova);
        if (ishod.ok && ishod.vrednost) {
          const upozorenje = ishod.vrednost;
          setRsUpozorenje({ ...upozorenje, naziv: upozorenje.naziv || (naziviArtikala.current(artikalId) ?? "") });
        }
        return ishod;
      },
    }),
    [radnjeSpolja],
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
  // K33: the row actions stay the same functions for the whole session (the rows are memoized
  // on them), whatever else changes `ponudaRadnje` (the page, the languages).
  const onPonovo = useCallback((artikalId: string) => red.pokusajPonovo(kljucCene(artikalId)), [red]);
  const onZadrziMoju = useCallback((artikalId: string) => red.zadrziMoju(kljucCene(artikalId)), [red]);
  const onUzmiSacuvanu = useCallback((artikalId: string) => red.odbaci(kljucCene(artikalId)), [red]);
  const ponudaRadnje = useMemo<PonudaRadnje>(
    () => ({
      onCena,
      onPonovo,
      onZadrziMoju,
      onUzmiSacuvanu,
      dodajSekciju: (naziv) => red.prati(() => radnje.dodajSekciju(aktivnaStranica ?? "", naziv)),
      preimenujSekciju: (id, naziv, ocekivano) => red.prati(() => radnje.preimenujSekciju(id, naziv, ocekivano)),
      obrisiSekciju: (id) => red.prati(() => radnje.obrisiSekciju(id)),
      brziUnos: (sekcijaId, unos, dozvoliDuplikat) => red.prati(() => radnje.brziUnos(sekcijaId, unos, dozvoliDuplikat)),
      dodajPostojeci: (sekcijaId, artikalId) => red.prati(() => radnje.dodajPostojeci(sekcijaId, artikalId)),
      otvoriTabelu: () => setTabela(true),
      otvoriKombo: () => setKombo(true),
      otvoriPrevode: podaci.jezici && podaci.jezici.prevodi.length > 0 ? () => setPrevodi("stranica") : undefined,
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
    [red, radnje, onCena, onPonovo, onZadrziMoju, onUzmiSacuvanu, aktivnaStranica, podaci.jezici],
  );
  // K34 (REVIZIJA N17): the article detail calls these writes directly; tracked here like the list's,
  // so the save state reads "Čuva se…" while they run and closing the tab warns (use-autosave).
  const radnjeDetalja = useMemo<StudioRadnje>(
    () => ({
      ...radnje,
      ukloniSaStranice: (prikazIds) => red.prati(() => radnje.ukloniSaStranice(prikazIds)),
      dodajPostojeci: (sekcijaId, artikalId) => red.prati(() => radnje.dodajPostojeci(sekcijaId, artikalId)),
      premestiPrikaz: (prikazId, uSekciju, prePrikaza) => red.prati(() => radnje.premestiPrikaz(prikazId, uSekciju, prePrikaza)),
      primeniGrupuNa: (grupaId, artikalIds) => red.prati(() => radnje.primeniGrupuNa(grupaId, artikalIds)),
      zadrziCenuKomboa: (artikalId) => red.prati(() => radnje.zadrziCenuKomboa(artikalId)),
      postaviSastav: (artikalId, sastav) => red.prati(() => radnje.postaviSastav(artikalId, sastav)),
    }),
    [red, radnje],
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
  const onVerzije = useCallback(() => radnje.verzije(), [radnje]);
  const onVratiVerziju = useCallback(
    (broj: number, revizija: number) => red.prati(() => radnje.vratiVerziju(broj, revizija)),
    [red, radnje],
  );
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

  // K18: an error or warning of the publish dialog leads to its article: on a page that shows
  // it (the default page first), its variants open when the issue is there.
  const idiNaArtikal = (problem: ProblemArtikla, greska: boolean) => {
    setPonudaPocetno(undefined);
    povratak.current = null;
    setRoomService(false);
    setPrevodi(null);
    if (tab !== "ponuda") {
      setTab("ponuda");
      onTab?.("ponuda");
    }
    setStrukturaOtvorena(false);
    setPregledOtvoren(false);
    if (sirina === "telefon") setPano("uredi");
    const kljuc = problem.cilj?.stranicaKey;
    const stranica = kljuc ? stranice?.find((s) => s.key === kljuc && !s.arhivirana) : undefined;
    if (stranica && stranica.id !== aktivnaStranica) onIzaberiStranicu(stranica.id);
    setIzvorPrikaz(null);
    setDetaljPocetno({
      ...(problem.uVarijantama ? { otvoreneGrupe: ["varijante"] as const } : {}),
      problemi: { kodovi: problem.kodovi, greska },
    });
    onOtvoriArtikal?.(problem.artikalKey);
  };
  const otvoriPrevodeIzObjave =
    podaci.jezici && podaci.jezici.prevodi.length > 0
      ? () => {
          if (otvorenArtikal) onOtvoriArtikal?.(null);
          setRoomService(false);
          if (tab !== "ponuda") {
            setTab("ponuda");
            onTab?.("ponuda");
          }
          setPrevodi("stranica");
          if (sirina === "telefon") setPano("uredi");
        }
      : null;
  // K18: the header's "Idi na izbor" — to the first conflict box, on the pane that shows it.
  const idiNaKonflikt = () => {
    if (sirina === "telefon" && pano !== "uredi") setPano("uredi");
    setStrukturaOtvorena(false);
    requestAnimationFrame(() => {
      const okvir = document.querySelector<HTMLElement>("[data-konflikt]");
      okvir?.scrollIntoView({ block: "center", behavior: "instant" });
      okvir?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  };
  const pregledNacrta = () => {
    if (sirina === "telefon") setPano("pregled");
    else setPregledOtvoren(true);
  };

  const izaberiStranicu = (id: string) => {
    setPonudaPocetno(undefined);
    povratak.current = null;
    if (otvorenArtikal) onOtvoriArtikal?.(null);
    setRoomService(false);
    setPrevodi(null);
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
        if (otvorenArtikal) onOtvoriArtikal?.(null);
        setPrevodi(null);
        setRoomService(true);
        setTab("ponuda");
        setStrukturaOtvorena(false);
        if (sirina === "telefon") setPano("uredi");
      }}
    />
  ) : (
    <UcitavanjeStanje oblik="lista" redova={3} />
  );

  const nazivStraniceRada = sadrzaj?.stranica.naziv ?? "";
  let rad: ReactNode;
  if (tab === "izgled") {
    rad = (
      <IzgledRadniProstor
        izgled={podaci.izgled}
        prikaz={prikazIzgleda}
        javni={prikazIzgleda ? izgledNacrta : null}
        mini={mini}
        radnje={radnje}
        red={red}
        mozeUredjivanje={mozeUredjivanje}
        naslovId={naslovId}
        lokal={kontekst.lokal}
        slug={kontekst.slug}
      />
    );
  } else if (prevodi !== null && podaci.jezici) {
    rad = (
      <PrevodiStranice
        pogled={podaci.prevodi}
        jezici={podaci.jezici}
        radnje={radnje}
        red={red}
        mozeUredjivanje={mozeUredjivanje}
        naslovId={prevodiNaslovId}
        nazadNa={prevodi === "room-service" ? t.stranice.roomService : nazivStraniceRada}
        onNazad={() => setPrevodi(null)}
        najavi={setNajava}
        podesavanjaHref={podesavanjaHref ?? undefined}
      />
    );
  } else if (roomService && kontekst.roomService) {
    rad = (
      <RsKontekst
        rs={podaci.roomServicePodaci}
        radnje={radnje}
        red={red}
        mozeUredjivanje={mozeUredjivanje}
        naslovId={naslovId}
        telefon={sirina === "telefon"}
        najavi={setNajava}
        onUpozorenje={setRsUpozorenje}
        onPrevodi={podaci.jezici && podaci.jezici.prevodi.length > 0 ? () => setPrevodi("room-service") : undefined}
      />
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
        uredjuju={uredjuju}
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
          <DrugiNaArtikluKontekst.Provider value={drugiNaOtvorenom}>
          <DetaljArtikla
            key={otvorenArtikal}
            detalj={podaci.detalj}
            sadrzaj={sadrzaj}
            izvorPrikazId={izvorPrikaz}
            stranice={stranice ?? []}
            nedostupni={nedostupni}
            kontekst={kontekst}
            red={red}
            radnje={radnjeDetalja}
            naslovId={detaljNaslovId}
            pocetno={detaljPocetno}
            sada={sadaSat}
            onNazad={zatvoriArtikal}
            najavi={setNajava}
            jezici={podaci.jezici}
            podesavanjaHref={podesavanjaHref}
            onObjavi={kontekst.mozeObjavu ? () => setObjava(true) : null}
          />
          </DrugiNaArtikluKontekst.Provider>
        </>
      );
  }

  const nazivStranice = sadrzaj?.stranica.naziv ?? "";
  const pregled = (visina: "kolona" | "preklop" | "pano" | "izgled", naslov = true) => (
    <PregledNacrta
      onUvecaj={visina === "kolona" || visina === "izgled" ? () => setPregledOtvoren(true) : undefined}
      pregled={javniOdlozen && javniOdlozen.view.sekcije.length > 0 ? javniOdlozen : null}
      naziv={nazivStranice}
      izgled={izgledNacrta}
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
        onTab?.(sledeci);
        if (sirina === "telefon" && pano === "struktura" && sledeci === "izgled") setPano("uredi");
      }}
      panelId={panelId}
      cuvanje={red.zbir()}
      status={status}
      povezano={podaci.povezano}
      mozeObjavu={kontekst.mozeObjavu}
      prikaziPregled={sirina !== "telefon"}
      onPonovo={red.zbir().neuspelo > red.brojKonflikata() ? () => red.pokusajPonovo() : undefined}
      onPregled={() => setPregledOtvoren(true)}
      onObjavi={() => setObjava(true)}
      onVerzije={status?.objavljenaVerzija != null ? () => setVerzijeOtvoreno(true) : null}
      prisutni={osobeUEditoru}
      sada={sada}
      onIdiNaKonflikt={red.brojKonflikata() > 0 && red.zbir().neuspelo === red.brojKonflikata() ? idiNaKonflikt : null}
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
      <RsUpozorenjeDijalog
        upozorenje={rsUpozorenje}
        onZatvori={() => setRsUpozorenje(null)}
        onResi={(stavkaId, akcija) => red.prati(() => radnje.rsResiUpozorenje(stavkaId, akcija))}
        najavi={setNajava}
      />
      <ObjavaModal
        otvoreno={objava}
        onOtvoreno={setObjava}
        status={status}
        cuvanje={red.zbir()}
        konflikata={red.brojKonflikata()}
        sada={sadaSat}
        onPokusajCuvanje={() => red.pokusajPonovo()}
        nazivArtikla={nazivArtikla}
        onPregled={onPregledObjave}
        onObjavi={onObjavi}
        onIdiNaArtikal={idiNaArtikal}
        onOtvoriPrevode={otvoriPrevodeIzObjave}
        onPregledNacrta={pregledNacrta}
        pocetno={pocetno.objava}
        drugi={drugiUEditoru}
        javniMeniHref={javniMeniHref}
      />
      <VerzijeDijalog
        otvoreno={verzijeOtvoreno}
        onOtvoreno={setVerzijeOtvoreno}
        status={status}
        mozeVracanje={kontekst.mozeObjavu}
        sada={sadaSat}
        onUcitaj={onVerzije}
        onVrati={onVratiVerziju}
        onPregledajIObjavi={() => setObjava(true)}
        pocetno={pocetno.verzije}
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
            <h1 className="sr-only">{prevodi !== null ? t.posebno.prevodi.naslov : roomService ? t.stranice.roomService : tab === "izgled" ? t.izgled.naslov : nazivStranice}</h1>
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
        // K17: a tablet or desktop preview needs room to be read (the frame scales to the overlay's width).
        className={
          uredjaj !== "telefon"
            ? "w-[min(84rem,96vw)] sm:max-w-[84rem]"
            : sirina === "desktop"
              ? "w-[min(40rem,94vw)] sm:max-w-[40rem]"
              : "w-[min(26rem,94vw)] sm:max-w-[26rem]"
        }
      >
        {pregled("preklop", false)}
      </Fioka>
    ) : null;

  // K17: Izgled is the same on every page — no page column; the preview takes the rest of the width.
  const izgledTab = tab === "izgled";
  return (
    <div className="grid gap-5" data-studio={sirina}>
      {zaglavljeOkvir(zaglavlje)}
      {samoCitanje}
      <div
        className={cn(
          "grid items-start gap-5",
          !izgledTab && sirina === "desktop" && "grid-cols-[17rem_minmax(0,1fr)_24rem] gap-6",
          izgledTab && sirina === "desktop" && "grid-cols-[minmax(0,35rem)_minmax(0,1fr)] gap-6",
          izgledTab && sirina === "siroko" && "grid-cols-[minmax(0,1fr)_21rem]",
        )}
      >
        {/* K34 (master §13.4): a tablet (768–1279 px) keeps the structure in the drawer; only the desktop has the column. */}
        {sirina !== "desktop" || izgledTab ? null : (
          <aside className="sticky top-36 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-3 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)]">
            {struktura}
          </aside>
        )}
        <div id={panelId} role="tabpanel" aria-labelledby={`studio-tab-${tab}`} className="grid min-w-0 gap-4">
          {sirina !== "desktop" && !izgledTab ? (
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
        {sirina === "desktop" || (izgledTab && sirina === "siroko") ? (
          <aside className="sticky top-36 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 [--border:var(--mp-ivica)] shadow-[var(--mp-senka-xs)]">
            {pregled(izgledTab ? "izgled" : "kolona")}
          </aside>
        ) : null}
      </div>
      {prekrivniPregled}
      {dijalozi}
    </div>
  );
}
