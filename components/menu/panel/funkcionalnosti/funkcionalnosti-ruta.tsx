"use client";

// ScanMe Menu V1 (K27) — the route side of Funkcionalnosti (master §13.7). One
// subscription (convex/menuServices.ts `context`: mode, switches, role and the
// Premium capability) and one mutation (`setFeature`, which throws a ConvexError
// with the machine code; here it becomes a value for the cards' save cycle). The
// reservations block is the K25 route, mounted as the screen's own group. The
// screen itself is presentational (funkcionalnosti.tsx); the izlog mounts it over
// an in-memory store.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { panelSekcijaHref } from "@/lib/menu/panel-nav";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { SacuvajIshod } from "../cuvanje";
import { usePanelKontekst } from "../ruta";
import { Funkcionalnosti, type FunkcijaKljuc } from "./funkcionalnosti";
import { RezervacijeRuta } from "./rezervacije-ruta";

const t = menuPanelSr.funkcionalnosti;

export function FunkcionalnostiRuta() {
  const { slug } = usePanelKontekst();
  const { isLoading } = useConvexAuth();
  const kontekst = useQuery(api.menuServices.context, isLoading ? "skip" : { businessSlug: slug });
  const postavi = useMutation(api.menuServices.setFeature);
  const menuServiceId = kontekst?.menuServiceId;

  const onPrebaci = useCallback(
    async (feature: FunkcijaKljuc, enabled: boolean): Promise<SacuvajIshod> => {
      if (!menuServiceId) return { ok: false, code: "mreza" };
      try {
        await postavi({ menuServiceId, feature, enabled });
        return { ok: true };
      } catch (error) {
        if (error instanceof ConvexError && typeof error.data === "string") return { ok: false, code: error.data };
        return { ok: false, code: "mreza" };
      }
    },
    [menuServiceId, postavi],
  );

  if (kontekst === undefined) return <UcitavanjeStanje oblik="forma" oznaka={t.ucitavanje} />;
  if (kontekst === null) return <GreskaStanje naslov={t.greskaNaslov} />;

  return (
    <Funkcionalnosti
      mode={kontekst.mode}
      features={kontekst.features}
      roomServiceDostupan={kontekst.capabilities.roomService}
      moze={kontekst.permissions.includes("features.edit")}
      onPrebaci={onPrebaci}
      rezervacije={<RezervacijeRuta slug={slug} radnoVremeHref={panelSekcijaHref(slug, "podesavanja")} nivo={2} />}
    />
  );
}
