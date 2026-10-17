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

/**
 * The DEV passport simulation of this browser (lib/fair-passport-simulation.ts):
 * only in `next dev`, only for a stamp passport event, never in production.
 */
export async function fairPassportSimulation(eventSlug: string): Promise<{ config: FairPassportSimConfig; simulation: FairPassportSimulation } | null> {
  if (process.env.NODE_ENV !== "development") return null;
  if (fairEventPresentation(eventSlug).passportStyle !== "stamps") return null;
  const config = parseFairPassportSim((await cookies()).get(FAIR_PASSPORT_SIM_COOKIE)?.value);
  return config ? { config, simulation: buildFairPassportSimulation(config) } : null;
}
