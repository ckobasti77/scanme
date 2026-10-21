"use client";

// ScanMe Menu V1 (K28) — the screen "Tim i pristupi" of the client panel (master
// §10.6; plan docs/meni/planovi/K24.md §4.6): who works in ScanMe Menu and what each
// role may do. Members first (full width), then the waiter-panel staff beside the
// link of the waiter panel, then what every role may do, and the collapsed
// activity. Every change in the team is live at once. Presentational: the route
// (tim-ruta.tsx) and the izlog pass the data (`podaci`, undefined while it loads)
// and the actions (`radnje`); `pocetniModal` opens one dialog right away.

import { useState } from "react";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { roleCan } from "@/lib/menu/permissions";
import { ulogeZaPoziv } from "@/lib/menu/team-view";
import { Napomena } from "../../lokal/zajednicko";
import { ZaglavljeSaStatusom } from "../../zajednicko/zaglavlje-sa-statusom";
import { Aktivnost } from "./aktivnost";
import { Clanovi, UlogeObjasnjenje } from "./clanovi";
import { LinkPanela } from "./link-panela";
import type { TimProps } from "./model";
import { Osoblje } from "./osoblje";
import { Pozivnica, type PozivnicaPreset } from "./pozivnica";

const t = menuPanelSr.tim;

/** The open "Pozovi člana" dialog; `preset` fills it for a new invitation to the same person. */
type PozivnicaStanje = { preset?: PozivnicaPreset } | null;

export function Tim({ actor, sada, podaci, radnje, pocetniModal = null }: TimProps) {
  const [pozivnica, setPozivnica] = useState<PozivnicaStanje>(() =>
    pocetniModal === "pozivnica" && ulogeZaPoziv(actor).length > 0 ? {} : null,
  );

  return (
    <div className="grid gap-6" data-tim="">
      <ZaglavljeSaStatusom naslov={menuPanelSr.sekcije.tim} opis={t.opis} />
      <Napomena>{t.vaziOdmah}</Napomena>

      <Clanovi
        actor={actor}
        sada={sada}
        clanovi={podaci.clanovi}
        radnje={radnje}
        onPozovi={(preset) => setPozivnica({ preset })}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] xl:items-start">
        <Osoblje
          actor={actor}
          osoblje={podaci.osoblje}
          zone={podaci.zone}
          radnje={radnje}
          pocetniPin={pocetniModal === "pin"}
        />
        <LinkPanela
          link={podaci.link}
          moze={roleCan(actor, "staff.pin")}
          radnje={radnje}
          pocetnoPromeni={pocetniModal === "link-panela"}
        />
      </div>

      <UlogeObjasnjenje />
      <Aktivnost aktivnost={podaci.aktivnost} />

      {pozivnica ? (
        <Pozivnica actor={actor} pozovi={radnje.pozovi} preset={pozivnica.preset} onZatvori={() => setPozivnica(null)} />
      ) : null}
    </div>
  );
}
