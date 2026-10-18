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

const t = menuPanelSr;
export const PANEL_IZLOG_PUTANJA = "/dev/menu-panel-preview";

export function PanelIzlog({
  params,
  editor,
}: {
  /** `sekcija=primitivi` is the primitives page of the route, not a panel section. */
  params: PanelPreviewParams & { sekcija: PanelNavSekcija };
  /** /dev/menu-editor-preview passes its own editor states. */
  editor?: EditorPreviewParams;
}) {
  const { tema, plan, uloga, sekcija, stanje } = params;
  const actor = PANEL_ULOGA_AKTER[uloga];
  // The large editor fixture is the hotel; every other screen shows the restaurant.
  const lokal = fixtureVenue(sekcija === "editor" && editor?.stanje === "veliki" ? "hotel" : "restaurant").name;
  const href = (cilj: PanelNavSekcija) => izlogHref(PANEL_IZLOG_PUTANJA, { sekcija: cilj, uloga, plan, tema });
  const pocetnaIzloga = izlogHref(PANEL_IZLOG_PUTANJA, { tema });
  const konobarIzloga = izlogHref("/dev/menu-konobar-preview", { ekran: "pin", tema });

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
          }
        }
      />
    );
  } else {
    sadrzaj = (
      <SekcijaUPripremi
        sekcija={sekcija}
        plan={plan}
        actor={actor}
        editorHref={sekcijaVidljiva(actor, "editor") ? href("editor") : undefined}
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
