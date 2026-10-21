"use client";

// ScanMe Menu V1 (K28) — Podešavanja in the izlog: the real section with every
// block over invented data ("Demo restoran"): working hours and the hold
// (K25 fixtures), languages (Standard: srpski + engleski, at the limit;
// Premium: four languages), the waiter panel's timing, the mailbox and the
// templates (K26 izlog blocks) and Brend i nalog. Saves succeed locally.

import { useState } from "react";
import { fixtureRadnoVreme, fixtureRezervacijeConfig } from "@/components/menu/fixtures/rezervacije";
import { RESERVATION_ERROR } from "@/lib/menu/errors/reservations";
import { MENU_PLAN_ERROR } from "@/lib/menu/errors/plan";
import type { IzlogOdgovor, IzlogPosta } from "@/lib/menu/izlog-params";
import type { MenuTier } from "@/lib/menu/capabilities";
import { MENU_PREMIUM, MENU_STANDARD } from "@/lib/menu/capabilities";
import { isValidWorkingHours, type WorkingHours } from "@/lib/menu/working-hours";
import { BrendNalog, zatraziPromenuHref } from "../panel/podesavanja/brend-nalog";
import { Jezici } from "../panel/podesavanja/jezici";
import { Podesavanja } from "../panel/podesavanja/podesavanja";
import { PragoviPanela } from "../panel/podesavanja/pragovi";
import { RadnoVreme } from "../panel/podesavanja/radno-vreme";
import { ZadrzavanjeRezervacije } from "../panel/podesavanja/zadrzavanje";
import { PostaIzlog, SabloniIzlog } from "./odgovor-izlog";

const OK = Promise.resolve({ ok: true as const });

export function PodesavanjaIzlog({
  plan,
  lokal,
  editorHref,
  bezRadnogVremena,
  posta,
  povratak,
  sablon,
  sabloniPrilagodjeni,
}: {
  plan: MenuTier;
  lokal: string;
  editorHref: string | null;
  bezRadnogVremena: boolean;
  posta: IzlogPosta;
  povratak: "povezano" | "greska" | null;
  sablon: Exclude<IzlogOdgovor, "druga"> | null;
  sabloniPrilagodjeni: boolean;
}) {
  const maxJezika = (plan === "premium" ? MENU_PREMIUM : MENU_STANDARD).maxLanguages;
  const [prevodi] = useState(() => (plan === "premium" ? ["en", "de", "it"] : ["en"]));
  const sacuvajRadnoVreme = (radnoVreme: WorkingHours) =>
    Promise.resolve(
      isValidWorkingHours(radnoVreme) ? { ok: true as const } : { ok: false as const, code: RESERVATION_ERROR.hoursInvalid },
    );
  const sacuvajJezike = (lista: string[]) =>
    Promise.resolve(
      lista.length + 1 > maxJezika ? { ok: false as const, code: MENU_PLAN_ERROR.languageLimit } : { ok: true as const },
    );

  return (
    <Podesavanja
      blokovi={{
        radnoVreme: (
          <RadnoVreme radnoVreme={bezRadnogVremena ? null : fixtureRadnoVreme()} onSacuvaj={sacuvajRadnoVreme} />
        ),
        jezici: <Jezici prevodi={prevodi} maxJezika={maxJezika} plan={plan} moze onSacuvaj={sacuvajJezike} />,
        konobar: <PragoviPanela prag={15} podsetnik={5} moze onSacuvaj={() => OK} />,
        zadrzavanje: (
          <ZadrzavanjeRezervacije minuta={fixtureRezervacijeConfig().holdMinutes} onSacuvaj={() => OK} />
        ),
        posta: <PostaIzlog posta={posta} povratak={povratak} />,
        sabloni: <SabloniIzlog prilagodjeni={sabloniPrilagodjeni} sablon={sablon} />,
        brend: (
          <BrendNalog
            naziv={lokal}
            plan={plan}
            rezim="hospitality"
            izgledHref={editorHref}
            zatraziHref={zatraziPromenuHref(lokal)}
          />
        ),
      }}
    />
  );
}
