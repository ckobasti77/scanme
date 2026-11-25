import type { FairExhibitorRegistrationConfig } from "@/lib/fair-exhibitor-registration";

export type ExhibitorVehicleDraft = {
  id: number;
  model: string;
  package: "" | "starter" | "advanced";
};

export const emptyExhibitorVehicle = (id: number): ExhibitorVehicleDraft => ({ id, model: "", package: "" });

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

