// ScanMe Menu V1 — the client panel in the izlog (K08): the real shell, the
// real section states and the real whole-screen states, with an invented
// venue and the role and plan from the query string. Links stay inside the
// izlog (the same route with another `sekcija`, the waiter izlog for staff).
// K27: Početna, Operativa, Funkcionalnosti and Lokal i QR are the real
// sections over invented data (`stanje=paznja|mirno`, `ping=poslat`,
// `zahtev=rq_XX`, `filteri=1`); Tim, Analitika and Podešavanja stay "u pripremi".

import { fixtureVenue } from "@/components/menu/fixtures";
import { PodaciLokala } from "@/components/menu/panel/lokal/podaci-lokala";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import {
  izlogHref,
  PANEL_ULOGA_AKTER,
  type EditorPreviewParams,
  type PanelPreviewParams,
} from "@/lib/menu/izlog-params";
import {
  panelNavStavke,
  panelPristup,
  sekcijaVidljiva,
  type PanelNavSekcija,
} from "@/lib/menu/panel-nav";
import { SekcijaUPripremi } from "../panel/sekcija";
import { MenuPanelShell } from "../panel/shell";
import {
  PanelBezPristupa,
  PanelNeaktivan,
  PanelPrijava,
  PanelUcitavanje,
  SekcijaZabranjena,
} from "../panel/stanja-panela";
import { EditorIzlog } from "./editor-izlog";
import { FunkcionalnostiIzlog } from "./funkcionalnosti-izlog";
import { LokalIzlog } from "./lokal-izlog";
import { PostaIzlog, SabloniIzlog } from "./odgovor-izlog";
import { OperativaIzlog } from "./operativa-izlog";
import { PocetnaIzlog } from "./pocetna-izlog";
import { PodesavanjaRezervacijaIzlog } from "./rezervacije-izlog";

const t = menuPanelSr;
/** The optional K25–K27 izlog fields (/dev/menu-editor-preview mounts the panel without them). */
type K25K26 =
  | "rezervacije"
  | "bezRadnogVremena"
  | "posta"
  | "povratak"
  | "sablon"
  | "sabloniPrilagodjeni"
  | "sadrzaj"
  | "pingPoslat"
  | "zahtev"
  | "filteriOtvoreni";
export const PANEL_IZLOG_PUTANJA = "/dev/menu-panel-preview";

