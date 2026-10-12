import { adminEventsSr } from "@/lib/i18n/sr/admin-events";

// ADMIN v2 X3 — the parts of `Događaji → Analitika`, in the order of the page.
// The sidebar lists them as „Na ovoj strani“ and every chart carries its `id`.

const d = adminEventsSr.analytics;

export const ANALYTICS_ANCHORS = [
  { id: "brojevi", label: d.kpiTitle },
  { id: "uvidi", label: d.v2.insights.title },
  { id: "levak", label: d.v2.funnel.title },
  { id: "dubina", label: d.v2.depth.title },
  { id: "pasos", label: d.v2.passport.title },
  { id: "dan-sat", label: d.v2.matrix.title },
  { id: "rang-modela", label: d.v2.leaderboard.title },
  { id: "standovi", label: d.v2.stands.title },
  { id: "paketi", label: d.v2.packages.title },
  { id: "mapa", label: d.v2.heat.title },
  { id: "uredjaji", label: d.v2.devices.title },
] as const;
