export type ExhibitorVehicleDraft = {
  id: number;
  model: string;
  package: "" | "starter" | "advanced";
};

export const emptyExhibitorVehicle = (id: number): ExhibitorVehicleDraft => ({ id, model: "", package: "" });

export function exhibitorRegistrationSelection(vehicles: ExhibitorVehicleDraft[]) {
  return {
    source: "amf-2026-exhibitor-registration",
    eventSlug: "auto-moto-fest-2026",
    vehicles: vehicles.filter((vehicle) => vehicle.model.trim()).map((vehicle) => ({
      model: vehicle.model.trim(), package: vehicle.package,
    })),
  };
}

export function exhibitorRegistrationMessage(vehicles: ExhibitorVehicleDraft[]) {
  const selected = exhibitorRegistrationSelection(vehicles).vehicles;
  const advancedCount = selected.filter((v) => v.package === "advanced").length;
  const starterCount = selected.filter((v) => v.package === "starter").length;
  const lines = selected.map((v, i) => {
    const pkg = v.package === "advanced" ? "Napredni (5.000 RSD)" : "Starter (3.000 RSD)";
    return `${i + 1}. ${v.model} — ${pkg}`;
  });
  return [
    `Ukupno vozila: ${selected.length} (Napredni: ${advancedCount} · Starter: ${starterCount})`,
    ...lines,
  ].join("\n");
}

