import "server-only";

import { cookies } from "next/headers";
import {
  FAIR_PASSPORT_SIM_COOKIE,
  buildFairPassportSimulation,
  parseFairPassportSim,
  type FairPassportSimConfig,
  type FairPassportSimulation,
} from "@/lib/fair-passport-simulation";
import { fairEventPresentation } from "@/lib/fair-theme";
import { fairIsAdminRequest } from "./admin-session";

/** `next dev` and a stamp passport event: the only place the simulation exists. */
function simulationAllowed(eventSlug: string) {
  return process.env.NODE_ENV === "development" && fairEventPresentation(eventSlug).passportStyle === "stamps";
}

async function simulationConfig(): Promise<FairPassportSimConfig | null> {
  return parseFairPassportSim((await cookies()).get(FAIR_PASSPORT_SIM_COOKIE)?.value);
}

/**
 * The DEV passport simulation of this browser (lib/fair-passport-simulation.ts):
 * only in `next dev`, only for a stamp passport event, never in production.
 */
export async function fairPassportSimulation(eventSlug: string): Promise<{ config: FairPassportSimConfig; simulation: FairPassportSimulation } | null> {
  if (!simulationAllowed(eventSlug)) return null;
  const config = await simulationConfig();
  return config ? { config, simulation: buildFairPassportSimulation(config) } : null;
}

/**
 * The open DEV menu of the passport pages (no login, `next dev` only). A
 * signed-in admin already has the same section in the admin DEV sheet, so
 * the open menu is left out for them (one DEV tab on the page).
 */
export async function fairPassportSimulationMenu(eventSlug: string): Promise<{ current: FairPassportSimConfig | null } | null> {
  if (!simulationAllowed(eventSlug)) return null;
  if (await fairIsAdminRequest()) return null;
  return { current: await simulationConfig() };
}
