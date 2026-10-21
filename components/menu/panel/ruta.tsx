"use client";

// ScanMe Menu V1 — the route side of the client panel shell (K08). Connects
// the one shell query (convex/menuPanel.ts `shellContext`) and the active URL
// segment to the presentational shell, and hands plan and role to the section
// pages through context. Sign-in stays in the existing client panel: this
// route never shows a login form of its own (the auth flow is untouched).

import { useConvexAuth, useQuery } from "convex/react";
import { useSelectedLayoutSegment } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fmt } from "@/lib/i18n/format";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { MenuPanelSekcijaUPripremi } from "@/lib/i18n/types";
import type { MenuTier } from "@/lib/menu/capabilities";
import {
  klijentskiPanelHref,
  konobarskiPanelUlazHref,
  panelNavStavke,
  panelPristup,
  panelSekcijaHref,
  sekcijaIzSegmenta,
  sekcijaVidljiva,
} from "@/lib/menu/panel-nav";
import type { MenuActor } from "@/lib/menu/permissions";
import { SekcijaUPripremi } from "./sekcija";
import { MenuPanelShell } from "./shell";
import {
  PanelBezPristupa,
  PanelNeaktivan,
  PanelPrijava,
  PanelUcitavanje,
  SekcijaZabranjena,
} from "./stanja-panela";

/** K27 adds the service id (the section queries take it) and the venue name. */
type PanelKontekst = { slug: string; actor: MenuActor; plan: MenuTier; menuServiceId: Id<"menuServices">; lokal: string };

const Kontekst = createContext<PanelKontekst | null>(null);

/** Plan and role of the open panel, for the section pages under the shell. */
export function usePanelKontekst(): PanelKontekst {
  const vrednost = useContext(Kontekst);
  if (!vrednost) throw new Error("usePanelKontekst: outside MenuPanelRuta");
  return vrednost;
}

export function MenuPanelRuta({ slug, children }: { slug: string; children: ReactNode }) {
  const { isLoading } = useConvexAuth();
  const kontekst = useQuery(api.menuPanel.shellContext, isLoading ? "skip" : { slug });
  const aktivna = sekcijaIzSegmenta(useSelectedLayoutSegment());

  if (kontekst === undefined) return <PanelUcitavanje />;
  if (kontekst.status === "unauthenticated") {
    return <PanelPrijava prijavaHref={klijentskiPanelHref(slug)} konobarHref={konobarskiPanelUlazHref(slug)} />;
  }
  if (kontekst.status === "inactive") return <PanelNeaktivan klijentskiPanelHref={klijentskiPanelHref(slug)} />;

  const pristup = kontekst.status === "available" ? panelPristup(kontekst.actor) : null;
  if (kontekst.status === "forbidden" || pristup?.vrsta !== "panel") {
    return (
      <PanelBezPristupa
        klijentskiPanelHref={klijentskiPanelHref(slug)}
        konobarHref={konobarskiPanelUlazHref(slug)}
      />
    );
  }

  const { actor, plan, mode, business, menuServiceId } = kontekst;
  const uloga = menuDomenSr.roles[actor];
  return (
    <Kontekst.Provider value={{ slug, actor, plan, menuServiceId, lokal: business.name }}>
      <MenuPanelShell
        lokal={business.name}
        rezim={fmt(menuDomenSr.serviceLabel, { mode: menuDomenSr.modes[mode] })}
        premium={plan === "premium"}
        uloga={uloga}
        stavke={panelNavStavke(actor, (sekcija) => panelSekcijaHref(slug, sekcija))}
        aktivna={aktivna}
        klijentskiPanelHref={klijentskiPanelHref(slug)}
      >
        {aktivna && !sekcijaVidljiva(actor, aktivna) ? (
          <SekcijaZabranjena
            naslov={menuPanelSr.sekcije[aktivna]}
            uloga={uloga}
            pocetnaHref={panelSekcijaHref(slug, "pocetna")}
          />
        ) : (
          children
        )}
      </MenuPanelShell>
    </Kontekst.Provider>
  );
}

/** A section page whose screen is not built yet (K27–K30 replace these). */
export function PanelSekcija({ sekcija }: { sekcija: MenuPanelSekcijaUPripremi }) {
  const { slug, actor, plan } = usePanelKontekst();
  return (
    <SekcijaUPripremi
      sekcija={sekcija}
      plan={plan}
      actor={actor}
      editorHref={sekcijaVidljiva(actor, "editor") ? panelSekcijaHref(slug, "editor") : undefined}
    />
  );
}
