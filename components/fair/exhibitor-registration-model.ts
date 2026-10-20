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
