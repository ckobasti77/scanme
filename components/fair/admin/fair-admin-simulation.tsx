"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FAIR_PASSPORT_SIM_BRANDS,
  FAIR_PASSPORT_SIM_MODELS,
  FAIR_PASSPORT_SIM_SEEDED_PREFIX,
  FAIR_PASSPORT_SIM_STATES,
  fairPassportSimCookie,
  serializeFairPassportSim,
  type FairPassportSimConfig,
  type FairPassportSimState,
} from "@/lib/fair-passport-simulation";
import { fmt } from "@/lib/i18n/format";
import type { FairAdminDevDict } from "@/lib/i18n";

// "Simulacija pasoša" in the admin DEV sheet: rendered only in `next dev` for
// a stamp passport event (fair-admin-tools.tsx). The choice is a cookie of this
// browser; the passport pages read it on the server (lib/fair-server/passport-simulation.ts).

const DEFAULT: FairPassportSimConfig = { brands: "all", models: "random", state: "mixed" };

/**
 * After the choice changed: a brand page may not exist in the new set (a
 * simulated brand after "off", or one left out by "Samo N"), so a brand
 * page goes back to the passport overview; any other page just refreshes.
 */
export function showSimulationChange(router: ReturnType<typeof useRouter>) {
  const overview = window.location.pathname.match(/^(\/sajam\/[^/]+\/pasosi)\/[^/]+\/?$/)?.[1];
  if (overview) router.replace(overview);
  else router.refresh();
}

export function FairAdminSimulation({ dict, current, onToast }: { dict: FairAdminDevDict; current: FairPassportSimConfig | null; onToast: (message: string) => void }) {
  const router = useRouter();
  const [choice, setChoice] = useState<FairPassportSimConfig>(current ?? DEFAULT);
  const stateName: Record<FairPassportSimState, string> = {
    start: dict.simStateStart,
    partial: dict.simStatePartial,
    new: dict.simStateNew,
    complete: dict.simStateComplete,
    mixed: dict.simStateMixed,
  };

  const apply = (config: FairPassportSimConfig | null) => {
    if (config) {
      // A fresh start for this choice: the passport pages seed it again.
      try {
        window.localStorage.removeItem(`${FAIR_PASSPORT_SIM_SEEDED_PREFIX}sim:${serializeFairPassportSim(config)}`);
      } catch {
        // Private mode: nothing was stored.
      }
    }
    document.cookie = fairPassportSimCookie(config);
    onToast(config ? dict.toastSimOn : dict.toastSimOff);
    showSimulationChange(router);
  };

  return (
    <section className="fair-admin-dev__sec">
      <h4>{dict.simTitle}</h4>
      <div className="fair-admin-dev__note" style={{ marginBottom: 8 }}>{dict.simNote}</div>
      <label className="fair-admin-dev__pick">
        <span>{dict.simBrands}</span>
        <select
          value={String(choice.brands)}
          onChange={(changeEvent) => {
            const value = changeEvent.target.value;
            setChoice({ ...choice, brands: value === "all" || value === "test" ? value : Number(value) });
          }}
        >
          <option value="all">{fmt(dict.simBrandsAll, { count: FAIR_PASSPORT_SIM_BRANDS.length })}</option>
          <option value="test">{dict.simBrandsTest}</option>
          {FAIR_PASSPORT_SIM_BRANDS.slice(0, -1).map((_, index) => (
            <option key={index} value={index + 1}>{fmt(dict.simBrandsSome, { count: index + 1 })}</option>
          ))}
        </select>
      </label>
      <div className="fair-admin-dev__pick">
        <span>{dict.simModels}</span>
        <div className="fair-admin-dev__seg">
          {FAIR_PASSPORT_SIM_MODELS.map((models) => (
            <button key={models} type="button" aria-pressed={choice.models === models} onClick={() => setChoice({ ...choice, models })}>
              {models === "random" ? dict.simModelsRandom : models}
            </button>
          ))}
        </div>
      </div>
      <label className="fair-admin-dev__pick">
        <span>{dict.simState}</span>
        <select value={choice.state} onChange={(changeEvent) => setChoice({ ...choice, state: changeEvent.target.value as FairPassportSimState })}>
          {FAIR_PASSPORT_SIM_STATES.map((state) => <option key={state} value={state}>{stateName[state]}</option>)}
        </select>
      </label>
      <div className="fair-admin-dev__grid">
        <button type="button" className="fair-admin-dev__btn" onClick={() => apply(choice)}>{dict.simApply}</button>
        {current ? <button type="button" className="fair-admin-dev__btn is-warn" onClick={() => apply(null)}>{dict.simOff}</button> : null}
      </div>
    </section>
  );
}
