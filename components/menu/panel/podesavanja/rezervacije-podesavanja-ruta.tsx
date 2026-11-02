"use client";

// ScanMe Menu V1 (K25) — the route side of the reservation settings in
// Podešavanja: Radno vreme and Zadržavanje rezervacije. Both read the one
// subscription convex/menuSettings.ts `workingHours` (Convex shares it) and
// write with `setWorkingHours` / `setReservationHold`, which refuse with a
// ConvexError(code). K28 mounts each block where the section wants it; the
// blocks are presentational (radno-vreme.tsx, zadrzavanje.tsx) and the izlog
// mounts them over an in-memory store. `menuServiceId` comes from the panel's
// context (menuServices.context).

import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GreskaStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import type { SacuvajIshod } from "../cuvanje";
import { RadnoVreme, type RadnoVremeSacuvaj } from "./radno-vreme";
import { ZadrzavanjeRezervacije, type ZadrzavanjeSacuvaj } from "./zadrzavanje";

type BlokProps = {
  menuServiceId: Id<"menuServices">;
  /** The role cannot edit settings. */
  disabled?: boolean;
  razlog?: string;
  nivo?: 2 | 3;
};

/** A mutation that throws ConvexError(code) as the value the blocks understand. */
async function ishod(rad: () => Promise<unknown>): Promise<SacuvajIshod> {
  try {
    await rad();
    return { ok: true };
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return { ok: false, code: error.data };
    return { ok: false, code: "mreza" };
  }
}

export function RadnoVremeRuta({ menuServiceId, disabled, razlog, nivo }: BlokProps) {
  const podaci = useQuery(api.menuSettings.workingHours, { menuServiceId });
  const postavi = useMutation(api.menuSettings.setWorkingHours);
  const onSacuvaj = useCallback<RadnoVremeSacuvaj>(
    (radnoVreme) => ishod(() => postavi({ menuServiceId, workingHours: radnoVreme })),
    [menuServiceId, postavi],
  );

  if (podaci === undefined) return <UcitavanjeStanje oblik="forma" redova={4} />;
  if (podaci === null) return <GreskaStanje nivo={3} />;
  return (
    <RadnoVreme
      radnoVreme={podaci.workingHours}
      onSacuvaj={onSacuvaj}
      disabled={disabled}
      razlog={razlog}
      nivo={nivo}
    />
  );
}

export function ZadrzavanjeRuta({ menuServiceId, disabled, razlog, nivo }: BlokProps) {
  const podaci = useQuery(api.menuSettings.workingHours, { menuServiceId });
  const postavi = useMutation(api.menuSettings.setReservationHold);
  const onSacuvaj = useCallback<ZadrzavanjeSacuvaj>(
    (minuta) => ishod(() => postavi({ menuServiceId, holdMinutes: minuta })),
    [menuServiceId, postavi],
  );

  if (podaci === undefined) return <UcitavanjeStanje oblik="forma" redova={1} />;
  if (podaci === null) return <GreskaStanje nivo={3} />;
  return (
    <ZadrzavanjeRezervacije
      minuta={podaci.holdMinutes}
      onSacuvaj={onSacuvaj}
      disabled={disabled}
      razlog={razlog}
      nivo={nivo}
    />
  );
}
