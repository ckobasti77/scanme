"use client";

// ScanMe Menu V1 (K27) — the screen "Funkcionalnosti" of the client panel (master
// §13.7; plan docs/meni/planovi/K24.md §4.5): what the guest can do from the
// menu. One switch per action, each in its own card with its own save cycle
// ("Čuva se…" → "Sačuvano." or the mapped error, the switch goes back). Changes
// are live at once and never wait for the menu's publication. The reservations
// block (K25) arrives as a slot and stands as its own group. Room service is
// Premium: locked with the reason on Standard, and a Standard account that still
// has it on may only turn it off. There is no sound setting here: the sound is
// the waiter panel's own choice. Presentational: the route
// (funkcionalnosti-ruta.tsx) and the izlog pass the state and `onPrebaci`.

import { CircleCheck, Lock } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import { modeSupportsFeature, type MenuMode } from "@/lib/menu/modes";
import { Napomena, PorukaGreske } from "../../lokal/zajednicko";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { Prekidac } from "../../zajednicko/prekidac";
import { StatusOznaka } from "../../zajednicko/status-oznaka";
import { ZaglavljeSaStatusom } from "../../zajednicko/zaglavlje-sa-statusom";
import { CuvanjeStatus, porukaKoda, useCuvanje, type SacuvajIshod } from "../cuvanje";

const t = menuPanelSr.funkcionalnosti;

export type FunkcijaKljuc = "callWaiter" | "billRequest" | "ordering" | "occupancy" | "roomService";

const GRUPA_GOST: readonly FunkcijaKljuc[] = ["callWaiter", "billRequest", "ordering"];
const GRUPA_OSOBLJE: readonly FunkcijaKljuc[] = ["occupancy"];
const GRUPA_POSEBNE: readonly FunkcijaKljuc[] = ["roomService"];

/** One switch in its own card. `ukljuceno` is the saved state; the card shows the wish while its save runs. */
function FunkcijaKartica({
  kljuc,
  ukljuceno,
  roomServiceDostupan,
  moze,
  nemaPravaId,
  onPrebaci,
}: {
  kljuc: FunkcijaKljuc;
  ukljuceno: boolean;
  roomServiceDostupan: boolean;
  moze: boolean;
  nemaPravaId: string;
  onPrebaci: (feature: FunkcijaKljuc, enabled: boolean) => Promise<SacuvajIshod>;
}) {
  const { faza, kod, pokreni } = useCuvanje();
  // The wish stays on screen after a save until the saved state itself changes (then the saved state wins).
  const [zeljeno, setZeljeno] = useState<boolean | null>(null);
  const [vidjenoUkljuceno, setVidjenoUkljuceno] = useState(ukljuceno);
  if (ukljuceno !== vidjenoUkljuceno) {
    setVidjenoUkljuceno(ukljuceno);
    setZeljeno(null);
  }
  const prikazano = zeljeno ?? ukljuceno;

  const premium = kljuc === "roomService";
  const zakljucano = premium && !roomServiceDostupan;
  // Locked: it cannot be turned on. Still on (the account lost Premium): it can only be turned off.
  const onemoguceno = !moze || (zakljucano && !ukljuceno);
  const opis = zakljucano ? (ukljuceno ? t.premium.samoIskljucivanje : t.premium.zakljucano) : t.stavke[kljuc].opis;
  const oznaka = premium ? (
    <StatusOznaka ton="neutralno" velicina="mala" ikonica={zakljucano ? Lock : CircleCheck}>
      {t.premium.oznaka}
    </StatusOznaka>
  ) : undefined;

  const prebaci = async (sledece: boolean) => {
    const ishod = await pokreni(() => {
      setZeljeno(sledece);
      return onPrebaci(kljuc, sledece);
    });
    if (ishod && !ishod.ok) setZeljeno(null);
  };

  return (
    <Kartica data-funkcija={kljuc}>
      <Prekidac
        naziv={t.stavke[kljuc].naziv}
        opis={opis}
        oznaka={oznaka}
        checked={prikazano}
        disabled={onemoguceno}
        aria-describedby={moze ? undefined : nemaPravaId}
        onChange={(event) => void prebaci(event.target.checked)}
      />
      {/* Idle, the live region takes no room (it keeps its place in the page; the text appears while saving). */}
      <div className="grid gap-2 pl-[3.75rem] has-[[data-cuvanje=mirno]]:gap-0 [&>[data-cuvanje=mirno]]:min-h-0">
        <CuvanjeStatus faza={faza} cuva={t.cuva} sacuvano={t.sacuvano} />
        {faza === "greska" && kod !== null ? <PorukaGreske>{porukaKoda(kod, t.greska)}</PorukaGreske> : null}
      </div>
    </Kartica>
  );
}

export function Funkcionalnosti({
  mode,
  features,
  roomServiceDostupan,
  moze,
  onPrebaci,
  rezervacije,
}: {
  mode: MenuMode;
  features: Record<FunkcijaKljuc, boolean>;
  /** The account has the Premium room service capability. */
  roomServiceDostupan: boolean;
  /** The role may change features (`features.edit`). */
  moze: boolean;
  onPrebaci: (feature: FunkcijaKljuc, enabled: boolean) => Promise<SacuvajIshod>;
  /** The K25 block; it is its own group and brings its own heading. */
  rezervacije: ReactNode;
}) {
  const nemaPravaId = useId();

  // A feature the mode does not support is not shown at all; a group left empty is not shown either.
  const grupa = (naslov: string, kljucevi: readonly FunkcijaKljuc[]) => {
    const vidljive = kljucevi.filter((kljuc) => modeSupportsFeature(mode, kljuc));
    if (vidljive.length === 0) return null;
    return (
      <OkvirSekcije naslov={naslov} nivo={2}>
        <div className="grid gap-3 xl:grid-cols-2">
          {vidljive.map((kljuc) => (
            <FunkcijaKartica
              key={kljuc}
              kljuc={kljuc}
              ukljuceno={features[kljuc]}
              roomServiceDostupan={roomServiceDostupan}
              moze={moze}
              nemaPravaId={nemaPravaId}
              onPrebaci={onPrebaci}
            />
          ))}
        </div>
      </OkvirSekcije>
    );
  };

  return (
    <div className="grid gap-6" data-funkcionalnosti="">
      <ZaglavljeSaStatusom naslov={menuPanelSr.sekcije.funkcionalnosti} opis={t.opis} />
      <div className="grid gap-3">
        <Napomena>{t.vaziOdmah}</Napomena>
        {moze ? null : (
          <div id={nemaPravaId}>
            <Napomena>{t.nemaPrava}</Napomena>
          </div>
        )}
      </div>
      {grupa(t.grupe.gost, GRUPA_GOST)}
      {modeSupportsFeature(mode, "reservations") ? rezervacije : null}
      {grupa(t.grupe.osoblje, GRUPA_OSOBLJE)}
      {grupa(t.grupe.posebne, GRUPA_POSEBNE)}
    </div>
  );
}
