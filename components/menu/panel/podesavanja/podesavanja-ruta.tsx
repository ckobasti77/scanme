"use client";

// ScanMe Menu V1 (K28) — the route side of Podešavanja (master §13.9; plan
// docs/meni/planovi/K24.md §4.7). The section is a column of blocks that save
// on their own: working hours and the reservation hold (K25 routes), the
// languages (menuSettings.languages / setLanguages, through the draft), the
// waiter panel's timing (panelTiming / setPanelTiming), the business mailbox
// and the reply templates (K26 routes), and Brend i nalog (read-only: the mode
// is changed only by ScanMe, master §4.1). The layout is presentational
// (podesavanja.tsx); the izlog mounts the same blocks over fixtures.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { panelSekcijaHref } from "@/lib/menu/panel-nav";
import { roleCan } from "@/lib/menu/permissions";
import type { PostaPovratak } from "../../odgovor/model";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { SacuvajIshod } from "../cuvanje";
import { usePanelKontekst } from "../ruta";
import { BrendNalog, zatraziPromenuHref } from "./brend-nalog";
import { Jezici } from "./jezici";
import { PoslovnaPostaRuta, SabloniOdgovoraRuta } from "./posta-ruta";
import { Podesavanja } from "./podesavanja";
import { PragoviPanela } from "./pragovi";
import { RadnoVremeRuta, ZadrzavanjeRuta } from "./rezervacije-podesavanja-ruta";

const t = menuPanelSr.podesavanja;

async function ishod(rad: () => Promise<unknown>): Promise<SacuvajIshod> {
  try {
    await rad();
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error instanceof ConvexError && typeof error.data === "string" ? error.data : "mreza" };
  }
}

export function PodesavanjaRuta({ povratak }: { povratak?: PostaPovratak }) {
  const { slug, actor, plan, menuServiceId, lokal } = usePanelKontekst();
  const { isLoading } = useConvexAuth();
  const args = isLoading ? "skip" : { menuServiceId };
  const kontekst = useQuery(api.menuServices.context, isLoading ? "skip" : { businessSlug: slug });
  const jezici = useQuery(api.menuSettings.languages, args);
  const pragovi = useQuery(api.menuSettings.panelTiming, args);
  const sacuvajJezike = useMutation(api.menuSettings.setLanguages);
  const sacuvajPragove = useMutation(api.menuSettings.setPanelTiming);
  const moze = roleCan(actor, "settings.edit");

  const onJezici = useCallback(
    (translations: string[]) => ishod(() => sacuvajJezike({ menuServiceId, translations })),
    [menuServiceId, sacuvajJezike],
  );
  const onPragovi = useCallback(
    (lateThresholdMin: number, reminderMin: number) =>
      ishod(() => sacuvajPragove({ menuServiceId, lateThresholdMin, reminderMin })),
    [menuServiceId, sacuvajPragove],
  );

  if (kontekst === undefined || jezici === undefined || pragovi === undefined) {
    return <UcitavanjeStanje oblik="forma" oznaka={t.ucitavanje} />;
  }
  if (kontekst === null || jezici === null || pragovi === null) return <GreskaStanje naslov={t.greskaNaslov} />;

  return (
    <Podesavanja
      blokovi={{
        radnoVreme: <RadnoVremeRuta menuServiceId={menuServiceId} nivo={2} />,
        jezici: (
          <Jezici
            prevodi={[...jezici.translations]}
            maxJezika={jezici.maxLanguages}
            plan={plan}
            moze={moze}
            razlog={moze ? undefined : t.nemaPrava}
            onSacuvaj={onJezici}
          />
        ),
        konobar: (
          <PragoviPanela
            prag={pragovi.lateThresholdMin}
            podsetnik={pragovi.reminderMin}
            moze={moze}
            razlog={moze ? undefined : t.nemaPrava}
            onSacuvaj={onPragovi}
          />
        ),
        zadrzavanje: <ZadrzavanjeRuta menuServiceId={menuServiceId} nivo={2} />,
        posta: <PoslovnaPostaRuta menuServiceId={menuServiceId} povratak={povratak} />,
        sabloni: <SabloniOdgovoraRuta menuServiceId={menuServiceId} />,
        brend: (
          <BrendNalog
            naziv={lokal}
            plan={plan}
            rezim={kontekst.mode}
            izgledHref={roleCan(actor, "menu.edit") ? `${panelSekcijaHref(slug, "editor")}?tab=izgled` : null}
            zatraziHref={zatraziPromenuHref(lokal)}
          />
        ),
      }}
    />
  );
}
