import type { FairMapDict } from "@/lib/i18n/types";
import { fairMapSr } from "@/lib/i18n/sr/fair-map";

// Map-local typed extension while the parallel agent owns lib/i18n.
// Central dictionary integration is listed in the map handoff; no inline UI copy.
export type AmfMapDict = FairMapDict & {
  entranceShort: string;
  interestLabel: string;
  stampsShort: string;
  showStandShort: string;
};

export const amfMapSr: AmfMapDict = {
  ...fairMapSr,
  entranceShort: "Ulaz",
  searchLabel: "Pronađi brend ili izlagača",
  searchPlaceholder: "Brend ili izlagač",
  interestLabel: "Gužva",
  stampsShort: "Pečati",
  showStandShort: "Pronađi štand",
};
