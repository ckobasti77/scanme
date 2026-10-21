// ScanMe Menu V1 — the client panel in the izlog (K08): the real shell, the
// real section states and the real whole-screen states, with an invented
// venue and the role and plan from the query string. Links stay inside the
// izlog (the same route with another `sekcija`, the waiter izlog for staff).

import { fixtureVenue } from "@/components/menu/fixtures";
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
import { LokalIzlog } from "./lokal-izlog";
import { PostaIzlog, SabloniIzlog } from "./odgovor-izlog";
import { PodesavanjaRezervacijaIzlog, RezervacijeIzlog } from "./rezervacije-izlog";

const t = menuPanelSr;
/** The optional K25/K26 izlog fields (/dev/menu-editor-preview mounts the panel without them). */
type K25K26 = "rezervacije" | "bezRadnogVremena" | "posta" | "povratak" | "sablon" | "sabloniPrilagodjeni";
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
  } else if (sekcija === "lokal") {
    // K20: the real "Lokal i QR" over the invented restaurant; /dev/menu-lokal-preview has its states.
    sadrzaj = <LokalIzlog params={{ tema, pogled: "lista", stanje: null, fokusPozicija: false, stampa: false }} />;
  } else {
    // K25/K26: the finished reservation and reply blocks stand above the "u pripremi" card until K27/K28 build the rest.
    const iznad =
      sekcija === "funkcionalnosti" ? (
        <RezervacijeIzlog
          rezervacije={rezervacije}
          bezRadnogVremena={bezRadnogVremena}
          radnoVremeHref={radnoVremeIzloga}
        />
      ) : sekcija === "podesavanja" ? (
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
