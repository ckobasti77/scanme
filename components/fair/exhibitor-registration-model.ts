import type { FairExhibitorRegistrationConfig } from "@/lib/fair-exhibitor-registration";

export type ExhibitorVehicleDraft = {
  id: number;
  model: string;
  package: "" | "starter" | "advanced";
};

export const emptyExhibitorVehicle = (id: number): ExhibitorVehicleDraft => ({ id, model: "", package: "" });

/** Rows shown from the start, so a phone user never has to leave a field to reach the next one. */
export const MIN_EXHIBITOR_VEHICLE_ROWS = 2;

const hasContent = (vehicle: ExhibitorVehicleDraft) => !!vehicle.model.trim() || !!vehicle.package;

/**
 * Keeps at least MIN rows and exactly one empty row at the end: a new row
 * appears as soon as the last one gets a model or a package (while typing, no
 * blur needed), and surplus empty rows at the end are dropped.
 */
export function normalizeExhibitorVehicles(vehicles: ExhibitorVehicleDraft[], nextId: () => number) {
  const rows = [...vehicles];
  while (rows.length > MIN_EXHIBITOR_VEHICLE_ROWS && !hasContent(rows.at(-1)!) && !hasContent(rows.at(-2)!)) rows.pop();
  if (rows.length && hasContent(rows.at(-1)!)) rows.push(emptyExhibitorVehicle(nextId()));
  while (rows.length < MIN_EXHIBITOR_VEHICLE_ROWS) rows.push(emptyExhibitorVehicle(nextId()));
  return rows;
}

type FairTag = Pick<FairExhibitorRegistrationConfig, "slug" | "source" | "name" | "venue">;

export function exhibitorRegistrationSelection(vehicles: ExhibitorVehicleDraft[], fair: FairTag) {
  return {
    source: fair.source,
    eventSlug: fair.slug,
    vehicles: vehicles.filter((vehicle) => vehicle.model.trim()).map((vehicle) => ({
      model: vehicle.model.trim(), package: vehicle.package,
    })),
  };
}

export function exhibitorRegistrationMessage(vehicles: ExhibitorVehicleDraft[], fair: FairTag) {
  const selected = exhibitorRegistrationSelection(vehicles, fair).vehicles;
  const advancedCount = selected.filter((v) => v.package === "advanced").length;
  const starterCount = selected.filter((v) => v.package === "starter").length;
  const lines = selected.map((v, i) => {
    const pkg = v.package === "advanced" ? "Napredni (5.000 RSD)" : "Starter (3.000 RSD)";
    return `${i + 1}. ${v.model} — ${pkg}`;
  });
  return [
    `Sajam: ${[fair.name, fair.venue].filter(Boolean).join(" · ")}`,
    `Ukupno vozila: ${selected.length} (Napredni: ${advancedCount} · Starter: ${starterCount})`,
    ...lines,
  ].join("\n");
}

