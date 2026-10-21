"use client";

// ScanMe Menu V1 (K27) — Funkcionalnosti in the izlog: the real screen
// (components/menu/panel/funkcionalnosti/funkcionalnosti.tsx) over switches kept
// in memory. "Saving" takes 400 ms and applies the server's own rule for Room
// service (turning it on needs Premium); nothing is sent anywhere and a reload
// starts over. The reservation block is the K25 izlog block.

import { useCallback, useState } from "react";
import type { MenuTier } from "@/lib/menu/capabilities";
import type { PanelRezervacije } from "@/lib/menu/izlog-params";
import { roleCan, type MenuActor } from "@/lib/menu/permissions";
import type { SacuvajIshod } from "../panel/cuvanje";
import { Funkcionalnosti, type FunkcijaKljuc } from "../panel/funkcionalnosti/funkcionalnosti";
import { RezervacijeIzlog } from "./rezervacije-izlog";

/** How long the invented save takes, so the "Čuva se…" state can be seen. */
const TRAJANJE_CUVANJA_MS = 400;

export function FunkcionalnostiIzlog({
  plan,
  actor,
  rezervacije,
  bezRadnogVremena,
  radnoVremeHref,
}: {
  plan: MenuTier;
  actor: MenuActor;
  rezervacije: PanelRezervacije | null;
  bezRadnogVremena: boolean;
  radnoVremeHref: string;
}) {
  const premium = plan === "premium";
  const [features, setFeatures] = useState<Record<FunkcijaKljuc, boolean>>({
    callWaiter: true,
    billRequest: true,
    ordering: false,
    occupancy: false,
    roomService: premium,
  });

  const onPrebaci = useCallback(
    (feature: FunkcijaKljuc, enabled: boolean) =>
      new Promise<SacuvajIshod>((resolve) => {
        window.setTimeout(() => {
          if (enabled && feature === "roomService" && !premium) {
            resolve({ ok: false, code: "plan/premium_required" });
            return;
          }
          setFeatures((tekuce) => ({ ...tekuce, [feature]: enabled }));
          resolve({ ok: true });
        }, TRAJANJE_CUVANJA_MS);
      }),
    [premium],
  );

  return (
    <div data-funkcionalnosti-izlog="">
      <Funkcionalnosti
        mode="hospitality"
        features={features}
        roomServiceDostupan={premium}
        moze={roleCan(actor, "features.edit")}
        onPrebaci={onPrebaci}
        rezervacije={
          <RezervacijeIzlog
            rezervacije={rezervacije}
            bezRadnogVremena={bezRadnogVremena}
            radnoVremeHref={radnoVremeHref}
          />
        }
      />
    </div>
  );
}
