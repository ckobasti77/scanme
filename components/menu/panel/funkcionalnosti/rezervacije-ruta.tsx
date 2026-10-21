"use client";

// ScanMe Menu V1 (K25) — the route side of Funkcionalnosti > Rezervacije. One
// subscription (convex/menuServices.ts `context`: the reservation settings and
// the service id), one mutation (`setReservations`). K27 mounts this inside the
// Funkcionalnosti section; the screen itself is presentational
// (rezervacije.tsx) and the izlog mounts it over an in-memory store.

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { menuDomenSr } from "@/lib/i18n/sr/menu-domen";
import { hasAnyHours } from "@/lib/menu/working-hours";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { SacuvajIshod } from "../cuvanje";
import { RezervacijeIzbor, type RezervacijeSacuvaj } from "./rezervacije";

export function RezervacijeRuta({
  slug,
  radnoVremeHref,
  nivo,
}: {
  slug: string;
  /** Podešavanja of this venue, where the working hours are entered. */
  radnoVremeHref: string;
  nivo?: 2 | 3;
}) {
  const { isLoading } = useConvexAuth();
  const kontekst = useQuery(api.menuServices.context, isLoading ? "skip" : { businessSlug: slug });
  const postavi = useMutation(api.menuServices.setReservations);
  const menuServiceId = kontekst?.menuServiceId;

  const onSacuvaj = useCallback<RezervacijeSacuvaj>(
    async (mode, contact, externalUrl): Promise<SacuvajIshod> => {
      if (!menuServiceId) return { ok: false, code: "mreza" };
      try {
        const ishod = await postavi({
          menuServiceId,
          mode,
          // Only what the chosen way uses; the server keeps the other value for next time.
          ...(mode === "form" ? { contact } : {}),
          ...(mode === "external" && externalUrl !== null ? { externalUrl } : {}),
        });
        return ishod.ok ? { ok: true } : { ok: false, code: ishod.code };
      } catch (error) {
        if (error instanceof ConvexError && typeof error.data === "string") return { ok: false, code: error.data };
        return { ok: false, code: "mreza" };
      }
    },
    [menuServiceId, postavi],
  );

  if (kontekst === undefined) return <UcitavanjeStanje oblik="forma" redova={3} />;
  if (kontekst === null) return <GreskaStanje nivo={3} />;

  const moze = kontekst.permissions.includes("features.edit");
  return (
    <RezervacijeIzbor
      config={kontekst.reservation}
      bezRadnogVremena={!hasAnyHours(kontekst.reservation.workingHours)}
      radnoVremeHref={radnoVremeHref}
      onSacuvaj={onSacuvaj}
      disabled={!moze}
      razlog={moze ? undefined : menuDomenSr.errors["menu/forbidden"]}
      nivo={nivo}
    />
  );
}