export function PanelIzlog({
  params,
  editor,
}: {
  /**
   * `sekcija=primitivi` is the primitives page of the route, not a panel section. The two K25 fields
   * are optional: /dev/menu-editor-preview mounts the panel without them (no reservations there).
   */
  params: Omit<PanelPreviewParams, K25K26> & Partial<Pick<PanelPreviewParams, K25K26>> & { sekcija: PanelNavSekcija };
  /** /dev/menu-editor-preview passes its own editor states. */
  editor?: EditorPreviewParams;
}) {
  const { tema, plan, uloga, sekcija, stanje } = params;
  const rezervacije = params.rezervacije ?? null;
  const bezRadnogVremena = params.bezRadnogVremena ?? false;
  const actor = PANEL_ULOGA_AKTER[uloga];
  // The large editor fixture is the hotel; every other screen shows the restaurant.
  const lokal = fixtureVenue(sekcija === "editor" && editor?.stanje === "veliki" ? "hotel" : "restaurant").name;
  const href = (cilj: PanelNavSekcija) => izlogHref(PANEL_IZLOG_PUTANJA, { sekcija: cilj, uloga, plan, tema });
  const pocetnaIzloga = izlogHref(PANEL_IZLOG_PUTANJA, { tema });
  const konobarIzloga = izlogHref("/dev/menu-konobar-preview", { ekran: "pin", tema });
  // K25: where "Unesi radno vreme" leads: Podešavanja, which then shows the same (empty) hours.
  const radnoVremeIzloga = izlogHref(PANEL_IZLOG_PUTANJA, {
    sekcija: "podesavanja",
    uloga,
    plan,
    "radno-vreme": bezRadnogVremena ? "prazno" : null,
    tema,
  });

  if (stanje === "ucitava") return <PanelUcitavanje />;
  if (stanje === "prijava") return <PanelPrijava prijavaHref={pocetnaIzloga} konobarHref={konobarIzloga} />;
  if (stanje === "neaktivno") return <PanelNeaktivan klijentskiPanelHref={pocetnaIzloga} />;

  const pristup = panelPristup(actor);
  if (stanje === "bez-pristupa" || pristup.vrsta !== "panel") {
    return (
      <PanelBezPristupa
        klijentskiPanelHref={pocetnaIzloga}
        konobarHref={konobarIzloga}
      />
    );
  }

  const ulogaTekst = menuDomenSr.roles[actor];
  let sadrzaj;
  if (!sekcijaVidljiva(actor, sekcija)) {
    sadrzaj = <SekcijaZabranjena naslov={t.sekcije[sekcija]} uloga={ulogaTekst} pocetnaHref={href("pocetna")} />;
  } else if (sekcija === "editor") {
    // K10: the real editor with the invented menu; /dev/menu-editor-preview has its states.
    sadrzaj = (
      <EditorIzlog
        params={
          editor ?? {
            tema,
            empty: false,
            darkDesign: false,
            stanje: null,
            pogled: null,
            plan,
            stariEditor: false,
            fokus: null,
            tab: null,
            paleta: null,
            modal: null,
          }
        }
      />
    );
  } else if (sekcija === "pocetna") {
    // K27: the real Početna over invented data (`stanje=paznja|mirno`); links stay inside the izlog.
    sadrzaj = (
      <PocetnaIzlog
        actor={actor}
        plan={plan}
        sadrzaj={params.sadrzaj ?? "paznja"}
        hrefs={{
          editor: href("editor"),
          operativa: href("operativa"),
          lokal: href("lokal"),
          analitika: href("analitika"),
          podesavanja: href("podesavanja"),
          konobar: konobarIzloga,
        }}
      />
    );
  } else if (sekcija === "operativa") {
    // K27: the real Operativa (read-only overview) over invented data; the ping succeeds locally.
    sadrzaj = (
      <OperativaIzlog
        sadrzaj={params.sadrzaj ?? "paznja"}
        pingPoslat={params.pingPoslat ?? false}
        zahtev={params.zahtev ?? null}
        filteriOtvoreni={params.filteriOtvoreni ?? false}
        konobarHref={konobarIzloga}
      />
    );
  } else if (sekcija === "funkcionalnosti") {
    // K27: the real Funkcionalnosti with the K25 reservation block in it.
    sadrzaj = (
      <FunkcionalnostiIzlog
        plan={plan}
        actor={actor}
        rezervacije={rezervacije}
        bezRadnogVremena={bezRadnogVremena}
        radnoVremeHref={radnoVremeIzloga}
      />
    );
  } else if (sekcija === "lokal") {
    // K20: the real "Lokal i QR" over the invented restaurant; /dev/menu-lokal-preview has its states.
    // K27: with the card "Podaci o lokalu za Menu" under its header.
    const venue = fixtureVenue("restaurant");
    sadrzaj = (
      <LokalIzlog
        params={{ tema, pogled: "lista", stanje: null, fokusPozicija: false, stampa: false }}
        podaciLokala={<PodaciLokala naziv={venue.name} javniLink={`https://scanme.rs/${venue.slug}/meni`} />}
      />
    );
  } else {
    // K26: the finished reply blocks stand above the "u pripremi" card until K28 builds the rest.
    const iznad =
      sekcija === "podesavanja" ? (
        // K26: the venue mailbox and the reply templates (K28 places them in the finished section).
        <div className="grid gap-6">
          <PodesavanjaRezervacijaIzlog bezRadnogVremena={bezRadnogVremena} />
          <PostaIzlog posta={params.posta ?? "nije"} povratak={params.povratak ?? null} />
          <SabloniIzlog prilagodjeni={params.sabloniPrilagodjeni ?? false} sablon={params.sablon ?? null} />
        </div>
      ) : undefined;
    sadrzaj = (
      <SekcijaUPripremi
        sekcija={sekcija}
        plan={plan}
        actor={actor}
        editorHref={sekcijaVidljiva(actor, "editor") ? href("editor") : undefined}
        iznad={iznad}
      />
    );
  }

  return (
    <MenuPanelShell
      key={uloga}
      lokal={lokal}
      rezim={fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes.hospitality })}
      premium={plan === "premium"}
      uloga={ulogaTekst}
      stavke={panelNavStavke(actor, href)}
      aktivna={sekcija}
      klijentskiPanelHref={pocetnaIzloga}
    >
      {sadrzaj}
    </MenuPanelShell>
  );
}
