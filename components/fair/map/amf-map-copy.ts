import type { FairMapDict } from "@/lib/i18n/types";
import { fairMapSr } from "@/lib/i18n/sr/fair-map";

// Map-local typed extension while the parallel agent owns lib/i18n.
// Central dictionary integration is listed in the map handoff; no inline UI copy.
export type AmfMapDict = FairMapDict & {
  entranceShort: string;
  vehiclesShort: string;
  interestLabel: string;
  heatServiceNote: string;
  heatServiceAria: string;
  noMeasurement: string;
};

export const amfMapSr: AmfMapDict = {
  ...fairMapSr,
  entranceShort: "Ulaz",
  vehiclesShort: "Vozila",
  interestLabel: "Veće interesovanje",
  heatServiceNote: "Narandžasto: ScanMe usluga. Sivo: bez merenja.",
  heatServiceAria: "Jača narandžasta znači više skeniranja kod izlagača sa ScanMe uslugom. Blaga narandžasta ostaje i bez skeniranja.",
  noMeasurement: "Bez ScanMe merenja",
};
